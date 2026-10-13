import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSellerProfileByUser } from "@/lib/db/repo";
import SituationsManager from "@/components/SituationsManager";

export default async function SituationsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/situations");
  const profile = await getSellerProfileByUser(sb, user.id);
  if (!profile) redirect("/onboarding");
  return <SituationsManager />;
}
