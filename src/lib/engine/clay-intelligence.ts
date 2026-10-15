// Map Clay seller-intelligence output into HotNow's existing engine types, so Clay can
// REPLACE the Parallel-research + Gemini-situation stages while the rest of the pipeline
// (discovery, contacts, outreach) keeps consuming seller_profiles / icp_constraints /
// buying_situations exactly as before.

import type { SellerIntelligence } from "../providers/clay";
import type { BuyingSituation, IcpConstraints, SellerProfile } from "./types";

const VENDOR_EXCLUSION =
  "The company is an end operator experiencing the situation, not a software/SaaS vendor, consultancy, agency, staffing firm, or data/directory provider.";

/** Parse a free-form employee range like "50-500" or "5-5000+" into min/max (best effort). */
function parseEmployeeRange(range: string | null): { min: number | null; max: number | null } {
  if (!range) return { min: null, max: null };
  const nums = (range.match(/\d[\d,]*/g) || []).map((n) => parseInt(n.replace(/,/g, ""), 10)).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return { min: null, max: null };
  if (nums.length === 1) return { min: nums[0], max: null };
  return { min: nums[0], max: nums[1] };
}

export function toSellerProfile(intel: SellerIntelligence, domain: string): SellerProfile {
  const s = intel.seller;
  const targetCustomers = [
    ...(s.target_company_types || []),
    ...(s.target_industries || []),
  ].filter(Boolean).join("; ");
  return {
    domain: s.domain || domain,
    companyName: s.company_name || domain,
    productDescription: s.description || s.value_proposition || "",
    targetCustomers: targetCustomers || intel.icp.company_description || "",
    problemsSolved: s.value_proposition || "",
    buyerPersonas: s.buyer_personas || [],
    industries: s.target_industries || [],
    raw: intel,
  };
}

export function toIcp(intel: SellerIntelligence): IcpConstraints {
  const { min, max } = parseEmployeeRange(intel.icp.employee_range);
  return {
    geographies: intel.icp.geographies || [],
    industries: intel.icp.industries || [],
    excludedIndustries: intel.icp.exclusions || [],
    sizeMin: min,
    sizeMax: max,
    dailyTarget: 5,
  };
}

export function toSituations(intel: SellerIntelligence): BuyingSituation[] {
  return intel.buying_situations.map((s) => {
    const objectiveBits = [s.observable_event || s.description].filter(Boolean);
    objectiveBits.push(`Exclude vendors/competitors of the seller; target end operators only.`);
    return {
      name: s.name,
      description: s.description,
      demandHypothesis: s.why_it_creates_demand,
      observableIndicators: [s.observable_event, ...(s.evidence_to_find || [])].filter(Boolean),
      evidenceSources: s.likely_sources || [],
      discoveryObjective: objectiveBits.join(" ").trim(),
      matchConditions: [
        { name: "observable_event", description: s.observable_event || s.description },
        { name: "recency", description: `Supporting evidence is within the last ${s.recency_days || 90} days.` },
        { name: "end_operator", description: VENDOR_EXCLUSION },
      ],
      generator: "base",
      source: "ai",
    };
  });
}

/** Full mapping bundle for persistence. */
export function mapClayIntelligence(intel: SellerIntelligence, domain: string): {
  profile: SellerProfile;
  icp: IcpConstraints;
  situations: BuyingSituation[];
} {
  return {
    profile: toSellerProfile(intel, domain),
    icp: toIcp(intel),
    situations: toSituations(intel),
  };
}
