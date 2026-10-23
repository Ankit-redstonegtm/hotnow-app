"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type BackgroundJob = {
  id: string; kind: "contacts" | "emails"; status: "queued" | "running" | "retrying" | "completed" | "failed" | "cancelled";
  step: string; completed_items: number; total_items: number; result_count: number; last_error: string | null;
};
const ACTIVE = ["queued", "running", "retrying"];

/** One-line status for the active/last task. */
export function describeJob(j: BackgroundJob): string {
  const what = j.kind === "contacts" ? "decision-makers" : "emails";
  const progress = j.total_items > 0 ? ` · ${Math.min(j.completed_items, j.total_items)} of ${j.total_items}` : "";
  if (j.status === "failed") return `Needs attention: ${j.last_error ?? "something went wrong"}. Try again.`;
  if (j.status === "cancelled") return "Stopped.";
  if (j.status === "retrying") return `Connection interrupted, retrying. Finding ${what}${progress}`;
  return `Finding ${what}${progress}`;
}

/**
 * Drives the background enrichment queue from a page. The work itself runs in the worker, so
 * this only starts it and watches progress; reopening the page picks up a task already running.
 * `onProgress` runs on every poll so the page can refresh its table.
 */
export function useEnrichmentJobs(onProgress?: () => void | Promise<unknown>) {
  const [active, setActive] = useState<BackgroundJob | null>(null);
  const [last, setLast] = useState<BackgroundJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const progress = useRef(onProgress);
  progress.current = onProgress;
  const wasActive = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/contacts/jobs", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Could not load task status"); return null; }
      const jobs: BackgroundJob[] = j.jobs ?? [];
      const current = jobs.find((x) => ACTIVE.includes(x.status)) ?? null;
      setActive(current); setLast(jobs[0] ?? null); setError(null);
      return current;
    } catch { return null; } // transient network error: keep the last state, try again next tick
  }, []);

  // Pick up a task already running when the page opens, then poll while one is active.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const tick = async () => {
      const current = await refresh();
      if (cancelled) return;
      if (current || wasActive.current) await progress.current?.();
      wasActive.current = !!current;
      if (current) timer = setTimeout(tick, 2500);
    };
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [refresh, active?.id]);

  const start = useCallback(async (all = false) => {
    setError(null);
    try {
      const r = await fetch("/api/contacts/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ all }) });
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "Could not start"); return; }
      if (j.job) setActive(j.job);
    } catch { setError("Could not start. Check your connection and retry."); }
  }, []);

  const cancel = useCallback(async () => {
    if (!active) return;
    await fetch(`/api/jobs/${active.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cancel" }) }).catch(() => null);
    await refresh();
  }, [active, refresh]);

  return { active, last, error, start, cancel, refresh };
}
