// Stage A - Seller understanding. Researches a domain with Parallel Task API and
// returns a structured SellerProfile. If research is thin, the caller should ask
// the user for a short product description and re-run with it as additional input.

import { taskRun, taskCreate, taskCheck } from "../providers/parallel";
import type { SellerProfile } from "./types";
import { normalizeDomain } from "../util/domain";

const SELLER_SCHEMA = {
  type: "object",
  properties: {
    company_name: { type: "string", description: "The company's name" },
    product_description: {
      type: "string",
      description: "One or two sentences on what the company sells / what the product does",
    },
    target_customers: {
      type: "string",
      description: "The kinds of organizations that buy this product",
    },
    problems_solved: {
      type: "string",
      description: "The core problems the product solves for its buyers",
    },
    buyer_personas: {
      type: "array",
      items: { type: "string" },
      description: "Job titles / roles of the people who buy or champion this product",
    },
    industries: {
      type: "array",
      items: { type: "string" },
      description: "Industries where the product's buyers typically operate",
    },
  },
  required: ["company_name", "product_description", "target_customers", "problems_solved"],
} as const;

export async function researchCompany(
  domain: string,
  userDescription?: string,
): Promise<SellerProfile> {
  const normalized = normalizeDomain(domain);
  const input: Record<string, unknown> = { domain: normalized, website: `https://${normalized}` };
  if (userDescription) input.seller_provided_description = userDescription;

  const { content, raw } = await taskRun<any>({
    input,
    jsonSchema: SELLER_SCHEMA as unknown as Record<string, unknown>,
    processor: "core",
  });

  return {
    domain: normalized,
    companyName: content.company_name || normalized,
    productDescription: content.product_description || userDescription || "",
    targetCustomers: content.target_customers || "",
    problemsSolved: content.problems_solved || "",
    buyerPersonas: arr(content.buyer_personas),
    industries: arr(content.industries),
    raw,
  };
}

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

// --- async variant (for serverless: create now, poll later) ---
function researchInput(domain: string, userDescription?: string) {
  const input: Record<string, unknown> = { domain, website: `https://${domain}` };
  if (userDescription) input.seller_provided_description = userDescription;
  return input;
}

export async function startResearch(domain: string, userDescription?: string): Promise<{ taskId: string; normalizedDomain: string }> {
  const normalized = normalizeDomain(domain);
  const { runId } = await taskCreate({
    input: researchInput(normalized, userDescription),
    jsonSchema: SELLER_SCHEMA as unknown as Record<string, unknown>,
    processor: "core",
  });
  return { taskId: runId, normalizedDomain: normalized };
}

/** Returns the profile when done, null if still running. Throws if the task failed. */
export async function finishResearch(taskId: string, normalizedDomain: string): Promise<SellerProfile | null> {
  const r = await taskCheck<any>(taskId);
  if (r.failed) throw new Error("Seller research failed");
  if (!r.done) return null;
  const content = r.content ?? {};
  return {
    domain: normalizedDomain,
    companyName: content.company_name || normalizedDomain,
    productDescription: content.product_description || "",
    targetCustomers: content.target_customers || "",
    problemsSolved: content.problems_solved || "",
    buyerPersonas: arr(content.buyer_personas),
    industries: arr(content.industries),
    raw: r,
  };
}
