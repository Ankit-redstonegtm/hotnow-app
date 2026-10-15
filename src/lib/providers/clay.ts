// Clay provider - runs the published "HotNow — Seller Intelligence v1" workflow via Clay's
// Public API (api.clay.com/public/v0) and returns normalized seller intelligence.
//
// The workflow is exposed to the API as a ROUTINE (routine id "workflow:wf_..."). The Public
// API does NOT accept a bare wf_ id - it is run through the routines endpoints:
//   POST /routines/{routineId}/run           -> { routine_run_id, status:"in_progress" }  (202)
//   GET  /routines/run/{routineRunId}/results-> 200 { status:"complete", data:[{id,status,result}] }
//                                               or 202 { status:"in_progress" }
// Auth: header `clay-api-key`. Runtime is async (~78s); callers start a run, persist the id,
// and poll getRunResult. Server-only: never import into client code.

const BASE = "https://api.clay.com/public/v0";
const DEFAULT_ROUTINE_ID = "workflow:wf_0tmxbl8enV2ZTXSfktn";

function apiKey(): string {
  const k = process.env.CLAY_API_KEY;
  if (!k) throw new Error("CLAY_API_KEY is not set");
  return k;
}

function routineId(): string {
  return process.env.CLAY_SELLER_ROUTINE_ID || DEFAULT_ROUTINE_ID;
}

async function call<T = unknown>(method: string, path: string, body?: unknown, timeoutMs = 30000): Promise<{ status: number; json: T }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "clay-api-key": apiKey(), "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json: unknown;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
  if (res.status >= 400) {
    const msg = (json as { message?: string })?.message || text.slice(0, 300);
    throw new Error(`Clay ${method} ${path} -> ${res.status}: ${msg}`);
  }
  return { status: res.status, json: json as T };
}

/** Start a seller-intelligence run. Returns the routine run id to persist. */
export async function startSellerIntelligence(sellerDomain: string, opts: { webhookId?: string } = {}): Promise<{ runId: string }> {
  const domain = (sellerDomain || "").trim();
  if (!domain) throw new Error("sellerDomain is required");
  const rid = encodeURIComponent(routineId());
  const body: Record<string, unknown> = {
    items: [{ id: domain, inputs: { seller_domain: domain } }],
  };
  if (opts.webhookId) body.webhook_id = opts.webhookId;
  const { json } = await call<{ routine_run_id: string }>("POST", `/routines/${rid}/run`, body);
  if (!json.routine_run_id) throw new Error("Clay run did not return a routine_run_id");
  return { runId: json.routine_run_id };
}

export type ClayRunState = "running" | "complete" | "failed";

export interface ClayRunResult {
  state: ClayRunState;
  intelligence?: SellerIntelligence;
  error?: string;
}

/** Poll a run. 202 -> running; 200 -> parse the first item's result; item failure -> failed. */
export async function getSellerIntelligence(runId: string): Promise<ClayRunResult> {
  const { status, json } = await call<RunResultsResponse>("GET", `/routines/run/${encodeURIComponent(runId)}/results`, undefined, 20000);
  if (status === 202) return { state: "running" };

  const item = json.data?.[0];
  if (!item) return { state: "running" }; // complete envelope but item not materialized yet
  if (item.status === "failed") return { state: "failed", error: item.error?.message || "Clay run item failed" };

  try {
    const intelligence = parseIntelligence(item.result);
    return { state: "complete", intelligence };
  } catch (e) {
    return { state: "failed", error: e instanceof Error ? e.message : "Could not parse Clay result" };
  }
}

// ---- shapes ----
interface RunResultsResponse {
  status?: string;
  total?: number;
  finished?: number;
  data?: Array<{ id: string; status: "complete" | "failed"; result?: { result_json?: string; situation_count?: number }; error?: { message?: string } }>;
}

export interface SellerIntelligenceSituation {
  id: string;
  name: string;
  description: string;
  observable_event: string;
  why_it_creates_demand: string;
  evidence_to_find: string[];
  likely_sources: string[];
  recency_days: number;
  priority: number;
}

export interface SellerIntelligence {
  seller: {
    domain: string;
    company_name: string;
    description: string;
    products_services: string[];
    value_proposition: string;
    target_industries: string[];
    target_company_types: string[];
    target_geographies: string[];
    buyer_personas: string[];
  };
  icp: {
    company_description: string;
    industries: string[];
    geographies: string[];
    employee_range: string | null;
    exclusions: string[];
  };
  buying_situations: SellerIntelligenceSituation[];
}

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}
function asStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** Parse + validate the workflow's `result_json` into a typed, contract-checked object. */
export function parseIntelligence(result: { result_json?: string } | undefined): SellerIntelligence {
  const raw = result?.result_json;
  if (!raw || typeof raw !== "string") throw new Error("Clay result is missing result_json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Clay result_json is not valid JSON");
  }
  const obj = parsed as Record<string, unknown>;
  const seller = (obj.seller ?? {}) as Record<string, unknown>;
  const icp = (obj.icp ?? {}) as Record<string, unknown>;
  const sits = Array.isArray(obj.buying_situations) ? (obj.buying_situations as Record<string, unknown>[]) : [];

  if (!seller.company_name && !seller.domain && sits.length === 0) {
    throw new Error("Clay result_json did not contain a usable seller profile");
  }

  const empRange = asStr(icp.employee_range);
  return {
    seller: {
      domain: asStr(seller.domain),
      company_name: asStr(seller.company_name),
      description: asStr(seller.description),
      products_services: asArray(seller.products_services),
      value_proposition: asStr(seller.value_proposition),
      target_industries: asArray(seller.target_industries),
      target_company_types: asArray(seller.target_company_types),
      target_geographies: asArray(seller.target_geographies),
      buyer_personas: asArray(seller.buyer_personas),
    },
    icp: {
      company_description: asStr(icp.company_description),
      industries: asArray(icp.industries),
      geographies: asArray(icp.geographies),
      employee_range: empRange || null,
      exclusions: asArray(icp.exclusions),
    },
    buying_situations: sits.slice(0, 5).map((s, i) => ({
      id: asStr(s.id) || `situation_${i + 1}`,
      name: asStr(s.name),
      description: asStr(s.description),
      observable_event: asStr(s.observable_event),
      why_it_creates_demand: asStr(s.why_it_creates_demand),
      evidence_to_find: asArray(s.evidence_to_find),
      likely_sources: asArray(s.likely_sources),
      recency_days: Number.isFinite(Number(s.recency_days)) ? Number(s.recency_days) : 90,
      priority: Number.isFinite(Number(s.priority)) ? Number(s.priority) : i + 1,
    })),
  };
}
