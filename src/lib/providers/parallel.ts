// Parallel.ai provider. Server-side only (reads PARALLEL_API_KEY).
// Wraps Task API (seller research, verification), FindAll (discovery), Search (fallback).
// All field extraction is defensive: FindAll is beta and response shapes drift.

import { LIMITS } from "../engine/config";
import type { Candidate, Basis, Citation, Generator, MatchCondition } from "../engine/types";

const BASE = "https://api.parallel.ai";

function key(): string {
  const k = process.env.PARALLEL_API_KEY;
  if (!k) throw new Error("PARALLEL_API_KEY is not set");
  return k;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "x-api-key": key(), "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text };
  }
  if (!res.ok) {
    throw new Error(`Parallel ${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  }
  return json as T;
}

// ---------------------------------------------------------------------------
// Task API — deep research with structured JSON output + citations.
// ---------------------------------------------------------------------------
export interface TaskResult<T> {
  content: T;
  basis: Basis[];
  raw: unknown;
}

export async function taskRun<T = any>(opts: {
  input: string | Record<string, unknown>;
  jsonSchema: Record<string, unknown>;
  processor?: string;
  timeoutMs?: number;
}): Promise<TaskResult<T>> {
  const processor = opts.processor ?? "core";
  const created = await call<any>("POST", "/v1/tasks/runs", {
    input: opts.input,
    task_spec: { output_schema: { type: "json", json_schema: opts.jsonSchema } },
    processor,
  });
  const runId = created.run_id || created.id || created.task_run?.run_id;
  if (!runId) throw new Error(`Task create: no run id in ${JSON.stringify(created).slice(0, 300)}`);

  const deadline = Date.now() + (opts.timeoutMs ?? LIMITS.taskTimeoutMs);
  // Prefer the blocking result endpoint; fall back to polling status.
  while (Date.now() < deadline) {
    const r = await call<any>("GET", `/v1/tasks/runs/${runId}/result`).catch((e) => ({ _err: String(e) }));
    if (r && !r._err && (r.output || r.result)) {
      const out = r.output ?? r.result ?? {};
      const content = out.content ?? out.values ?? out;
      return { content: content as T, basis: normalizeBasis(out.basis), raw: r };
    }
    const status = await call<any>("GET", `/v1/tasks/runs/${runId}`).catch(() => ({}));
    const s = String(status.status || status.state || "");
    if (/failed|error|cancel/i.test(s)) throw new Error(`Task run ${runId} ${s}`);
    await sleep(LIMITS.pollIntervalMs);
  }
  throw new Error(`Task run ${runId} timed out`);
}

/** Create a Task run without blocking; returns the run id to persist + poll. */
export async function taskCreate(opts: {
  input: string | Record<string, unknown>;
  jsonSchema: Record<string, unknown>;
  processor?: string;
}): Promise<{ runId: string }> {
  const created = await call<any>("POST", "/v1/tasks/runs", {
    input: opts.input,
    task_spec: { output_schema: { type: "json", json_schema: opts.jsonSchema } },
    processor: opts.processor ?? "core",
  });
  const runId = created.run_id || created.id || created.task_run?.run_id;
  if (!runId) throw new Error(`Task create: no run id in ${JSON.stringify(created).slice(0, 300)}`);
  return { runId };
}

/** Non-blocking single check of a Task run. */
export async function taskCheck<T = any>(
  runId: string,
): Promise<{ done: boolean; failed: boolean; content?: T; basis?: Basis[] }> {
  const r = await call<any>("GET", `/v1/tasks/runs/${runId}/result`).catch((e) => ({ _err: String(e) }));
  if (r && !r._err && (r.output || r.result)) {
    const out = r.output ?? r.result ?? {};
    const content = out.content ?? out.values ?? out;
    return { done: true, failed: false, content: content as T, basis: normalizeBasis(out.basis) };
  }
  const status = await call<any>("GET", `/v1/tasks/runs/${runId}`).catch(() => ({}));
  const s = String(status.status || status.state || "");
  if (/failed|error|cancel/i.test(s)) return { done: false, failed: true };
  return { done: false, failed: false };
}

// ---------------------------------------------------------------------------
// FindAll API — discovery of entities matching NL criteria, with verification.
// ---------------------------------------------------------------------------
export interface FindAllRunHandle {
  runId: string;
  created: unknown;
}

export async function findAllCreate(opts: {
  objective: string;
  matchConditions: MatchCondition[];
  generator: Generator;
  matchLimit: number;
  entityType?: string;
  webhookUrl?: string;
}): Promise<FindAllRunHandle> {
  const body: Record<string, unknown> = {
    objective: opts.objective,
    entity_type: opts.entityType ?? "companies",
    match_conditions: opts.matchConditions.map((c) => ({ name: c.name, description: c.description })),
    generator: opts.generator,
    match_limit: opts.matchLimit,
  };
  if (opts.webhookUrl) body.webhook = { url: opts.webhookUrl };
  const created = await call<any>("POST", "/v1beta/findall/runs", body);
  const runId =
    created.findall_id || created.id || created.run_id || created?.run?.findall_id;
  if (!runId) throw new Error(`FindAll create: no id in ${JSON.stringify(created).slice(0, 300)}`);
  return { runId, created };
}

export interface FindAllStatus {
  status: string;
  isActive: boolean;
  candidatesCount: number;
  matchedCount: number;
  terminationReason?: string;
  raw: unknown;
}

export async function findAllStatus(runId: string): Promise<FindAllStatus> {
  const s = await call<any>("GET", `/v1beta/findall/runs/${runId}`);
  const st = s.status || s;
  const metrics = st.metrics || s.metrics || {};
  const statusStr = String(st.status || s.state || "");
  const isActive =
    st.is_active ?? s.is_active ?? !/completed|failed|done|error|cancel/i.test(statusStr);
  return {
    status: statusStr,
    isActive: Boolean(isActive),
    candidatesCount: metrics.generated_candidates_count ?? metrics.candidate_count ?? 0,
    matchedCount: metrics.matched_candidates_count ?? metrics.match_count ?? 0,
    terminationReason: st.termination_reason,
    raw: s,
  };
}

export async function findAllResult(runId: string): Promise<{ candidates: Candidate[]; raw: unknown }> {
  const r = await call<any>("GET", `/v1beta/findall/runs/${runId}/result`);
  const list: any[] = r.candidates || r.results || [];
  const candidates = list.map(mapCandidate);
  return { candidates, raw: r };
}

/** Poll a FindAll run to completion, then fetch results. */
export async function findAllAwait(
  runId: string,
  onTick?: (s: FindAllStatus) => void,
): Promise<{ candidates: Candidate[]; status: FindAllStatus; raw: unknown }> {
  const deadline = Date.now() + LIMITS.findAllTimeoutMs;
  let last: FindAllStatus | null = null;
  while (Date.now() < deadline) {
    last = await findAllStatus(runId);
    onTick?.(last);
    if (!last.isActive) break;
    await sleep(LIMITS.pollIntervalMs);
  }
  const { candidates, raw } = await findAllResult(runId);
  return { candidates, status: last!, raw };
}

// ---------------------------------------------------------------------------
// Search API — synchronous web search, used for Stage D domain resolution.
// ---------------------------------------------------------------------------
export async function search(opts: {
  objective: string;
  queries?: string[];
  mode?: "turbo" | "fast" | "base" | "advanced";
}): Promise<{ results: Array<{ url: string; title?: string; publish_date?: string; excerpts?: string[] }> }> {
  const r = await call<any>("POST", "/v1/search", {
    objective: opts.objective,
    search_queries: opts.queries ?? [],
    mode: opts.mode ?? "fast",
  });
  return { results: r.results || [] };
}

// ---------------------------------------------------------------------------
// mappers
// ---------------------------------------------------------------------------
function mapCandidate(c: any): Candidate {
  return {
    candidateId: c.candidate_id || c.id || "",
    name: c.name || c.entity_name || "",
    url: c.url || c.domain || c.website || "",
    description: c.description || "",
    matchStatus: c.match_status ?? c.status ?? "generated",
    output: c.output,
    basis: normalizeBasis(c.basis ?? c.evidence),
  };
}

function normalizeBasis(b: any): Basis[] {
  if (!b) return [];
  const arr = Array.isArray(b) ? b : [b];
  return arr
    .filter(Boolean)
    .map((e: any): Basis => ({
      field: e.field || e.condition || e.name || "",
      reasoning: e.reasoning || e.rationale || e.summary || "",
      confidence: e.confidence,
      citations: normalizeCitations(e.citations ?? e.sources),
    }));
}

function normalizeCitations(c: any): Citation[] {
  if (!c) return [];
  const arr = Array.isArray(c) ? c : [c];
  return arr
    .filter(Boolean)
    .map((ct: any): Citation => ({
      url: ct.url || ct.link || "",
      title: ct.title,
      date: ct.publish_date || ct.date,
      excerpts: ct.excerpts,
    }))
    .filter((ct: Citation) => ct.url);
}
