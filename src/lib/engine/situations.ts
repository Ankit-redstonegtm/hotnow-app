// Stage B — Situation generation. Pure reasoning over the seller profile (Claude).
// Encodes the validated IP: each situation's discoveryObjective must describe the
// BUYER in the buyer's own world and EXPLICITLY EXCLUDE vendors/competitors, or
// discovery returns the seller's peers instead of its buyers.

import { reasonWithSchema, activeProvider } from "../llm";
import { taskCreate, taskCheck } from "../providers/parallel";
import { LIMITS } from "./config";
import type { BuyingSituation, SellerProfile, Generator } from "./types";

// JSON schema used when the reasoning provider requires one (Parallel Task API).
const SITUATIONS_SCHEMA = {
  type: "object",
  properties: {
    situations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          demand_hypothesis: { type: "string" },
          observable_indicators: { type: "array", items: { type: "string" } },
          evidence_sources: { type: "array", items: { type: "string" } },
          discovery_objective: { type: "string" },
          match_conditions: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string" }, description: { type: "string" } },
              required: ["name", "description"],
            },
          },
          recommended_generator: { type: "string" },
        },
        required: ["name", "description", "demand_hypothesis", "discovery_objective", "match_conditions"],
      },
    },
  },
  required: ["situations"],
} as const;

const SYSTEM = `You are HotNow's situation strategist. A "buying situation" is an observable, dated event or change at a potential customer that creates a reason to buy a specific product RIGHT NOW (e.g. a regulatory warning, territory expansion, an acquisition, a first VP hire, rapid hiring).

Your job: given a seller, propose buying situations and — critically — a web-discovery objective for each that will surface the BUYER experiencing the situation.

HARD RULES that make or break discovery quality:
1. The discoveryObjective describes the BUYER in the BUYER'S OWN WORLD (their industry, their event), NOT the seller's product vocabulary. Using the seller's own terms makes web search return the seller's COMPETITORS, not its buyers.
2. Every discoveryObjective MUST explicitly exclude software/SaaS vendors, consultancies, agencies, staffing firms, and data/directory providers — unless the seller's actual buyers ARE such firms.
3. Each situation must have a clear causal link (demandHypothesis) between the event and the product. No generic firmographics.
4. matchConditions are verifiable yes/no checks a researcher could confirm from public web evidence. Include one that enforces the buyer is an end-operator (not a vendor), and one that enforces recency with an explicit date window.
5. Prefer situations with observable, dated public evidence (press releases, job postings, filings, news).

Return STRICT JSON only.`;

interface RawSituation {
  name: string;
  description: string;
  demand_hypothesis: string;
  observable_indicators: string[];
  evidence_sources: string[];
  discovery_objective: string;
  match_conditions: { name: string; description: string }[];
  recommended_generator?: Generator;
}

function buildPrompt(profile: SellerProfile, opts?: { count?: number; corrections?: string }): string {
  const count = opts?.count ?? 5;
  const today = new Date().toISOString().slice(0, 10);
  return `SELLER
Company: ${profile.companyName}
Domain: ${profile.domain}
What they sell: ${profile.productDescription}
Who buys: ${profile.targetCustomers}
Problems solved: ${profile.problemsSolved}
Buyer personas: ${profile.buyerPersonas.join(", ") || "unknown"}
Industries: ${profile.industries.join(", ") || "unknown"}
${opts?.corrections ? `\nUSER CORRECTIONS (authoritative, override the above):\n${opts.corrections}` : ""}

Today is ${today}. Propose ${count} buying situations.

For each, return an object with:
- name
- description
- demand_hypothesis (why this event creates demand for THIS seller's product)
- observable_indicators (array: what you'd literally see on the web)
- evidence_sources (array: types of sources, e.g. "company press release", "job postings")
- discovery_objective (the buyer-centric, vendor-excluding natural-language objective for web discovery; name concrete buyer industries/segments and state the recency window relative to today)
- match_conditions (array of {name, description}; include an end-operator/not-a-vendor check and a recency check with an explicit date window)
- recommended_generator (one of: base, core — use base for most situations; core only for narrow/rare situations with few expected matches. Do NOT use preview, which is only for query testing.)

Return JSON: { "situations": [ ... ] }`;
}

function mapRaw(data: { situations?: RawSituation[] }): BuyingSituation[] {
  return (data?.situations || []).map((s): BuyingSituation => ({
    name: s.name?.trim() || "Untitled situation",
    description: s.description?.trim() || "",
    demandHypothesis: s.demand_hypothesis?.trim() || "",
    observableIndicators: Array.isArray(s.observable_indicators) ? s.observable_indicators : [],
    evidenceSources: Array.isArray(s.evidence_sources) ? s.evidence_sources : [],
    discoveryObjective: s.discovery_objective?.trim() || "",
    matchConditions: (s.match_conditions || [])
      .filter((c) => c?.name && c?.description)
      .map((c) => ({ name: c.name.trim(), description: c.description.trim() })),
    generator: normalizeGenerator(s.recommended_generator),
    source: "ai",
  }));
}

/** Synchronous generation (headless script / fast LLM providers). */
export async function generateSituations(
  profile: SellerProfile,
  opts?: { count?: number; corrections?: string },
): Promise<BuyingSituation[]> {
  const data = await reasonWithSchema<{ situations: RawSituation[] }>({
    system: SYSTEM,
    prompt: buildPrompt(profile, opts),
    jsonSchema: SITUATIONS_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 6000,
  });
  return mapRaw(data);
}

/**
 * Async start. With the Parallel provider (slow) it creates a Task and returns a
 * taskId to poll. With a fast LLM it runs inline and returns the situations.
 */
export async function startSituations(
  profile: SellerProfile,
  opts?: { count?: number; corrections?: string },
): Promise<{ taskId?: string; situations?: BuyingSituation[] }> {
  if (activeProvider() === "parallel") {
    const { runId } = await taskCreate({
      input: `${SYSTEM}\n\n${buildPrompt(profile, opts)}`,
      jsonSchema: SITUATIONS_SCHEMA as unknown as Record<string, unknown>,
      processor: "core",
    });
    return { taskId: runId };
  }
  return { situations: await generateSituations(profile, opts) };
}

/** Poll an async situations task. Returns situations when done, null if still running. */
export async function finishSituations(taskId: string): Promise<BuyingSituation[] | null> {
  const r = await taskCheck<{ situations?: RawSituation[] }>(taskId);
  if (r.failed) throw new Error("Situation generation failed");
  if (!r.done) return null;
  return mapRaw(r.content ?? {});
}

function normalizeGenerator(g?: string): Generator {
  if (g === "base" || g === "core" || g === "pro" || g === "preview") return g;
  return LIMITS.defaultGenerator;
}
