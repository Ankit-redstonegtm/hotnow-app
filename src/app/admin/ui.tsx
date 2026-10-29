import Link from "next/link";
import { formatCount, formatDuration, formatUsd, formatWhen, jobStatusLabel, jobTypeLabel } from "@/lib/admin/format";
import type { AdminJobRow, AdminUserRow } from "@/lib/admin/data";
import type { CreditTotals } from "@/lib/admin/credits";

export function Stat({ label, value, hint, small }: { label: string; value: string; hint?: string; small?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs" style={{ color: "var(--muted)" }}>{label}</p>
      <p className={small ? "text-lg font-semibold mt-1" : "text-2xl font-semibold mt-1 tabular-nums"}>{value}</p>
      {hint ? <p className="text-xs mt-1" style={{ color: "var(--faint)" }}>{hint}</p> : null}
    </div>
  );
}

export function creditHint(credits: CreditTotals): string {
  if (credits.prospeo > 0 || credits.blitz > 0) {
    const parts = [`Prospeo ${formatCount(credits.prospeo)}`, `Blitz ${formatCount(credits.blitz)}`];
    if (credits.other > 0) parts.push(`Other ${formatCount(credits.other)}`);
    return parts.join(", ");
  }
  return "Recorded on enrichment jobs";
}

function Status({ status }: { status: string }) {
  const failed = status === "failed";
  return <span className={failed ? "chip" : "pill"}>{jobStatusLabel(status)}</span>;
}

export function JobsTable({ jobs, showUser, empty = "No jobs yet" }: { jobs: AdminJobRow[]; showUser: boolean; empty?: string }) {
  if (!jobs.length) {
    return <div className="card p-10 text-center"><p className="font-medium">{empty}</p></div>;
  }
  return (
    <div className="card overflow-x-auto">
      <table className="tbl">
        <caption className="sr-only">Jobs</caption>
        <thead>
          <tr>
            {showUser ? <th scope="col">User</th> : null}
            <th scope="col">Workspace</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
            <th scope="col">Started</th>
            <th scope="col">Duration</th>
            <th scope="col">Credits</th>
            <th scope="col">Error</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id} style={job.status === "failed" ? { background: "var(--accent-soft)" } : undefined}>
              {showUser ? <td>{job.userId ? <Link href={`/admin/users/${job.userId}`} className="font-medium">{job.email}</Link> : job.email}</td> : null}
              <td>{job.domain}</td>
              <td>{jobTypeLabel(job.kind)}</td>
              <td><Status status={job.status} /></td>
              <td className="whitespace-nowrap">{formatWhen(job.started)}</td>
              <td className="whitespace-nowrap tabular-nums">{formatDuration(job.started, job.finished)}</td>
              <td className="tabular-nums">{formatCount(job.credits)}</td>
              <td className="max-w-md" style={{ color: job.error ? "var(--accent-ink)" : "var(--faint)" }}>{job.error ?? "None"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UsersTable({ users }: { users: AdminUserRow[] }) {
  if (!users.length) {
    return <div className="card p-10 text-center"><p className="font-medium">No signups yet</p></div>;
  }
  return (
    <div className="card overflow-x-auto">
      <table className="tbl">
        <caption className="sr-only">Users</caption>
        <thead>
          <tr>
            <th scope="col">Email</th>
            <th scope="col">Signed up</th>
            <th scope="col">Last sign-in</th>
            <th scope="col">Onboarding</th>
            <th scope="col">Seller domain</th>
            <th scope="col">Runs</th>
            <th scope="col">Leads delivered</th>
            <th scope="col">Slack</th>
            <th scope="col"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td className="font-medium">{user.email}</td>
              <td className="whitespace-nowrap">{formatWhen(user.signedUp)}</td>
              <td className="whitespace-nowrap">{formatWhen(user.lastSignIn)}</td>
              <td>{user.onboarding}</td>
              <td>{user.domains}</td>
              <td className="tabular-nums">{formatCount(user.runs)}</td>
              <td className="tabular-nums">{formatCount(user.leads)}</td>
              <td>{user.slackConnected ? "Yes" : "No"}</td>
              <td><Link href={`/admin/users/${user.id}`} style={{ color: "var(--accent-ink)" }} className="font-medium">View</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function money(amount: number): string {
  return formatUsd(amount);
}
