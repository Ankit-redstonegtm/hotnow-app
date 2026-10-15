import { describe, it, expect } from "vitest";
import { mapClayIntelligence, toIcp, toSituations } from "./clay-intelligence";
import type { SellerIntelligence } from "../providers/clay";

const intel: SellerIntelligence = {
  seller: {
    domain: "spotio.com", company_name: "SPOTIO", description: "Field sales execution platform",
    products_services: ["Routing", "Territory"], value_proposition: "Win more deals",
    target_industries: ["Roofing", "Solar"], target_company_types: ["Field sales orgs"],
    target_geographies: ["US"], buyer_personas: ["VP Sales", "RevOps"],
  },
  icp: { company_description: "B2B field sales orgs", industries: ["Roofing"], geographies: ["US"], employee_range: "50-500", exclusions: ["Inside-sales only"] },
  buying_situations: [
    { id: "situation_1", name: "Territory re-org", description: "d", observable_event: "Announces new territories", why_it_creates_demand: "Needs territory mgmt", evidence_to_find: ["press release"], likely_sources: ["news"], recency_days: 180, priority: 1 },
  ],
};

describe("mapClayIntelligence", () => {
  it("maps seller fields into SellerProfile", () => {
    const { profile } = mapClayIntelligence(intel, "spotio.com");
    expect(profile.companyName).toBe("SPOTIO");
    expect(profile.industries).toContain("Roofing");
    expect(profile.buyerPersonas).toContain("VP Sales");
    expect(profile.raw).toBe(intel);
  });

  it("parses employee_range into sizeMin/sizeMax", () => {
    const icp = toIcp(intel);
    expect(icp.sizeMin).toBe(50);
    expect(icp.sizeMax).toBe(500);
    expect(icp.excludedIndustries).toContain("Inside-sales only");
  });

  it("handles open-ended employee ranges like 5-5000+", () => {
    const icp = toIcp({ ...intel, icp: { ...intel.icp, employee_range: "5-5000+" } });
    expect(icp.sizeMin).toBe(5);
    expect(icp.sizeMax).toBe(5000);
  });

  it("maps situations with vendor-exclusion + recency match conditions", () => {
    const sits = toSituations(intel);
    expect(sits).toHaveLength(1);
    const s = sits[0];
    expect(s.demandHypothesis).toBe("Needs territory mgmt");
    expect(s.observableIndicators).toContain("Announces new territories");
    expect(s.evidenceSources).toContain("news");
    const names = s.matchConditions.map((m) => m.name);
    expect(names).toEqual(expect.arrayContaining(["observable_event", "recency", "end_operator"]));
    const endOp = s.matchConditions.find((m) => m.name === "end_operator");
    expect(endOp?.description).toMatch(/not a software\/SaaS vendor/i);
    expect(s.generator).toBe("base");
  });
});
