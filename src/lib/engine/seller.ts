// Stage A+B - Seller intelligence. One Clay routine returns the seller, ICP, and
// buying situations. FindAll objectives are synthesized in clay-map.ts.
// The routine input is seller_domain only; a user-typed description is not sent.

import { LIMITS } from "./config";
import { mapClayIntelligence, type SellerIntelligence } from "./clay-map";
import { checkSellerIntelligence, isTransientClayError, startSellerIntelligence } from "../providers/clay";
import type { SellerProfile } from "./types";
import { normalizeDomain } from "../util/domain";

export type { SellerIntelligence };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function startResearch(domain: string, opts?: { itemId?: string }): Promise<{ taskId: string; normalizedDomain: string }> {
  const normalized = normalizeDomain(domain);
  const { runId } = await startSellerIntelligence(normalized, opts?.itemId || crypto.randomUUID());
  return { taskId: runId, normalizedDomain: normalized };
}

/** Returns seller, ICP, and situations when the routine is done; null while it is still running. */
export async function finishResearch(taskId: string, normalizedDomain: string): Promise<SellerIntelligence | null> {
  const check = await checkSellerIntelligence(taskId);
  if (!check.done) return null;
  const domain = normalizeDomain(normalizedDomain);
  return mapClayIntelligence(check.payload, domain, { provider: "clay", result: check.payload, routine_response: check.raw });
}

/** Blocking research for scripts. The worker uses startResearch + finishResearch. */
export async function researchSeller(domain: string): Promise<SellerIntelligence> {
  const { taskId, normalizedDomain } = await startResearch(domain);
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const result = await finishResearch(taskId, normalizedDomain);
      if (result) return result;
    } catch (error) {
      if (!isTransientClayError(error)) throw error;
    }
    await sleep(LIMITS.pollIntervalMs);
  }
  throw new Error(`Clay seller research timed out for ${normalizedDomain}`);
}

export async function researchCompany(domain: string): Promise<SellerProfile> {
  return (await researchSeller(domain)).profile;
}
