import { randomUUID } from 'node:crypto';
import { methodNotAllowed, readBody, serverError } from './_lib/http';
import { storageBucket, supabaseAdmin } from './_lib/supabaseAdmin';

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
  address?: string;
  photo_data?: string;
}

function decodeBase64Image(input: string): Buffer {
  const cleaned = input.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(cleaned, 'base64');
}

async function uploadPhoto(packageId: string | undefined, captureId: string, photoData: string) {
  const imageBuffer = decodeBase64Image(photoData);
  const pathPrefix = packageId || 'unpackaged';
  const objectPath = `${pathPrefix}/${captureId}.jpg`;

  const { error } = await supabaseAdmin.storage
    .from(storageBucket)
    .upload(objectPath, imageBuffer, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) {
    throw error;
  }

  const { data } = supabaseAdmin.storage.from(storageBucket).getPublicUrl(objectPath);
  return data.publicUrl;
}

async function fetchCaptureRows() {
  const { data: captures, error } = await supabaseAdmin
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
      ? supabaseAdmin.from('users').select('id, name').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? supabaseAdmin.from('projects').select('id, name').in('id', projectIds)
      : Promise.resolve({ data: [], error: null }),
    requirementIds.length
      ? supabaseAdmin.from('task_template_requirements').select('id, label').in('id', requirementIds)
      : Promise.resolve({ data: [], error: null }),
    packageIds.length
      ? supabaseAdmin.from('capture_packages').select('id, task_template_id').in('id', packageIds)
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
    ? await supabaseAdmin.from('task_templates').select('id, name').in('id', templateIds)
    : { data: [], error: null };

  if (templatesRes.error) {
    throw templatesRes.error;
  }

  const usersById = new Map((usersRes.data || []).map((row) => [row.id, row.name]));
  const projectsById = new Map((projectsRes.data || []).map((row) => [row.id, row.name]));
  const requirementsById = new Map((requirementsRes.data || []).map((row) => [row.id, row.label]));
  const packagesById = new Map((packagesRes.data || []).map((row) => [row.id, row.task_template_id]));
  const templatesById = new Map((templatesRes.data || []).map((row) => [row.id, row.name]));

  return captureRows.map((row) => {
    const templateId = row.package_id ? packagesById.get(row.package_id) : null;
    return {
      ...row,
      user_name: row.user_id ? usersById.get(row.user_id) || null : null,
      project_name: row.project_id ? projectsById.get(row.project_id) || null : null,
      requirement_label: row.requirement_id ? requirementsById.get(row.requirement_id) || null : null,
      template_name: templateId ? templatesById.get(templateId) || null : null,
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
      const body = readBody<CreateCaptureBody>(req);

      if (!body.user_id || !body.project_id || !body.package_id) {
        return res.status(400).json({ error: 'user_id, project_id, and package_id are required' });
      }

      const id = randomUUID();
      let photoUrl = '';
      const normalizedRequirementId =
        body.requirement_id && body.requirement_id !== 'quick-capture'
          ? body.requirement_id
          : null;

      if (body.photo_data) {
        photoUrl = await uploadPhoto(body.package_id, id, body.photo_data);
      }

      const { error } = await supabaseAdmin.from('captures').insert({
        id,
        package_id: body.package_id,
        requirement_id: normalizedRequirementId,
        user_id: body.user_id,
        project_id: body.project_id,
        note: body.note || null,
        measurement: body.measurement || null,
        unit: body.unit || null,
        latitude: body.latitude || null,
        longitude: body.longitude || null,
        address: body.address || null,
        photo_url: photoUrl,
        status: 'uploaded',
      });

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
