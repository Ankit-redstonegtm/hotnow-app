// Domain normalization for stable company identity + dedup.
// Lowercases, strips scheme/path/www, and reduces to the registrable domain
// for common multi-part public suffixes.

const TWO_PART_TLDS = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au",
  "co.nz", "co.jp", "com.br", "com.mx", "co.in", "co.za",
]);

export function normalizeDomain(input: string): string {
  let d = (input || "").trim().toLowerCase();
  if (!d) return "";
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "");
  d = d.split("/")[0].split("?")[0].split("#")[0];
  d = d.split("@").pop() as string; // strip any leading user@ or mailto
  d = d.replace(/:\d+$/, ""); // strip port
  const parts = d.split(".").filter(Boolean);
  if (parts.length <= 2) return d;
  const lastTwo = parts.slice(-2).join(".");
  if (TWO_PART_TLDS.has(lastTwo)) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

/** Best-effort extraction of a company domain from an arbitrary URL. */
export function domainFromUrl(url: string): string {
  return normalizeDomain(url);
}

/** URLs that are directory/profile aggregators, not a company's own site. */
const AGGREGATORS = new Set([
  "pitchbook.com", "preqin.com", "crunchbase.com", "linkedin.com", "dealroom.co",
  "globaldata.com", "zoominfo.com", "bloomberg.com", "theladders.com", "simplify.jobs",
  "organic-bio.com", "oemcapital.com", "tracxn.com", "indeed.com", "simplyhired.com",
  "glassdoor.com", "ziprecruiter.com", "apollo.io", "rocketreach.co", "owler.com",
  "dnb.com", "wikipedia.org", "facebook.com", "instagram.com", "youtube.com",
]);

export function isAggregatorDomain(domain: string): boolean {
  return AGGREGATORS.has(normalizeDomain(domain));
}
