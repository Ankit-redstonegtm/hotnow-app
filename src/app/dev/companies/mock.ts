// SAMPLE DATA ONLY — fabricated companies for the /dev/companies workspace prototype.
// None of this is real; nothing is fetched or persisted.

export type Confidence = "high" | "medium" | "low";

export interface MockCompany {
  id: string;
  name: string;
  domain: string;
  industry: string;
  hqCountry: string;
  employees: number;
  situation: string;
  whatHappened: string; // observed fact
  whyItMatters: string; // inferred relevance
  evidenceCount: number;
  evidenceUrl: string;
  confidence: Confidence;
  discoveredAt: string; // ISO date
}

export const SITUATIONS = [
  "Scaling field teams",
  "Territory expansion",
  "New VP of Sales",
  "Route efficiency push",
  "Replacing manual CRM",
] as const;

export const INDUSTRIES = [
  "Roofing", "Solar", "Home Services", "Medical Devices", "Telecom",
  "Distribution", "Commercial Construction", "Alarm & Security", "Logistics", "CPG",
] as const;

const F = (n: number) => `https://example.com/evidence/${n}`;

export const MOCK_COMPANIES: MockCompany[] = [
  { id: "c01", name: "Spectrum", domain: "spectrum.com", industry: "Telecom", hqCountry: "US", employees: 97000, situation: "Scaling field teams", whatHappened: "Announced a ~100-position outside-sales hiring wave in Oklahoma City.", whyItMatters: "Rapid field hiring often means territory and activity-tracking gaps.", evidenceCount: 3, evidenceUrl: F(1), confidence: "high", discoveredAt: "2026-10-13" },
  { id: "c02", name: "Power Home Remodeling", domain: "powerhrg.com", industry: "Home Services", hqCountry: "US", employees: 2800, situation: "Territory expansion", whatHappened: "Opened its Cleveland market — its 28th US territory — with in-field hiring.", whyItMatters: "A new territory launch creates demand for coverage planning tooling.", evidenceCount: 2, evidenceUrl: F(2), confidence: "high", discoveredAt: "2026-08-28" },
  { id: "c03", name: "Northwind Logistics", domain: "northwind.com", industry: "Logistics", hqCountry: "US", employees: 1200, situation: "Route efficiency push", whatHappened: "Announced a UK distribution hub and 40 operations roles.", whyItMatters: "First overseas site may need new routing and field systems.", evidenceCount: 4, evidenceUrl: F(3), confidence: "high", discoveredAt: "2026-09-28" },
  { id: "c04", name: "Brightwave Retail", domain: "brightwave.co", industry: "CPG", hqCountry: "US", employees: 540, situation: "New VP of Sales", whatHappened: "Posted a VP of Sales role after four years with no sales leader.", whyItMatters: "A first sales leader often rebuilds the outbound motion.", evidenceCount: 1, evidenceUrl: F(4), confidence: "medium", discoveredAt: "2026-10-02" },
  { id: "c05", name: "Cedar & Oak Co", domain: "cedaroak.com", industry: "Home Services", hqCountry: "US", employees: 180, situation: "Scaling field teams", whatHappened: "Listed 6 outside-sales openings across three states.", whyItMatters: "Multi-state rep hiring points to territory coordination needs.", evidenceCount: 2, evidenceUrl: F(5), confidence: "medium", discoveredAt: "2026-10-09" },
  { id: "c06", name: "Meridian Health", domain: "meridianhealth.io", industry: "Medical Devices", hqCountry: "US", employees: 3400, situation: "New VP of Sales", whatHappened: "Appointed a new SVP of Commercial from a larger competitor.", whyItMatters: "New commercial leadership often re-tools the field stack.", evidenceCount: 5, evidenceUrl: F(6), confidence: "high", discoveredAt: "2026-10-11" },
  { id: "c07", name: "Fathom Analytics", domain: "usefathom.dev", industry: "Distribution", hqCountry: "US", employees: 220, situation: "Replacing manual CRM", whatHappened: "Leadership posted about moving off spreadsheets for field reporting.", whyItMatters: "A CRM-hygiene push may open a window for field tooling.", evidenceCount: 3, evidenceUrl: F(7), confidence: "medium", discoveredAt: "2026-09-19" },
  { id: "c08", name: "Harbor Freight Depot", domain: "harbordepot.com", industry: "Distribution", hqCountry: "US", employees: 760, situation: "Territory expansion", whatHappened: "Announced two new regional branches in the Southeast.", whyItMatters: "Branch expansion implies new field territories to manage.", evidenceCount: 2, evidenceUrl: F(8), confidence: "low", discoveredAt: "2026-07-24" },
  { id: "c09", name: "SunRidge Solar", domain: "sunridgesolar.com", industry: "Solar", hqCountry: "US", employees: 410, situation: "Scaling field teams", whatHappened: "Hiring 12 door-to-door solar consultants across Arizona.", whyItMatters: "D2D scaling needs routing and verified activity.", evidenceCount: 4, evidenceUrl: F(9), confidence: "high", discoveredAt: "2026-10-07" },
  { id: "c10", name: "Apex Roofing Group", domain: "apexroofs.com", industry: "Roofing", hqCountry: "US", employees: 150, situation: "Scaling field teams", whatHappened: "Posted multiple roofing-sales rep roles after a storm season.", whyItMatters: "Storm-driven hiring spikes need fast rep onboarding.", evidenceCount: 3, evidenceUrl: F(10), confidence: "medium", discoveredAt: "2026-09-02" },
  { id: "c11", name: "Vanguard Alarm", domain: "vanguardalarm.com", industry: "Alarm & Security", hqCountry: "US", employees: 630, situation: "Route efficiency push", whatHappened: "Operations update cited a drive-time reduction initiative.", whyItMatters: "Route optimization is a direct fit for field coverage.", evidenceCount: 2, evidenceUrl: F(11), confidence: "low", discoveredAt: "2026-06-30" },
  { id: "c12", name: "Keystone Construction", domain: "keystonebuild.com", industry: "Commercial Construction", hqCountry: "US", employees: 2100, situation: "New VP of Sales", whatHappened: "Named a first-ever Head of Business Development.", whyItMatters: "A new BD function often builds outbound from scratch.", evidenceCount: 1, evidenceUrl: F(12), confidence: "medium", discoveredAt: "2026-10-05" },
  { id: "c13", name: "Lakeside Medical", domain: "lakesidemed.com", industry: "Medical Devices", hqCountry: "US", employees: 890, situation: "Territory expansion", whatHappened: "Expanded field coverage to 6 new metros.", whyItMatters: "Metro expansion creates territory-assignment demand.", evidenceCount: 3, evidenceUrl: F(13), confidence: "high", discoveredAt: "2026-10-01" },
  { id: "c14", name: "Pioneer Telecom", domain: "pioneertel.com", industry: "Telecom", hqCountry: "US", employees: 5400, situation: "Scaling field teams", whatHappened: "Launched a fiber buildout with residential sales hiring.", whyItMatters: "Fiber buildouts drive door-to-door field sales.", evidenceCount: 4, evidenceUrl: F(14), confidence: "high", discoveredAt: "2026-10-10" },
  { id: "c15", name: "Granite Distribution", domain: "granitedist.com", industry: "Distribution", hqCountry: "US", employees: 340, situation: "Replacing manual CRM", whatHappened: "Posted about automating rep check-ins and follow-ups.", whyItMatters: "Follow-up automation overlaps with field execution tooling.", evidenceCount: 2, evidenceUrl: F(15), confidence: "low", discoveredAt: "2026-08-14" },
  { id: "c16", name: "Summit Home Pros", domain: "summithomepros.com", industry: "Home Services", hqCountry: "US", employees: 95, situation: "Scaling field teams", whatHappened: "Hiring 8 in-home sales consultants in two markets.", whyItMatters: "In-home consultant scaling needs routing + logging.", evidenceCount: 3, evidenceUrl: F(16), confidence: "medium", discoveredAt: "2026-09-26" },
  { id: "c17", name: "BlueRidge CPG", domain: "blueridgecpg.com", industry: "CPG", hqCountry: "US", employees: 1700, situation: "Route efficiency push", whatHappened: "Cited merchandiser route optimization in an ops memo.", whyItMatters: "Merchandiser routing is a field-execution fit.", evidenceCount: 2, evidenceUrl: F(17), confidence: "low", discoveredAt: "2026-07-11" },
  { id: "c18", name: "Ironclad Roofing", domain: "ironcladroofs.com", industry: "Roofing", hqCountry: "US", employees: 260, situation: "Territory expansion", whatHappened: "Opened a third branch and announced canvassing teams.", whyItMatters: "Canvassing teams need territory boundaries + tracking.", evidenceCount: 3, evidenceUrl: F(18), confidence: "high", discoveredAt: "2026-10-04" },
  { id: "c19", name: "Nova Security", domain: "novasecurity.com", industry: "Alarm & Security", hqCountry: "US", employees: 480, situation: "New VP of Sales", whatHappened: "Hired a VP of Field Sales from a national competitor.", whyItMatters: "New field-sales leadership often re-evaluates tooling.", evidenceCount: 4, evidenceUrl: F(19), confidence: "high", discoveredAt: "2026-10-08" },
  { id: "c20", name: "Trailhead Solar", domain: "trailheadsolar.com", industry: "Solar", hqCountry: "US", employees: 120, situation: "Scaling field teams", whatHappened: "Listed 10 field energy consultant roles.", whyItMatters: "Consultant hiring at scale needs field coordination.", evidenceCount: 2, evidenceUrl: F(20), confidence: "medium", discoveredAt: "2026-09-15" },
  { id: "c21", name: "Cornerstone Build", domain: "cornerstonebuild.com", industry: "Commercial Construction", hqCountry: "US", employees: 980, situation: "Route efficiency push", whatHappened: "Announced a site-visit efficiency program.", whyItMatters: "Site-visit planning overlaps with route optimization.", evidenceCount: 1, evidenceUrl: F(21), confidence: "low", discoveredAt: "2026-06-18" },
  { id: "c22", name: "Evergreen Health", domain: "evergreenhealth.co", industry: "Medical Devices", hqCountry: "US", employees: 610, situation: "Replacing manual CRM", whatHappened: "Leadership flagged inconsistent rep activity logging.", whyItMatters: "Activity-logging gaps are a direct fit.", evidenceCount: 3, evidenceUrl: F(22), confidence: "medium", discoveredAt: "2026-09-22" },
  { id: "c23", name: "Metro Fiber", domain: "metrofiber.net", industry: "Telecom", hqCountry: "US", employees: 2300, situation: "Territory expansion", whatHappened: "Lit up three new service areas with D2D sales.", whyItMatters: "New service areas need door-to-door territory tools.", evidenceCount: 4, evidenceUrl: F(23), confidence: "high", discoveredAt: "2026-10-12" },
  { id: "c24", name: "Prairie Distribution", domain: "prairiedist.com", industry: "Distribution", hqCountry: "US", employees: 410, situation: "Scaling field teams", whatHappened: "Hiring regional field account reps in the Midwest.", whyItMatters: "Regional rep hiring needs territory assignment.", evidenceCount: 2, evidenceUrl: F(24), confidence: "medium", discoveredAt: "2026-09-30" },
  { id: "c25", name: "Horizon Home", domain: "horizonhome.com", industry: "Home Services", hqCountry: "US", employees: 330, situation: "New VP of Sales", whatHappened: "Promoted a first Director of Field Sales internally.", whyItMatters: "A new field-sales owner often modernizes the stack.", evidenceCount: 1, evidenceUrl: F(25), confidence: "low", discoveredAt: "2026-08-05" },
];
