import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
config({ path: '.env.local', quiet: true });
const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'PARALLEL_API_KEY', 'BLITZ_API_KEY'];
const missing = required.filter(key => !process.env[key]);
for (const key of required) console.log(`${process.env[key] ? 'SET' : 'MISSING'} ${key}`);
if (missing.length) { process.exitCode = 1; }
if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      db: { schema: process.env.HOTNOW_DB_SCHEMA || 'hotnow' }, auth: { persistSession: false },
    });
    for (const table of ['seller_profiles', 'buying_situations', 'icp_constraints', 'discovery_runs', 'companies', 'opportunities', 'evidence', 'contacts', 'contact_sourcing', 'lists', 'list_items', 'prewarm_research', 'delivery_connections', 'delivery_secrets']) {
      const { error } = await sb.from(table).select('*', { head: true }).limit(1);
      if (error) { console.log(`FAIL ${table}: ${error.code || 'connection error'} (check migration and exposed schema)`); process.exitCode = 1; }
      else console.log(`OK ${table}`);
    }
  } catch { console.log('FAIL Supabase connection: check the project URL, key, and network.'); process.exitCode = 1; }
}
console.log('Provider credentials are checked for presence only. No paid research or contact calls were made.');
