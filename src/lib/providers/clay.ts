// Clay Public Routines API. Server-side only (reads CLAY_API_KEY).
// Seller research + buying situations are one routine run. Discovery stays on Parallel.
// Docs: https://developers.clay.com/routines/api
//   POST /public/v0/routines/{routine_id}/run
//   GET  /public/v0/routines/run/{routine_run_id}/results
// Auth header: clay-api-key. 202 while the run is in progress, 200 when complete.

const BASE = "https://api.clay.com/public/v0";
export const DEFAULT_CLAY_ROUTINE_ID = "workflow:wf_0tmxbl8enV2ZTXSfktn";

export function isTransientClayError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  return error instanceof Error && (error.name === "TimeoutError" || /fetch failed|timeout|timed out|ECONN|ENOTFOUND|-> (408|429|5\d\d)/i.test(error.message));
}

function key(): string {
  const k = process.env.CLAY_API_KEY?.trim();
  if (!k) throw new Error("CLAY_API_KEY is not set");
  return k;
}

export function clayRoutineId(): string {
  const id = (process.env.CLAY_ROUTINE_ID || DEFAULT_CLAY_ROUTINE_ID).trim() || DEFAULT_CLAY_ROUTINE_ID;
  if (!/^[\w:.-]{1,64}$/.test(id)) throw new Error("CLAY_ROUTINE_ID is not a valid Clay routine id");
  return id;
}

async function clayFetch(method: string, path: string, body?: unknown, timeoutMs = 30000): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "clay-api-key": key(), "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text.slice(0, 400) };
  }
  if (res.status === 202 || res.ok) return { status: res.status, json };
  const message = typeof json?.message === "string" ? json.message : text.slice(0, 400);
  throw new Error(`Clay ${method} ${path} -> ${res.status}: ${message}`);
}

/** Start HotNow — Seller Intelligence for one domain. Returns the routine run id. */
export async function startSellerIntelligence(domain: string, itemId: string): Promise<{ runId: string }> {
  const sellerDomain = domain.trim().toLowerCase();
  if (!sellerDomain) throw new Error("seller_domain is required");
  const id = itemId.trim().slice(0, 64);
  if (!id) throw new Error("Clay routine item id is required");
  const { json } = await clayFetch("POST", `/routines/${clayRoutineId()}/run`, {
    items: [{ id, inputs: { seller_domain: sellerDomain } }],
  });
  const runId = json?.routine_run_id;
  if (typeof runId !== "string" || !runId) throw new Error("Clay routine start did not return a routine_run_id");
  return { runId };
}

export type ClayIntelligenceCheck =
  | { done: false }
  | { done: true; payload: Record<string, unknown>; raw: unknown };

/**
 * One poll of a routine run. Parses result_json (a JSON string on the item result).
 * Returns done: false while Clay reports the run in progress.
 */
export async function checkSellerIntelligence(runId: string): Promise<ClayIntelligenceCheck> {
  if (!runId.trim()) throw new Error("Clay routine run id is required");
  const items: any[] = [];
  let cursor: string | undefined;
  let raw: unknown;
  let status = "";
  for (let page = 0; page < 5; page++) {
    const qs = new URLSearchParams({ limit: "20" });
    if (cursor) qs.set("cursor", cursor);
    const { status: http, json } = await clayFetch("GET", `/routines/run/${encodeURIComponent(runId)}/results?${qs}`, undefined, 20000);
    raw = json;
    status = String(json?.status || "");
    if (http === 202 || status === "in_progress") return { done: false };
    if (status !== "complete") throw new Error(`Clay routine run ${status || http}`);
    if (Array.isArray(json?.data)) items.push(...json.data);
    cursor = typeof json?.cursor === "string" && json.cursor ? json.cursor : undefined;
    if (!cursor) break;
  }
  const item = items.find((row) => row?.status === "complete") ?? items[0];
  if (!item) throw new Error("Clay routine completed without a result");
  if (item.status === "failed") throw new Error(item.error?.message || "Clay seller intelligence failed");
  const source = item.result && typeof item.result === "object" ? item.result : item;
  return { done: true, payload: parseRoutineItemResult(source), raw };
}

/** Parse a completed item result. result_json is a JSON string; objects are accepted too. */
export function parseRoutineItemResult(result: unknown): Record<string, unknown> {
  const bag = asRecord(result);
  if (!bag) throw new Error("Clay result was empty");
  if (!("result_json" in bag)) {
    if (bag.seller || bag.buying_situations) return bag;
    throw new Error("Clay result did not include result_json");
  }
  let payload: unknown = bag.result_json;
  for (let i = 0; i < 2 && typeof payload === "string"; i++) {
    try {
      payload = JSON.parse(payload);
    } catch {
      throw new Error("Clay result_json is not valid JSON");
    }
  }
  const body = asRecord(payload);
  if (!body) throw new Error("Clay result_json did not contain seller intelligence");
  if (body.situation_count == null && bag.situation_count != null) return { ...body, situation_count: bag.situation_count };
  return body;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
