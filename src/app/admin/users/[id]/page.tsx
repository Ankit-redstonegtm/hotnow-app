import Link from "next/link";
import { loadAdminUser } from "@/lib/admin/data";
import { formatCount, formatWhen } from "@/lib/admin/format";
import { JobsTable } from "../../ui";

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadAdminUser(id);
  const { user } = data;
  return (
    <div>
      <Link href="/admin" className="text-sm" style={{ color: "var(--muted)" }}>← Admin</Link>
      <div className="mt-2 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight break-all">{user.email}</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Enrichment jobs, newest first.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Field label="Signed up" value={formatWhen(user.signedUp)} />
        <Field label="Last sign-in" value={formatWhen(user.lastSignIn)} />
        <Field label="Onboarding" value={user.onboarding} />
        <Field label="Seller domain" value={user.domains} />
        <Field label="Runs" value={formatCount(user.runs)} />
        <Field label="Leads delivered" value={formatCount(user.leads)} />
        <Field label="Slack" value={user.slackConnected ? "Connected" : "Not connected"} />
      </div>
      <h2 className="font-semibold mb-3">Job timeline</h2>
      {data.jobsTruncated ? <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>Showing the latest 200 jobs.</p> : null}
      <JobsTable jobs={data.jobs} showUser={false} empty="No jobs for this user." />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="text-sm font-semibold mt-1 break-words">{value}</p>
    </div>
  );
}
