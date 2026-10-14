// Stage C/D - Discovery + domain resolution.
// Launches a FindAll run for a situation (async) and, on ingest, resolves each
// candidate to a real company domain (the provider url can be a directory page).

import { findAllCreate, findAllAwait, findAllStatus, findAllResult, search } from "../providers/parallel";
import type { FindAllStatus } from "../providers/parallel";
import { LIMITS, estimateFindAllCost } from "./config";
import { normalizeDomain, isAggregatorDomain } from "../util/domain";
import type { BuyingSituation, Candidate, DiscoveryRunResult, IcpConstraints } from "./types";

/** Stage C - launch discovery. Returns the provider run id to persist (async). */
export async function launchDiscovery(
  situation: BuyingSituation,
  icp: IcpConstraints,
  opts?: { matchLimit?: number; webhookUrl?: string },
): Promise<{ runId: string }> {
  const matchLimit = clampLimit(opts?.matchLimit ?? icp.dailyTarget ?? LIMITS.defaultMatchLimit);

  // Cost guard before spending (spec §16).
  const worst = estimateFindAllCost(situation.generator, matchLimit);
  if (worst > LIMITS.maxCostPerRunUSD) {
    throw new Error(
      `Run blocked: estimated max cost $${worst.toFixed(2)} exceeds cap $${LIMITS.maxCostPerRunUSD}`,
    );
  }

  const objective = withIcp(situation.discoveryObjective, icp);
  const { runId } = await findAllCreate({
    objective,
    matchConditions: situation.matchConditions,
    generator: situation.generator,
    matchLimit,
    webhookUrl: opts?.webhookUrl,
  });
  return { runId };
}

export { findAllStatus as discoveryStatus, findAllResult as discoveryResult };

/** Convenience for headless/E2E: launch + poll + return mapped candidates. */
export async function discoverCandidates(
  situation: BuyingSituation,
  icp: IcpConstraints,
  opts?: { matchLimit?: number; onTick?: (s: FindAllStatus) => void },
): Promise<DiscoveryRunResult> {
  const { runId } = await launchDiscovery(situation, icp, { matchLimit: opts?.matchLimit });
  const { candidates, status } = await findAllAwait(runId, opts?.onTick);
  const matched = candidates.filter(isMatched);
  return {
    runId,
    status: status?.status ?? "completed",
    candidatesCount: candidates.length,
    matchedCount: matched.length,
    candidates,
    estCost: estimateFindAllCost(situation.generator, matched.length),
  };
}

/** Stage D - resolve a candidate to its real company domain. */
export async function resolveDomain(candidate: Candidate): Promise<string> {
  const fromUrl = normalizeDomain(candidate.url);
  if (fromUrl && !isAggregatorDomain(fromUrl)) return fromUrl;

  // Fall back to a cheap search for the company's official website.
  try {
    const { results } = await search({
      objective: `Official company website domain for "${candidate.name}". Return the company's own homepage, not a directory or profile page.`,
      queries: [`${candidate.name} official website`, `${candidate.name} homepage`],
      mode: "fast",
    });
    for (const r of results) {
      const d = normalizeDomain(r.url);
      if (d && !isAggregatorDomain(d)) return d;
    }
  } catch {
    /* fall through */
  }
  return fromUrl; // last resort - may still be a directory; qualification can flag it
}

export function isMatched(c: Candidate): boolean {
  return /^matched$|verified|confirmed/i.test(String(c.matchStatus));
}

function clampLimit(n: number): number {
  return Math.max(1, Math.min(LIMITS.maxMatchLimit, Math.floor(n || LIMITS.defaultMatchLimit)));
}

/** Fold ICP constraints into the discovery objective (as soft guidance). */
function withIcp(objective: string, icp: IcpConstraints): string {
  const bits: string[] = [objective];
  if (icp.geographies?.length) bits.push(`Prefer companies in: ${icp.geographies.join(", ")}.`);
  if (icp.industries?.length) bits.push(`Prefer industries: ${icp.industries.join(", ")}.`);
  if (icp.excludedIndustries?.length) bits.push(`Exclude industries: ${icp.excludedIndustries.join(", ")}.`);
  return bits.join(" ");
}
