// Engine orchestrator - the provider-agnostic interface (spec §7).
// Stages: A research → B situations → C/D discover → E/F qualify.

export * from "./types";
export { LIMITS, FINDALL_PRICE, estimateFindAllCost } from "./config";

export { researchCompany, startResearch, finishResearch } from "./seller";
export { generateSituations, startSituations, finishSituations } from "./situations";
export { launchDiscovery, discoverCandidates, discoveryStatus, discoveryResult, resolveDomain, isMatched } from "./discovery";
export { qualifyCandidates } from "./qualify";

import { researchCompany } from "./seller";
import { generateSituations } from "./situations";
import { discoverCandidates } from "./discovery";
import { qualifyCandidates } from "./qualify";
import type { BuyingSituation, IcpConstraints, Opportunity, SellerProfile } from "./types";

/** Default ICP skeleton derived from a seller profile; the user can adjust it. */
export function defaultIcp(profile: SellerProfile): IcpConstraints {
  return {
    geographies: [],
    industries: profile.industries ?? [],
    excludedIndustries: [],
    sizeMin: null,
    sizeMax: null,
    dailyTarget: 5,
  };
}

/**
 * Run one situation end-to-end and return qualified opportunities. Used by the
 * headless E2E script and the discovery worker. Persistence is layered on top.
 */
export async function runSituation(
  situation: BuyingSituation,
  icp: IcpConstraints,
  opts?: { matchLimit?: number; onTick?: (s: { status: string; matchedCount: number }) => void },
): Promise<{ opportunities: Opportunity[]; rejected: Array<{ name: string; reason: string }>; runId: string; estCost: number }> {
  const result = await discoverCandidates(situation, icp, {
    matchLimit: opts?.matchLimit,
    onTick: (s) => opts?.onTick?.({ status: s.status, matchedCount: s.matchedCount }),
  });
  const { qualified, rejected } = await qualifyCandidates(result.candidates, situation);
  return { opportunities: qualified, rejected, runId: result.runId, estCost: result.estCost };
}
