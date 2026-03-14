import { randomUUID } from 'node:crypto';
import { methodNotAllowed, readBody, serverError } from './_lib/http.js';
import { getSupabaseAdmin, getStorageBucket } from './_lib/supabaseAdmin.js';

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
}

function normalizeNullableText(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function decodeBase64Image(input: string): Buffer {
  const cleaned = input.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(cleaned, 'base64');
}

async function uploadPhoto(packageId: string | undefined, captureId: string, photoData: string) {
  const supabase = getSupabaseAdmin();
  const imageBuffer = decodeBase64Image(photoData);
  const pathPrefix = packageId || 'unpackaged';
  const objectPath = `${pathPrefix}/${captureId}.jpg`;

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
  return data.publicUrl;
}

async function fetchCaptureRows() {
  const supabase = getSupabaseAdmin();

  const { data: captures, error } = await supabase
    .from('captures')
    .select('*')
    .order('created_at', { ascending: false });

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
      ? supabase.from('projects').select('id, name').in('id', projectIds)
      : Promise.resolve({ data: [], error: null }),
    requirementIds.length
      ? supabase.from('task_template_requirements').select('id, label').in('id', requirementIds)
      : Promise.resolve({ data: [], error: null }),
    packageIds.length
      ? supabase.from('capture_packages').select('id, task_template_id, custom_project_name, custom_task_text').in('id', packageIds)
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
    ? await supabase.from('task_templates').select('id, name').in('id', templateIds)
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
    try {
      const rows = await fetchCaptureRows();
      return res.status(200).json(rows);
    } catch (error) {
      return serverError(res, error);
    }
  }

  if (req.method === 'POST') {
    try {
      const supabase = getSupabaseAdmin();
      const body = readBody<CreateCaptureBody>(req);

      if (!body.user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      const id = randomUUID();
      let photoUrl = '';
      const normalizedProjectId = normalizeNullableText(body.project_id);
      const normalizedPackageIdRaw = normalizeNullableText(body.package_id);
      const normalizedPackageId = normalizedPackageIdRaw?.startsWith('local-') ? null : normalizedPackageIdRaw;
      const normalizedRequirementId =
        body.requirement_id && body.requirement_id !== 'quick-capture'
          ? body.requirement_id
          : null;

      if (body.photo_data) {
        photoUrl = await uploadPhoto(normalizedPackageId || undefined, id, body.photo_data);
      }

      const insertPayload: Record<string, unknown> = {
        id,
        package_id: normalizedPackageId,
        requirement_id: normalizedRequirementId,
        user_id: body.user_id,
        project_id: normalizedProjectId,
        note: normalizeNullableText(body.note),
        measurement: normalizeNullableText(body.measurement),
        unit: normalizeNullableText(body.unit),
        latitude: body.latitude || null,
        longitude: body.longitude || null,
        address: normalizeNullableText(body.address),
        evidence_sha256: normalizeNullableText(body.evidence_sha256),
        capture_source: body.capture_source === 'supervisor' ? 'supervisor' : 'worker',
        photo_url: photoUrl,
        status: 'uploaded',
      };

      if (typeof body.gps_accuracy_m === 'number') {
        insertPayload.gps_accuracy_m = body.gps_accuracy_m;
      }
      if (typeof body.altitude_m === 'number') {
        insertPayload.altitude_m = body.altitude_m;
      }

      const { error } = await supabase.from('captures').insert(insertPayload);

      if (error) {
        return serverError(res, error);
      }

      return res.status(200).json({ success: true, id });
    } catch (error) {
      return serverError(res, error);
    }
  }

  return methodNotAllowed(res, ['GET', 'POST']);
}
