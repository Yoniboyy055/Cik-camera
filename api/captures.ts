import { randomUUID } from 'node:crypto';
import { requireSession, type SessionUser } from './_lib/auth.js';
import { badRequest, forbidden, methodNotAllowed, readBody, serverError } from './_lib/http.js';
import { enforceRateLimit } from './_lib/rateLimit.js';
import { getSupabaseAdmin, getStorageBucket } from './_lib/supabaseAdmin.js';
import { asObject, optionalNumber, optionalString, ValidationError } from './_lib/validation.js';
import { canActOnProject, resolveWorkspaceContext } from './_lib/workspace.js';

interface CreateCaptureBody {
  user_id?: string;
  project_id?: string;
  package_id?: string;
  requirement_id?: string;
  note?: string;
  measurement?: string;
  unit?: string;
  latitude?: number;
  longitude?: number;
  gps_accuracy_m?: number;
  altitude_m?: number;
  address?: string;
  evidence_sha256?: string;
  capture_source?: 'worker' | 'supervisor';
  photo_data?: string;
  storage_path?: string;
  photo_url?: string;
}

function decodeBase64Image(input: string): Buffer {
  const cleaned = input.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(cleaned, 'base64');
}

async function uploadPhoto(workspaceId: string, packageId: string | undefined, captureId: string, photoData: string) {
  const supabase = getSupabaseAdmin();
  const imageBuffer = decodeBase64Image(photoData);
  const pathPrefix = packageId || 'unpackaged';
  const objectPath = `${workspaceId}/${pathPrefix}/${captureId}.jpg`;

  const { error } = await supabase.storage
    .from(getStorageBucket())
    .upload(objectPath, imageBuffer, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(getStorageBucket()).getPublicUrl(objectPath);
  return { publicUrl: data.publicUrl, objectPath };
}

async function fetchCaptureRows(user: SessionUser) {
  const supabase = getSupabaseAdmin();
  const workspace = await resolveWorkspaceContext(supabase, user);

  let query = supabase
    .from('captures')
    .select('*')
    .eq('workspace_id', workspace.workspaceId)
    .order('created_at', { ascending: false });

  if (workspace.role !== 'supervisor' && workspace.role !== 'admin' && workspace.role !== 'owner') {
    query = query.eq('user_id', user.id);
  }

  const { data: captures, error } = await query;

  if (error) {
    throw error;
  }

  const captureRows = captures || [];
  const userIds = [...new Set(captureRows.map((row) => row.user_id).filter(Boolean))];
  const projectIds = [...new Set(captureRows.map((row) => row.project_id).filter(Boolean))];
  const requirementIds = [...new Set(captureRows.map((row) => row.requirement_id).filter(Boolean))];
  const packageIds = [...new Set(captureRows.map((row) => row.package_id).filter(Boolean))];

  const [usersRes, projectsRes, requirementsRes, packagesRes] = await Promise.all([
    userIds.length
      ? supabase.from('users').select('id, name').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? supabase.from('projects').select('id, name').eq('workspace_id', workspace.workspaceId).in('id', projectIds)
      : Promise.resolve({ data: [], error: null }),
    requirementIds.length
      ? supabase
          .from('task_template_requirements')
          .select('id, label')
          .eq('workspace_id', workspace.workspaceId)
          .in('id', requirementIds)
      : Promise.resolve({ data: [], error: null }),
    packageIds.length
      ? supabase
          .from('capture_packages')
          .select('id, task_template_id, custom_project_name, custom_task_text')
          .eq('workspace_id', workspace.workspaceId)
          .in('id', packageIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (usersRes.error) {
    throw usersRes.error;
  }
  if (projectsRes.error) {
    throw projectsRes.error;
  }
  if (requirementsRes.error) {
    throw requirementsRes.error;
  }
  if (packagesRes.error) {
    throw packagesRes.error;
  }

  const templateIds = [...new Set((packagesRes.data || []).map((row) => row.task_template_id).filter(Boolean))];
  const templatesRes = templateIds.length
    ? await supabase.from('task_templates').select('id, name').eq('workspace_id', workspace.workspaceId).in('id', templateIds)
    : { data: [], error: null };

  if (templatesRes.error) {
    throw templatesRes.error;
  }

  const usersById = new Map((usersRes.data || []).map((row) => [row.id, row.name]));
  const projectsById = new Map((projectsRes.data || []).map((row) => [row.id, row.name]));
  const requirementsById = new Map((requirementsRes.data || []).map((row) => [row.id, row.label]));
  const packagesById = new Map((packagesRes.data || []).map((row) => [row.id, row]));
  const templatesById = new Map((templatesRes.data || []).map((row) => [row.id, row.name]));

  return captureRows.map((row) => {
    const pkgRow: any = row.package_id ? packagesById.get(row.package_id) : null;
    const templateId = pkgRow?.task_template_id ?? null;
    return {
      ...row,
      user_name: row.user_id ? usersById.get(row.user_id) || null : null,
      project_name: row.project_id ? projectsById.get(row.project_id) || null : (pkgRow?.custom_project_name || null),
      requirement_label: row.requirement_id ? requirementsById.get(row.requirement_id) || null : null,
      template_name: templateId ? templatesById.get(templateId) || null : (pkgRow?.custom_task_text || null),
    };
  });
}

export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    if (!enforceRateLimit(req, res, 'captures:read', 120, 60 * 1000)) {
      return;
    }

    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    try {
      const rows = await fetchCaptureRows(session);
      return res.status(200).json(rows);
    } catch (error) {
      return serverError(res, error);
    }
  }

  if (req.method === 'POST') {
    if (!enforceRateLimit(req, res, 'captures:create', 60, 60 * 1000)) {
      return;
    }

    const session = requireSession(req, res);
    if (!session) {
      return;
    }

    try {
      const supabase = getSupabaseAdmin();
      const body = asObject(readBody<CreateCaptureBody>(req));
      const workspace = await resolveWorkspaceContext(supabase, session);

      const id = randomUUID();
      let photoUrl = '';
      let storagePath: string | null = null;
      const normalizedProjectId = optionalString(body.project_id, 'project_id', { allowNull: true }) ?? null;
      const normalizedPackageIdRaw = optionalString(body.package_id, 'package_id', { allowNull: true }) ?? null;
      const normalizedPackageId = normalizedPackageIdRaw?.startsWith('local-') ? null : normalizedPackageIdRaw;
      const normalizedRequirementId =
        typeof body.requirement_id === 'string' && body.requirement_id !== 'quick-capture'
          ? body.requirement_id.trim()
          : null;

      const submittedStoragePath = optionalString(body.storage_path, 'storage_path', { allowNull: true, max: 600 }) ?? null;
      const submittedPhotoUrl = optionalString(body.photo_url, 'photo_url', { allowNull: true, max: 1200 }) ?? null;
      const photoData = optionalString(body.photo_data, 'photo_data', { allowNull: true });
      if (!submittedStoragePath && !photoData) {
        return badRequest(res, 'Either storage_path or photo_data is required');
      }

      if (normalizedProjectId) {
        const { data: project } = await supabase
          .from('projects')
          .select('id')
          .eq('id', normalizedProjectId)
          .eq('workspace_id', workspace.workspaceId)
          .maybeSingle();

        if (!project) {
          return badRequest(res, 'project_id not found in active workspace');
        }

        const canAct = await canActOnProject(supabase, workspace, normalizedProjectId);
        if (!canAct) {
          return forbidden(res, 'You are not assigned to this project');
        }
      }

      if (normalizedPackageId && workspace.role !== 'supervisor' && workspace.role !== 'admin' && workspace.role !== 'owner') {
        const { data: pkg } = await supabase
          .from('capture_packages')
          .select('id, user_id')
          .eq('id', normalizedPackageId)
          .eq('workspace_id', workspace.workspaceId)
          .maybeSingle();
        if (!pkg || pkg.user_id !== session.id) {
          return forbidden(res, 'You do not have access to this package');
        }
      }

      if (submittedStoragePath) {
        if (!submittedStoragePath.startsWith(`${workspace.workspaceId}/`)) {
          return badRequest(res, 'storage_path is outside the active workspace namespace');
        }
        storagePath = submittedStoragePath;
        if (submittedPhotoUrl) {
          photoUrl = submittedPhotoUrl;
        } else {
          const { data } = supabase.storage.from(getStorageBucket()).getPublicUrl(submittedStoragePath);
          photoUrl = data.publicUrl;
        }
      } else if (photoData) {
        const uploaded = await uploadPhoto(workspace.workspaceId, normalizedPackageId || undefined, id, photoData);
        photoUrl = uploaded.publicUrl;
        storagePath = uploaded.objectPath;
      }

      const latitude = optionalNumber(body.latitude, 'latitude');
      const longitude = optionalNumber(body.longitude, 'longitude');
      const gpsAccuracy = optionalNumber(body.gps_accuracy_m, 'gps_accuracy_m');
      const altitude = optionalNumber(body.altitude_m, 'altitude_m');
      const captureSource = session.role === 'supervisor' ? 'supervisor' : 'worker';

      const insertPayload: Record<string, unknown> = {
        id,
        package_id: normalizedPackageId,
        requirement_id: normalizedRequirementId,
        user_id: session.id,
        project_id: normalizedProjectId,
        note: optionalString(body.note, 'note', { allowNull: true, max: 2000 }) ?? null,
        measurement: optionalString(body.measurement, 'measurement', { allowNull: true, max: 100 }) ?? null,
        unit: optionalString(body.unit, 'unit', { allowNull: true, max: 50 }) ?? null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        address: optionalString(body.address, 'address', { allowNull: true, max: 500 }) ?? null,
        evidence_sha256: optionalString(body.evidence_sha256, 'evidence_sha256', { allowNull: true, max: 128 }) ?? null,
        capture_source: captureSource,
        workspace_id: workspace.workspaceId,
        storage_path: storagePath,
        report_state: storagePath ? 'uploaded_to_storage' : 'metadata_saved',
        photo_url: photoUrl,
        status: 'uploaded',
      };

      if (typeof gpsAccuracy === 'number') {
        insertPayload.gps_accuracy_m = gpsAccuracy;
      }
      if (typeof altitude === 'number') {
        insertPayload.altitude_m = altitude;
      }

      const { error } = await supabase.from('captures').insert(insertPayload);

      if (error) {
        return serverError(res, error);
      }

      console.info('[capture:create]', {
        capture_id: id,
        workspace_id: workspace.workspaceId,
        storage_path: storagePath,
        report_state: storagePath ? 'uploaded_to_storage' : 'metadata_saved',
      });

      return res.status(200).json({ success: true, id });
    } catch (error) {
      if (error instanceof ValidationError) {
        return badRequest(res, error.message);
      }
      return serverError(res, error);
    }
  }

  return methodNotAllowed(res, ['GET', 'POST']);
}
