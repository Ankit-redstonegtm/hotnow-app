import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startSellerIntelligence, getSellerIntelligence, parseIntelligence } from "./clay";

const OK_CONTRACT = {
  seller: {
    domain: "spotio.com", company_name: "SPOTIO", description: "Field sales platform",
    products_services: ["Routing"], value_proposition: "Win more", target_industries: ["Roofing"],
    target_company_types: ["Field sales orgs"], target_geographies: ["US"], buyer_personas: ["VP Sales"],
  },
  icp: { company_description: "Field sales orgs", industries: ["Roofing"], geographies: ["US"], employee_range: "50-500", exclusions: ["Inside-sales only"] },
  buying_situations: Array.from({ length: 5 }, (_, i) => ({
    id: `situation_${i + 1}`, name: `S${i}`, description: "d", observable_event: "e",
    why_it_creates_demand: "w", evidence_to_find: ["x"], likely_sources: ["news"], recency_days: 120, priority: i + 1,
  })),
};

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    status,
    text: async () => JSON.stringify(body),
  });
}

beforeEach(() => { process.env.CLAY_API_KEY = "test-key"; });
afterEach(() => { vi.restoreAllMocks(); });

describe("startSellerIntelligence", () => {
  it("POSTs and returns the run id", async () => {
    vi.stubGlobal("fetch", mockFetch(202, { routine_run_id: "run_123", status: "in_progress" }));
    const { runId } = await startSellerIntelligence("spotio.com");
    expect(runId).toBe("run_123");
  });
  it("throws when no run id is returned", async () => {
    vi.stubGlobal("fetch", mockFetch(202, { status: "in_progress" }));
    await expect(startSellerIntelligence("spotio.com")).rejects.toThrow(/routine_run_id/);
  });
  it("throws on a 4xx error from Clay", async () => {
    vi.stubGlobal("fetch", mockFetch(400, { message: "Invalid routine id" }));
    await expect(startSellerIntelligence("spotio.com")).rejects.toThrow(/400/);
  });
  it("requires a domain", async () => {
    await expect(startSellerIntelligence("")).rejects.toThrow(/required/);
  });
});

describe("getSellerIntelligence", () => {
  it("returns running on 202", async () => {
    vi.stubGlobal("fetch", mockFetch(202, { status: "in_progress" }));
    expect((await getSellerIntelligence("run_1")).state).toBe("running");
  });
  it("returns complete + parsed intelligence on 200", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { status: "complete", data: [{ id: "spotio.com", status: "complete", result: { result_json: JSON.stringify(OK_CONTRACT), situation_count: 5 } }] }));
    const r = await getSellerIntelligence("run_1");
    expect(r.state).toBe("complete");
    expect(r.intelligence?.seller.company_name).toBe("SPOTIO");
    expect(r.intelligence?.buying_situations).toHaveLength(5);
  });
  it("returns failed when the item failed", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { status: "complete", data: [{ id: "x", status: "failed", error: { message: "boom" } }] }));
    const r = await getSellerIntelligence("run_1");
    expect(r.state).toBe("failed");
    expect(r.error).toMatch(/boom/);
  });
  it("returns failed on invalid result_json", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { status: "complete", data: [{ id: "x", status: "complete", result: { result_json: "{not json" } }] }));
    expect((await getSellerIntelligence("run_1")).state).toBe("failed");
  });
  it("propagates a network/timeout error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("The operation was aborted")));
    await expect(getSellerIntelligence("run_1")).rejects.toThrow(/aborted/);
  });
});

describe("parseIntelligence", () => {
  it("parses a valid contract", () => {
    const intel = parseIntelligence({ result_json: JSON.stringify(OK_CONTRACT) });
    expect(intel.seller.company_name).toBe("SPOTIO");
    expect(intel.icp.employee_range).toBe("50-500");
    expect(intel.buying_situations[0].recency_days).toBe(120);
  });
  it("throws on missing result_json", () => {
    expect(() => parseIntelligence({})).toThrow(/result_json/);
  });
  it("throws on invalid JSON", () => {
    expect(() => parseIntelligence({ result_json: "nope" })).toThrow();
  });
  it("throws when the profile is unusable (empty)", () => {
    expect(() => parseIntelligence({ result_json: JSON.stringify({ seller: {}, icp: {}, buying_situations: [] }) })).toThrow(/usable seller/);
  });
  it("caps situations at 5 and defaults recency/priority", () => {
    const many = { ...OK_CONTRACT, buying_situations: Array.from({ length: 8 }, (_, i) => ({ name: `S${i}`, observable_event: "e", why_it_creates_demand: "w" })) };
    const intel = parseIntelligence({ result_json: JSON.stringify(many) });
    expect(intel.buying_situations).toHaveLength(5);
    expect(intel.buying_situations[0].recency_days).toBe(90);
    expect(intel.buying_situations[0].priority).toBe(1);
  });
});
