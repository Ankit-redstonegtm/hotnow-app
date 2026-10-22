import { createClient as createSbClient, SupabaseClient } from "@supabase/supabase-js";
import { DB_SCHEMA } from "./schema";
import { cloudFetch } from "./fetch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any, any, any>;

/**
 * Service-role client - bypasses RLS. Server-only, used by the discovery worker
 * to write companies/candidates/opportunities when there is no user session.
 * NEVER import this into client code.
 */
let admin: AnyClient | null = null;
export function createAdminClient(): AnyClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  if (!admin) {
    admin = createSbClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
      db: { schema: DB_SCHEMA },
      global: { fetch: cloudFetch },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
