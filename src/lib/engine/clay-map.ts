// Map one Clay Seller Intelligence result into HotNow's seller, ICP, and
// FindAll-ready buying situations. Clay does not emit discoveryObjective or
// matchConditions; those are synthesized here so discovery can stay on FindAll.

import { LIMITS } from "./config";
import type { BuyingSituation, IcpConstraints, SellerProfile } from "./types";
import { normalizeDomain } from "../util/domain";

export interface SellerIntelligence {
  profile: SellerProfile;
  icp: IcpConstraints;
  situations: BuyingSituation[];
}

const END_OPERATOR =
  "The company is an end operator experiencing the situation, not a software/SaaS vendor, consultancy, agency, staffing firm, or data/directory provider.";

export function mapClayIntelligence(
  payload: unknown,
  domain: string,
  raw?: unknown,
  opts?: { dailyTarget?: number },
): SellerIntelligence {
  const body = asRecord(payload);
  if (!body) throw new Error("Clay result_json did not contain seller intelligence");
  const seller = asRecord(body.seller);
  if (!seller) throw new Error("Clay result_json is missing seller");
  const icpRaw = asRecord(body.icp) ?? {};
  const situationsRaw = Array.isArray(body.buying_situations)
    ? body.buying_situations
    : Array.isArray(body.situations)
      ? body.situations
      : null;
  if (!situationsRaw) throw new Error("Clay result_json is missing buying_situations");

  const sellerDomain = normalizeDomain(text(seller.domain) || domain) || normalizeDomain(domain);
  const companyName = text(seller.company_name) || sellerDomain;
  const industries = arr(seller.target_industries);
  const icpIndustries = arr(icpRaw.industries);
  const companyTypes = arr(seller.target_company_types);
  const description = text(seller.description) || arr(seller.products_services).join(", ");
  const profile: SellerProfile = {
    domain: sellerDomain,
    companyName,
    productDescription: description,
    targetCustomers: companyTypes.join(", "),
    problemsSolved: text(seller.value_proposition),
    buyerPersonas: arr(seller.buyer_personas),
    industries: industries.length ? industries : icpIndustries,
    raw: raw ?? { provider: "clay", result: body },
  };

  const size = parseEmployeeRange(icpRaw.employee_range);
  const geographies = arr(icpRaw.geographies);
  const sellerGeos = arr(seller.target_geographies);
  const icp: IcpConstraints = {
    geographies: geographies.length ? geographies : sellerGeos,
    industries: icpIndustries.length ? icpIndustries : industries,
    excludedIndustries: arr(icpRaw.exclusions),
    sizeMin: size.sizeMin,
    sizeMax: size.sizeMax,
    dailyTarget: opts?.dailyTarget ?? 5,
  };

  const situations = situationsRaw
    .map((row) => asRecord(row))
    .filter((row): row is Record<string, unknown> => !!row && !blankSituation(row))
    .map((row) => toSituation(row, seller, icpRaw, sellerDomain, companyName));
  if (!situations.length) throw new Error("Clay returned no buying situations");

  return { profile, icp, situations };
}

function toSituation(
  row: Record<string, unknown>,
  seller: Record<string, unknown>,
  icp: Record<string, unknown>,
  domain: string,
  companyName: string,
): BuyingSituation {
  const name = text(row.name) || text(row.observable_event) || "Buying situation";
  const description = text(row.description);
  const event = text(row.observable_event) || description || name;
  const recency = positiveInt(row.recency_days) ?? LIMITS.freshnessWindowDays;
  const { startDay, endDay } = recencyWindow(recency);
  return {
    name,
    description: description || event,
    demandHypothesis: text(row.why_it_creates_demand),
    observableIndicators: arr(row.evidence_to_find),
    evidenceSources: arr(row.likely_sources),
    discoveryObjective: discoveryObjective({
      name, description, event, recency, startDay, endDay, seller, icp, domain, companyName,
    }),
    matchConditions: [
      { name: "situation_match", description: `Public evidence shows the company experienced: ${event}.` },
      { name: "end_operator", description: END_OPERATOR },
      {
        name: "recency",
        description: `The event occurred between ${startDay} and ${endDay} (within the last ${recency} days).`,
      },
    ],
    generator: LIMITS.defaultGenerator,
    source: "ai",
  };
}

function discoveryObjective(input: {
  name: string;
  description: string;
  event: string;
  recency: number;
  startDay: string;
  endDay: string;
  seller: Record<string, unknown>;
  icp: Record<string, unknown>;
  domain: string;
  companyName: string;
}): string {
  const types = arr(input.seller.target_company_types);
  const industries = arr(input.icp.industries).length ? arr(input.icp.industries) : arr(input.seller.target_industries);
  const geos = arr(input.icp.geographies).length ? arr(input.icp.geographies) : arr(input.seller.target_geographies);
  const buyer = [
    types.length ? `company types ${types.join(", ")}` : "",
    industries.length ? `industries ${industries.join(", ")}` : "",
    geos.length ? `geographies ${geos.join(", ")}` : "",
  ].filter(Boolean);
  return [
    `Find companies in the buyer's own market that recently experienced this event: ${input.event}.`,
    input.name !== input.event ? `Situation: ${input.name}.` : "",
    input.description && input.description !== input.event ? input.description : "",
    buyer.length ? `Prefer buyers that are ${buyer.join("; ")}.` : "",
    `The event must have happened within the last ${input.recency} days, between ${input.startDay} and ${input.endDay}.`,
    `Do not return ${input.companyName} (${input.domain}) or vendors that sell a similar product.`,
    "Exclude software/SaaS vendors, consultancies, agencies, staffing firms, and data/directory providers. Return the end operator experiencing the event.",
  ].filter(Boolean).join(" ");
}

export function parseEmployeeRange(raw: unknown): { sizeMin: number | null; sizeMax: number | null } {
  const record = asRecord(raw);
  if (record) {
    const sizeMin = num(record.min ?? record.size_min ?? record.from);
    const sizeMax = num(record.max ?? record.size_max ?? record.to);
    if (sizeMin != null || sizeMax != null) return ordered(sizeMin, sizeMax);
  }
  if (typeof raw === "number") {
    const n = num(raw);
    return { sizeMin: n, sizeMax: n };
  }
  const s = text(raw);
  if (!s) return { sizeMin: null, sizeMax: null };
  const range = s.match(/(\d[\d,]*)\s*(?:-|–|—|to)\s*(\d[\d,]*)/i);
  if (range) return ordered(num(range[1]), num(range[2]));
  const plus = s.match(/(\d[\d,]*)\s*\+/);
  if (plus) return { sizeMin: num(plus[1]), sizeMax: null };
  const under = s.match(/(?:under|less than|<)\s*(\d[\d,]*)/i);
  if (under) return { sizeMin: null, sizeMax: num(under[1]) };
  const single = s.match(/(\d[\d,]*)/);
  if (single) {
    const n = num(single[1]);
    return { sizeMin: n, sizeMax: n };
  }
  return { sizeMin: null, sizeMax: null };
}

function recencyWindow(days: number): { startDay: string; endDay: string } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { startDay: start.toISOString().slice(0, 10), endDay: end.toISOString().slice(0, 10) };
}

function blankSituation(row: Record<string, unknown>): boolean {
  return !text(row.name) && !text(row.description) && !text(row.observable_event) && !text(row.why_it_creates_demand);
}

function ordered(sizeMin: number | null, sizeMax: number | null): { sizeMin: number | null; sizeMax: number | null } {
  if (sizeMin != null && sizeMax != null && sizeMin > sizeMax) return { sizeMin: sizeMax, sizeMax: sizeMin };
  return { sizeMin, sizeMax };
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/,/g, "").trim()) : NaN;
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (i < 0 || i > 10_000_000) return null;
  return i;
}

function positiveInt(v: unknown): number | null {
  const n = num(v);
  if (n == null || n <= 0 || n > 3650) return null;
  return n;
}

function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap((item) => arr(item));
  if (typeof v === "string" && v.trim()) return [v.trim()];
  const record = asRecord(v);
  if (record) {
    const label = record.name ?? record.title ?? record.label;
    if (typeof label === "string" && label.trim()) return [label.trim()];
  }
  return [];
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
