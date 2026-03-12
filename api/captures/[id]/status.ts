import { methodNotAllowed, readBody, serverError } from '../../_lib/http';
import { supabaseAdmin } from '../../_lib/supabaseAdmin';

interface StatusBody {
  status?: string;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'PATCH') {
    return methodNotAllowed(res, ['PATCH']);
  }

  const idParam = req.query?.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;

  if (!id) {
    return res.status(400).json({ error: 'Capture id is required' });
  }

  try {
    const body = readBody<StatusBody>(req);
    const status = body.status;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const { data: updatedCaptureRows, error: captureError } = await supabaseAdmin
      .from('captures')
      .update({ status })
      .eq('id', id)
      .select('id');

    if (captureError) {
      return serverError(res, captureError);
    }

    if ((updatedCaptureRows || []).length > 0) {
      return res.status(200).json({ success: true });
    }

    const { error: packageError } = await supabaseAdmin
      .from('capture_packages')
      .update({ status })
      .eq('id', id);

    if (packageError) {
      return serverError(res, packageError);
    }

    const { error: packageCapturesError } = await supabaseAdmin
      .from('captures')
      .update({ status })
      .eq('package_id', id);

    if (packageCapturesError) {
      return serverError(res, packageCapturesError);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return serverError(res, error);
  }
}
