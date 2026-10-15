import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the heavy deps so we can test ingest in isolation; pure fns below use real util/domain.
vi.mock("@/lib/providers/parallel", () => ({ taskCheck: vi.fn(), taskCreate: vi.fn() }));
vi.mock("@/lib/db/repo", () => ({
  upsertCompany: vi.fn(async () => "company-1"),
  upsertOpportunity: vi.fn(async () => ({ id: "opp-1", isNew: true })),
  updateRun: vi.fn(async () => {}),
  createRun: vi.fn(async () => "run-1"),
  getSituations: vi.fn(async () => []),
}));
vi.mock("./worker", () => ({ ingestRun: vi.fn(async () => ({ runId: "x", status: "completed" })), toSituation: vi.fn((r) => r) }));

import { qualifyTaskCompanies, recencyDaysFor, buildTaskPrompt, ingestTaskRun, ingestAnyRun } from "./task-discovery";
import { taskCheck } from "@/lib/providers/parallel";
import { upsertOpportunity, updateRun } from "@/lib/db/repo";
import { ingestRun } from "./worker";
import type { BuyingSituation, IcpConstraints, SellerProfile } from "@/lib/engine";

const today = new Date().toISOString().slice(0, 10);
const situation: BuyingSituation = {
  name: "Scaling field teams", description: "d", demandHypothesis: "needs field tooling",
  observableIndicators: ["hiring reps"], evidenceSources: ["job boards"],
  discoveryObjective: "Companies hiring 5+ field reps. Evidence within the last 120 days.",
  matchConditions: [{ name: "recency", description: "within the last 120 days" }], generator: "base", source: "ai",
};

function company(over: Record<string, unknown> = {}) {
  return {
    company_name: "Acme Roofing", company_domain: "acmeroofing.com", observed_event: "Posted 6 outside sales roles",
    evidence_url: "https://acmeroofing.com/careers/sales", event_date: today, confidence: "high",
    why_this_company_needs_the_product_now: "scaling field reps", ...over,
  };
}

describe("recencyDaysFor", () => {
  it("parses the window from match conditions, else defaults 120", () => {
    expect(recencyDaysFor(situation)).toBe(120);
    expect(recencyDaysFor({ ...situation, discoveryObjective: "x within 90 days", matchConditions: [] })).toBe(90);
    expect(recencyDaysFor(undefined)).toBe(120);
  });
});

describe("buildTaskPrompt", () => {
  it("includes seller, situation, recency window and exclusions", () => {
    const seller: SellerProfile = { domain: "spotio.com", companyName: "SPOTIO", productDescription: "field sales platform", targetCustomers: "field teams", problemsSolved: "", buyerPersonas: [], industries: ["Roofing"] };
    const icp: IcpConstraints = { geographies: ["US"], industries: ["Roofing"], excludedIndustries: ["Inside-sales only"], sizeMin: 5, sizeMax: 500, dailyTarget: 3 };
    const p = buildTaskPrompt(seller, icp, situation);
    expect(p).toContain("SPOTIO");
    expect(p).toContain("Scaling field teams");
    expect(p).toContain("120 days");
    expect(p).toContain("Inside-sales only");
    expect(p).toMatch(/exclude software\/SaaS vendors/i);
  });
});

describe("qualifyTaskCompanies", () => {
  it("qualifies a valid company and maps fact vs interpretation", () => {
    const out = qualifyTaskCompanies([company()], situation, 120);
    expect(out).toHaveLength(1);
    expect(out[0].company.domain).toBe("acmeroofing.com");
    expect(out[0].whatHappened).toContain("Posted 6");
    expect(out[0].whyItMatters).toBe("scaling field reps");
    expect(out[0].confidence).toBe("high");
  });
  it("rejects companies with no official domain", () => {
    expect(qualifyTaskCompanies([company({ company_domain: "" })], situation, 120)).toHaveLength(0);
  });
  it("rejects aggregator domains", () => {
    expect(qualifyTaskCompanies([company({ company_domain: "linkedin.com/company/acme" })], situation, 120)).toHaveLength(0);
  });
  it("rejects companies with no specific evidence url", () => {
    expect(qualifyTaskCompanies([company({ evidence_url: "" })], situation, 120)).toHaveLength(0);
    expect(qualifyTaskCompanies([company({ evidence_url: "not-a-url" })], situation, 120)).toHaveLength(0);
  });
  it("rejects a company with no observed event", () => {
    expect(qualifyTaskCompanies([company({ observed_event: "" })], situation, 120)).toHaveLength(0);
  });
  it("rejects stale evidence", () => {
    expect(qualifyTaskCompanies([company({ event_date: "2000-01-01" })], situation, 120)).toHaveLength(0);
  });
  it("keeps undated evidence but caps confidence to low", () => {
    const out = qualifyTaskCompanies([company({ event_date: "", confidence: "high" })], situation, 120);
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe("low");
  });
  it("dedupes by domain within the batch", () => {
    const out = qualifyTaskCompanies([company(), company({ company_name: "Acme (dup)" })], situation, 120);
    expect(out).toHaveLength(1);
  });
  it("delivers at most 3, best confidence first", () => {
    const many = ["a", "b", "c", "d", "e"].map((x, i) => company({ company_domain: `${x}.com`, confidence: i < 2 ? "high" : "low" }));
    const out = qualifyTaskCompanies(many, situation, 120);
    expect(out).toHaveLength(3);
    expect(out[0].confidence).toBe("high");
  });
  it("returns empty for empty/partial input", () => {
    expect(qualifyTaskCompanies([], situation, 120)).toHaveLength(0);
  });
});

describe("ingestTaskRun", () => {
  beforeEach(() => vi.clearAllMocks());
  const run = { id: "run-1", provider: "parallel_task", provider_job_id: "task-1", seller_profile_id: "sp-1", situation_id: "sit-1" };

  it("returns running when the task isn't done", async () => {
    vi.mocked(taskCheck).mockResolvedValue({ done: false, failed: false } as any);
    expect((await ingestTaskRun({} as any, run, situation)).status).toBe("running");
  });
  it("marks failed when the task failed", async () => {
    vi.mocked(taskCheck).mockResolvedValue({ done: false, failed: true } as any);
    const res = await ingestTaskRun({} as any, run, situation);
    expect(res.status).toBe("failed");
    expect(updateRun).toHaveBeenCalled();
  });
  it("persists up to 3 qualified opportunities on completion", async () => {
    const companies = ["a", "b", "c", "d"].map((x) => company({ company_domain: `${x}.com` }));
    vi.mocked(taskCheck).mockResolvedValue({ done: true, failed: false, content: { companies } } as any);
    const res = await ingestTaskRun({} as any, run, situation);
    expect(res.status).toBe("completed");
    expect(res.matched).toBe(3);
    expect(upsertOpportunity).toHaveBeenCalledTimes(3);
  });
  it("treats a transient status error as running (retry next tick)", async () => {
    vi.mocked(taskCheck).mockRejectedValue(new Error("network"));
    expect((await ingestTaskRun({} as any, run, situation)).status).toBe("running");
  });
});

describe("ingestAnyRun dispatch", () => {
  beforeEach(() => vi.clearAllMocks());
  it("routes FindAll runs to the legacy worker", async () => {
    await ingestAnyRun({} as any, { provider: "parallel", id: "r", provider_job_id: "f", seller_profile_id: "s", situation_id: "x" });
    expect(ingestRun).toHaveBeenCalled();
  });
  it("routes Task runs to ingestTaskRun (not the legacy worker)", async () => {
    vi.mocked(taskCheck).mockResolvedValue({ done: false, failed: false } as any);
    await ingestAnyRun({} as any, { provider: "parallel_task", id: "r", provider_job_id: "t", seller_profile_id: "s", situation_id: "x" }, situation);
    expect(ingestRun).not.toHaveBeenCalled();
  });
});
