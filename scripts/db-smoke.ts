// Integration smoke test: sign in as a real user and exercise the hotnow schema
// through RLS (schema exposure + auth.uid() policies + writes).
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

(async () => {
  const sb = createClient(url, anon, { db: { schema: "hotnow" }, auth: { persistSession: false } });

  const email = "demo+test2@hotnow.co";
  const { data: auth, error: signInErr } = await sb.auth.signInWithPassword({ email, password: "hotnow12345" });
  if (signInErr) throw new Error("sign-in failed: " + signInErr.message);
  console.log("signed in as", auth.user?.id);

  // insert a seller profile as this user (RLS: user_id = auth.uid())
  const ins = await sb.from("seller_profiles").insert({ user_id: auth.user!.id, domain: "smoke-test.com", company_name: "Smoke Test" }).select("id").single();
  if (ins.error) throw new Error("insert blocked: " + ins.error.message);
  console.log("inserted seller_profile", ins.data.id);

  // read it back
  const sel = await sb.from("seller_profiles").select("id, domain, company_name").eq("id", ins.data.id).single();
  if (sel.error) throw new Error("select failed: " + sel.error.message);
  console.log("read back:", sel.data);

  // cleanup
  const del = await sb.from("seller_profiles").delete().eq("id", ins.data.id);
  if (del.error) throw new Error("delete failed: " + del.error.message);
  console.log("cleaned up. RLS + hotnow schema + writes all OK ✅");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
