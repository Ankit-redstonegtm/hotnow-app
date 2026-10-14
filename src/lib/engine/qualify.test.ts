import { describe, it, expect } from "vitest";
import { qualifyCandidates } from "./qualify";
import type { BuyingSituation, Candidate } from "./types";

const situation: BuyingSituation = {
  name: "Territory expansion",
  description: "",
  demandHypothesis: "New-market entry creates demand for localized logistics.",
  observableIndicators: [],
  evidenceSources: [],
  discoveryObjective: "",
  matchConditions: [{ name: "recent_expansion", description: "announced in the last 6 months" }],
  generator: "base",
  source: "ai",
};

function candidate(over: Partial<Candidate>): Candidate {
  return {
    candidateId: "c1",
    name: "Acme Retail",
    url: "https://acme.com",
    description: "A retailer",
    matchStatus: "matched",
    basis: [],
    ...over,
  };
}

const today = new Date().toISOString().slice(0, 10);
const opts = { resolveDomains: false as const, freshnessWindowDays: 240 };

describe("qualifyCandidates", () => {
  it("qualifies a matched candidate with fresh citations and splits fact vs interpretation", async () => {
    const c = candidate({
      basis: [{ field: "recent_expansion", reasoning: "Opened a UK office in March.", confidence: "high", citations: [{ url: "https://news/1", date: today }] }],
    });
    const { qualified, rejected } = await qualifyCandidates([c], situation, opts);
    expect(rejected).toHaveLength(0);
    expect(qualified).toHaveLength(1);
    expect(qualified[0].whatHappened).toContain("UK office");
    // "why it matters" is the interpretation (demand hypothesis), kept distinct from the fact.
    expect(qualified[0].whyItMatters).toBe(situation.demandHypothesis);
    expect(qualified[0].confidence).toBe("high");
    expect(qualified[0].company.domain).toBe("https://acme.com");
  });

  it("rejects unmatched candidates", async () => {
    const { qualified, rejected } = await qualifyCandidates([candidate({ matchStatus: "unmatched" })], situation, opts);
    expect(qualified).toHaveLength(0);
    expect(rejected[0].reason).toContain("match_status");
  });

  it("rejects a matched candidate with no citations", async () => {
    const c = candidate({ basis: [{ field: "x", reasoning: "something", citations: [] }] });
    const { qualified, rejected } = await qualifyCandidates([c], situation, opts);
    expect(qualified).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/no supporting evidence/);
  });

  it("rejects stale evidence outside the freshness window", async () => {
    const c = candidate({ basis: [{ field: "x", reasoning: "old news", citations: [{ url: "https://news/old", date: "2000-01-01" }] }] });
    const { qualified, rejected } = await qualifyCandidates([c], situation, opts);
    expect(qualified).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/stale/);
  });

  it("rejects a candidate with no company name", async () => {
    const c = candidate({ name: "", basis: [{ field: "x", reasoning: "y", citations: [{ url: "https://n" }] }] });
    const { qualified, rejected } = await qualifyCandidates([c], situation, opts);
    expect(qualified).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/no company name/);
  });
});
