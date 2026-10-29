import { loadAdminHome } from "@/lib/admin/data";
import { formatCount } from "@/lib/admin/format";
import { JobsTable, Stat, UsersTable, creditHint, money } from "./ui";

export default async function AdminPage() {
  const data = await loadAdminHome();
  const { totals } = data;
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Signups, enrichment jobs, and recorded spend.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Stat label="Signups" value={formatCount(totals.signups)} />
        <Stat label="Signups in the last 7 days" value={formatCount(totals.signups7d)} />
        <Stat label="Jobs run" value={formatCount(totals.jobsRun)} />
        <Stat label="Failed jobs in the last 7 days" value={formatCount(totals.failedJobs7d)} />
        <Stat label="Parallel spend" value={money(totals.parallelSpend)} hint="Estimated from recorded discovery runs" />
        <Stat label="Prospeo/Blitz credits" value={formatCount(totals.credits.total)} hint={creditHint(totals.credits)} />
      </div>

      <h2 className="font-semibold mt-8 mb-3">Users</h2>
      <UsersTable users={data.users} />

      <h2 className="font-semibold mt-8 mb-3">Recent jobs</h2>
      <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>The last 50 jobs. Failed rows are highlighted.</p>
      <JobsTable jobs={data.jobs} showUser />
    </div>
  );
}
