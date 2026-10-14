import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSellerProfileByUser } from "@/lib/db/repo";
import AppShell from "@/components/AppShell";
import { ToastProvider } from "@/components/ui/Toast";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");
  const profile = await getSellerProfileByUser(sb, user.id);
  if (!profile) redirect("/onboarding");
  return (
    <ToastProvider>
      <AppShell companyName={profile.company_name ?? profile.domain} userEmail={user.email ?? ""}>
        {children}
      </AppShell>
    </ToastProvider>
  );
}
