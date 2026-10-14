// Owner-only operations console, deliberately OUTSIDE /dashboard (the dashboard
// layout forces users without a seller profile into onboarding, and the owner
// account may not have one). Gated server-side by email allowlist (lib/admin).

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import AdminClient from "./AdminClient";

export const metadata = { title: "Admin · HotNow" };

export default async function AdminPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdmin(user.email)) redirect("/dashboard");
  return <AdminClient email={user.email ?? ""} />;
}
