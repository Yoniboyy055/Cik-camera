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
  const packageId = Array.isArray(idParam) ? idParam[0] : idParam;

  if (!packageId) {
    return res.status(400).json({ error: 'Package id is required' });
  }

  try {
    const body = readBody<StatusBody>(req);
    const status = body.status;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const { error: packageError } = await supabaseAdmin
      .from('capture_packages')
      .update({ status })
      .eq('id', packageId);

    if (packageError) {
      return serverError(res, packageError);
    }

    const { error: capturesError } = await supabaseAdmin
      .from('captures')
      .update({ status })
      .eq('package_id', packageId);

    if (capturesError) {
      return serverError(res, capturesError);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return serverError(res, error);
  }
}
