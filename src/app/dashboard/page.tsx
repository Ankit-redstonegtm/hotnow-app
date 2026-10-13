import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSellerProfileByUser } from "@/lib/db/repo";
import Dashboard from "@/components/Dashboard";

export default async function DashboardPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");
  const profile = await getSellerProfileByUser(sb, user.id);
  if (!profile) redirect("/onboarding");
  return <Dashboard companyName={profile.company_name ?? profile.domain} />;
}
