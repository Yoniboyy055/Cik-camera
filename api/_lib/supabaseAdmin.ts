import { createClient } from '@supabase/supabase-js';
import { requireEnv } from './env';

const supabaseUrl = requireEnv('SUPABASE_URL');
const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || 'captures';
