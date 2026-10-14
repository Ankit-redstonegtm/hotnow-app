// Stage E/F - Qualification + opportunity assembly.
// Turns verified candidates into deliverable opportunities, keeping the verified
// FACT (what happened) distinct from the INTERPRETATION (why it matters), and
// enforcing freshness + match status. Dedup against prior delivery is done by the
// persistence layer (Phase 2) via UNIQUE(seller, company, situation).

import { LIMITS } from "./config";
import { isMatched, resolveDomain } from "./discovery";
import type { BuyingSituation, Candidate, Citation, Opportunity } from "./types";

export interface QualifyResult {
  qualified: Opportunity[];
  rejected: Array<{ name: string; reason: string }>;
}

export async function qualifyCandidates(
  candidates: Candidate[],
  situation: BuyingSituation,
  opts?: { freshnessWindowDays?: number; resolveDomains?: boolean },
): Promise<QualifyResult> {
  const windowDays = opts?.freshnessWindowDays ?? LIMITS.freshnessWindowDays;
  const qualified: Opportunity[] = [];
  const rejected: Array<{ name: string; reason: string }> = [];

  for (const c of candidates) {
    if (!isMatched(c)) {
      rejected.push({ name: c.name, reason: `match_status=${c.matchStatus}` });
      continue;
    }
    if (!c.name) {
      rejected.push({ name: c.candidateId, reason: "no company name" });
      continue;
    }

    const citations = collectCitations(c);
    if (citations.length === 0) {
      rejected.push({ name: c.name, reason: "no supporting evidence/citations" });
      continue;
    }

    const evidenceDate = latestDate(citations);
    if (evidenceDate && !isFresh(evidenceDate, windowDays)) {
      rejected.push({ name: c.name, reason: `stale evidence (${evidenceDate})` });
      continue;
    }

    const domain = opts?.resolveDomains === false ? c.url : await resolveDomain(c);

    // Undated evidence can't be checked for recency, so it passes the freshness gate
    // above - but we must not present it with full confidence. Cap it to "low" so the
    // UI honestly reflects that the timing is unverified (without dropping the lead).
    const confidence = evidenceDate ? confidenceOf(c) : "low";

    qualified.push({
      company: { name: c.name, domain },
      situationName: situation.name,
      whatHappened: whatHappened(c, situation),
      whyItMatters: situation.demandHypothesis,
      confidence,
      evidence: citations,
      evidenceDate: evidenceDate ?? undefined,
      discoveredAt: new Date().toISOString(),
    });
  }

  return { qualified, rejected };
}

/** The verified fact: prefer the reasoning tied to the recency/expansion condition. */
function whatHappened(c: Candidate, situation: BuyingSituation): string {
  const recencyNames = situation.matchConditions
    .filter((m) => /recent|expansion|hiring|freshness|date|announc/i.test(m.name + m.description))
    .map((m) => m.name);
  const b =
    c.basis.find((x) => recencyNames.includes(x.field)) ||
    c.basis.find((x) => x.reasoning) ||
    c.basis[0];
  return b?.reasoning?.trim() || c.description?.trim() || "Evidence of the buying situation was found.";
}

function collectCitations(c: Candidate): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const b of c.basis) {
    for (const ct of b.citations) {
      if (ct.url && !seen.has(ct.url)) {
        seen.add(ct.url);
        out.push(ct);
      }
    }
  }
  return out;
}

function latestDate(citations: Citation[]): string | null {
  const dates = citations
    .map((c) => c.date)
    .filter((d): d is string => Boolean(d))
    .map((d) => ({ d, t: Date.parse(d) }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((a, b) => b.t - a.t);
  return dates[0]?.d ?? null;
}

function isFresh(dateStr: string, windowDays: number): boolean {
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return true; // undated → don't reject on freshness alone
  const ageDays = (Date.now() - t) / 86_400_000;
  return ageDays <= windowDays;
}

function confidenceOf(c: Candidate): string {
  const conf = c.basis.map((b) => b.confidence).filter(Boolean) as string[];
  if (conf.some((x) => /low/i.test(x))) return "low";
  if (conf.some((x) => /medium|moderate/i.test(x))) return "medium";
  if (conf.length) return "high";
  return "medium";
}
