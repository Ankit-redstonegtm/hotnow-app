"use client";
import { useState } from "react";
import Link from "next/link";
import { useActivity } from "./ActivityProvider";
import { isActive, type ActivityItem } from "@/lib/activity/types";
import { apiJson, selectWorkspace } from "@/lib/workspace";

const labels = { queued: "Queued", running: "In progress", retrying: "Retry scheduled", completed: "Completed", failed: "Needs attention", cancelled: "Stopped" };
export default function AgentActivity({ compact = false }: { compact?: boolean }) {
  const { data, connection, refresh } = useActivity();
  const [filter, setFilter] = useState("all"), [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null), [message, setMessage] = useState("");
  const active = data?.active || 0, items = data?.items || [];
  const attention = items.filter(i => i.status === "failed").length;
  const completed = items.filter(i => i.status === "completed").length;
  const shown = items.filter(i => filter === "active" ? isActive(i) : filter === "attention" ? i.status === "failed" : true);
  async function action(item: ActivityItem, action: "cancel" | "retry") {
    setBusy(item.id); setMessage("");
    try {
      const result = await apiJson(`/api/jobs/${item.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      setMessage(result.message); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update task"); }
    finally { setBusy(null); }
  }
  async function review(item: ActivityItem) {
    setBusy(item.id);
    try {
      await apiJson("/api/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.workspaceId }) });
      selectWorkspace(item.workspaceId); window.location.assign(item.kind === "discovery" ? "/dashboard/signals" : "/onboarding");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not open company"); setBusy(null); }
  }
  if (compact) return <Link href="/dashboard#parallel-activity" className="activity-badge" aria-label={`${active} active tasks. View activity`}>
    <span className={`activity-dot ${active ? "active" : ""}`} />{active ? `${active} task${active === 1 ? "" : "s"} running` : attention ? `${attention} need attention` : "Agent activity"}
  </Link>;
  return <section id="parallel-activity" className="agent-panel scroll-mt-20" aria-label="Agent activity">
    <div className="agent-panel-head">
      <div className="agent-heading"><span className="agent-mark" aria-hidden><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z" /></svg></span><div><h2>Agent activity</h2><p>Your research team, working in the background.</p></div></div>
      <span className={`agent-connection ${connection}`}><span className="activity-dot" />{connection === "live" ? "Live updates" : connection === "connecting" ? "Connecting" : "Reconnecting"}</span>
    </div>
    <div className="agent-summary"><div><strong>{active}</strong><span>Working now</span></div><div><strong>{completed}</strong><span>Recently completed</span></div><div><strong>{attention}</strong><span>Need attention</span></div></div>
    <div className="agent-toolbar"><div className="agent-tabs" aria-label="Activity filters">{[["all", "All activity"], ["active", "In progress"], ["attention", "Needs attention"]].map(([id, label]) => <button key={id} aria-pressed={filter === id} onClick={() => { setFilter(id); setExpanded(false); }}>{label}</button>)}</div><span className="agent-background-note">Safe to leave this page</span></div>
    {connection === "reconnecting" && <div className="agent-notice" role="status">Live updates paused. Reconnecting and restoring saved progress; background tasks continue.</div>}
    {message && <div className="agent-notice" role="status">{message}</div>}
    {!data ? <div className="agent-empty"><span className="skeleton h-4 w-52 rounded inline-block" /><p>Connecting to your research workspace…</p></div> : !shown.length ? <div className="agent-empty"><span className="agent-empty-symbol" aria-hidden>✓</span><h3>{filter === "attention" ? "Everything looks good" : filter === "active" ? "No tasks running right now" : "Your next opportunity starts here"}</h3><p>{filter === "attention" ? "No failed tasks in your recent activity." : "Start a search to follow research, matching and saved results as they happen."}</p><Link href="/dashboard/signals" className="btn btn-ghost btn-sm mt-4">Explore buying signals →</Link></div> : <div className="agent-task-list">{shown.slice(0, expanded ? shown.length : 6).map(item => {
      const inProgress = isActive(item), percent = item.total ? Math.min(100, Math.round((item.completed || 0) / item.total * 100)) : null;
      return <article className="agent-task" key={item.id} data-status={item.status}>
        <div className={`agent-task-symbol ${item.status}`} aria-hidden>{inProgress && item.status !== "queued" ? <span className="spin inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent" /> : item.status === "completed" ? "✓" : item.status === "failed" ? "!" : item.status === "cancelled" ? "−" : "◷"}</div>
        <div className="agent-task-body"><div className="agent-task-top"><div><p className="agent-workspace">{item.workspace}</p><h3>{item.title}</h3></div><span className={`agent-status ${item.status}`}>{labels[item.status]}</span></div>
          <p className="agent-phase">{item.phase}</p>
          {item.candidates !== undefined && <div className="agent-metrics"><span><strong>{item.candidates}</strong> candidates</span><span><strong>{item.matched}</strong> matches</span><span>Target <strong>{item.target}</strong></span></div>}
          {percent !== null && <div className="agent-batch"><div className="agent-batch-label"><span>{item.completed} of {item.total} lookups processed</span><span>{item.results} results found</span></div><div className="agent-progress" role="progressbar" aria-label="Lookups processed" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }} /></div></div>}
          {item.error && <p className="agent-task-error">{item.error}</p>}
          <details className="agent-details"><summary>Task details</summary><div><span>{item.kind === "discovery" ? "Parallel · company discovery" : ["contacts", "emails"].includes(item.kind) ? "Blitz · contact enrichment" : "Company research workflow"}</span><time dateTime={item.timestamp}>Updated {new Date(item.timestamp).toLocaleString()}</time><span>Saved progress is restored when you reconnect.</span></div></details>
          {(item.canCancel || item.canRetry || item.status === "failed") && <div className="agent-actions">{item.canCancel && <button className="btn btn-ghost btn-sm" disabled={busy === item.id} onClick={() => void action(item, "cancel")}>Stop task</button>}{item.canRetry ? <button className="btn btn-ghost btn-sm" disabled={busy === item.id} onClick={() => void action(item, "retry")}>Retry task</button> : item.status === "failed" && <button className="btn btn-ghost btn-sm" disabled={busy === item.id} onClick={() => void review(item)}>Review and retry</button>}</div>}
        </div>
      </article>;
    })}</div>}
    <div className="agent-footer"><span>{data?.mode === "webhook" ? "Provider webhooks + live updates" : "Background processing + live updates"} · Progress saved automatically</span>{shown.length > 6 && <button onClick={() => setExpanded(!expanded)}>{expanded ? "Show less" : `View all ${shown.length} tasks`}</button>}</div>
  </section>;
}
