import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Onboarding from "@/components/Onboarding";

export default async function OnboardingPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");
  return <Onboarding />;
}
