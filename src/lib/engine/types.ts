// Shared engine types. These mirror the DB schema (Phase 2) but are provider-agnostic.

export type Generator = "preview" | "base" | "core" | "pro";

/** Stage A - structured understanding of the seller. */
export interface SellerProfile {
  domain: string;
  companyName: string;
  productDescription: string;
  targetCustomers: string;
  problemsSolved: string;
  buyerPersonas: string[];
  industries: string[];
  /** raw provider research payload, for provenance */
  raw?: unknown;
}

export interface MatchCondition {
  name: string;
  description: string;
}

/**
 * Stage B - a buying situation. The discoveryObjective + matchConditions encode
 * the validated IP: target the BUYER's world, exclude vendors.
 */
export interface BuyingSituation {
  name: string;
  description: string;
  /** why the situation creates demand for the seller's product */
  demandHypothesis: string;
  observableIndicators: string[];
  evidenceSources: string[];
  /** natural-language objective handed to FindAll (buyer-centric, vendor-excluding) */
  discoveryObjective: string;
  matchConditions: MatchCondition[];
  generator: Generator;
  source: "ai" | "user";
}

export interface IcpConstraints {
  geographies: string[];
  industries: string[];
  excludedIndustries: string[];
  sizeMin?: number | null;
  sizeMax?: number | null;
  dailyTarget: number;
}

export interface Citation {
  url: string;
  title?: string;
  date?: string;
  excerpts?: string[];
}

export interface Basis {
  field: string;
  reasoning: string;
  confidence?: string;
  citations: Citation[];
}

/** Raw candidate as returned by the discovery provider (FindAll). */
export interface Candidate {
  candidateId: string;
  name: string;
  /** provider-returned URL - may be a directory/profile page, not the real domain */
  url: string;
  description: string;
  matchStatus: "matched" | "unmatched" | "generated" | string;
  output?: unknown;
  basis: Basis[];
}

export interface DiscoveryRunResult {
  runId: string;
  status: string;
  candidatesCount: number;
  matchedCount: number;
  candidates: Candidate[];
  /** estimated cost in USD based on generator + matched count */
  estCost: number;
}

/** Stage F - a qualified, deliverable opportunity. */
export interface Opportunity {
  company: { name: string; domain: string };
  situationName: string;
  whatHappened: string; // verified fact
  whyItMatters: string; // interpretation (kept distinct from fact)
  confidence: string;
  evidence: Citation[];
  evidenceDate?: string;
  discoveredAt: string;
}

// ---------------- Contacts / email ----------------
/**
 * Email lookup outcome. 'found' means an address was returned but is NOT verified -
 * never render it as verified. 'verified' is reserved for an explicit provider
 * verification signal (none today). null/'unknown' = not yet attempted.
 */
export type EmailStatus = "unknown" | "none" | "found" | "verified";

// ---------------- Outreach ----------------
export type OutreachChannel = "email" | "linkedin";

export interface OutreachFollowup {
  channel: OutreachChannel;
  /** days to wait after the previous touch */
  waitDays: number;
  subject?: string;
  body: string;
}

/** Generated outreach for one opportunity+contact, grounded in stored evidence only. */
export interface OutreachContent {
  email?: { subject: string; body: string };
  linkedin?: { body: string };
  followups?: OutreachFollowup[];
}
