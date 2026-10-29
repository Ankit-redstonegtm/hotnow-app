// Contact sourcing from Blitz and Prospeo, tiered P1/P2/P3.
// P1 = economic buyer / decision maker, P2 = champion / influencer, P3 = lower fit.
// A failure, empty result, or missing key on one provider does not discard the other.

import { normalizeDomain } from "../util/domain";
import { domainToLinkedin, employeeFinder, type BlitzEmployee } from "../providers/blitz";
import { createCreditSink, type CreditSink, type ProviderCredits } from "../providers/credits";
import { bulkEnrich, ProspeoKeyMissingError, searchPeople, type ProspeoLead } from "../providers/prospeo";
import { classifyContact, mergeContacts, normalizeLinkedin, type ContactSource, type SourcedContact } from "./contact-merge";

export interface ContactCriteria {
  jobFunctions?: string[]; // Blitz job_function enum values
  jobLevels?: string[]; // Blitz job_level enum values
  countryCode?: string;
}

export type { SourcedContact } from "./contact-merge";

const DEFAULT_FUNCTIONS = ["Sales & Business Development", "Operations", "General Business & Management"];

interface ProviderOutcome {
  ok: boolean;
  missingKey?: boolean;
  skipped?: boolean;
  blocked?: boolean;
  contacts: SourcedContact[];
  companyLinkedin: string | null;
  error?: string;
}

export async function sourceContactsForCompany(
  domain: string,
  criteria: ContactCriteria = {},
  opts: { maxPerCall?: number; enrich?: boolean; useProspeo?: boolean; credits?: CreditSink } = {},
): Promise<{ companyLinkedin: string | null; contacts: SourcedContact[]; credits: ProviderCredits }> {
  const credits = opts.credits ?? createCreditSink();
  const cleanDomain = normalizeDomain(domain);
  const [blitz, prospeo] = await Promise.all([
    sourceBlitz(domain, criteria, opts, credits),
    opts.useProspeo === false ? skippedProspeo() : sourceProspeo(cleanDomain, criteria, opts.maxPerCall ?? 12, credits),
  ]);
  if (!blitz.ok && !prospeo.ok) {
    const failure = providerFailure(blitz, prospeo);
    console.info(JSON.stringify({ event: "contact_provider_credits", domain: cleanDomain || domain, credits: credits.snapshot(), failed: true }));
    throw failure;
  }

  let contacts = mergeContacts([blitz.contacts, prospeo.contacts]);
  if (opts.enrich !== false && !prospeo.missingKey && !prospeo.skipped && !prospeo.blocked && process.env.PROSPEO_API_KEY) {
    try {
      await enrichFromProspeo(contacts, cleanDomain, credits);
      contacts = mergeContacts([contacts]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Prospeo enrichment failed";
      console.warn(`[contacts] Prospeo enrichment failed for ${cleanDomain || domain}: ${message}`);
    }
  }
  return {
    companyLinkedin: blitz.companyLinkedin || prospeo.companyLinkedin,
    contacts,
    credits: credits.snapshot(),
  };
}

function skippedProspeo(): ProviderOutcome {
  return { ok: false, skipped: true, contacts: [], companyLinkedin: null, error: "Prospeo disabled" };
}

function providerFailure(blitz: ProviderOutcome, prospeo: ProviderOutcome): Error {
  const retryable = [blitz, prospeo].filter(result => !result.ok && !result.missingKey && !result.skipped);
  if (retryable.length) return new Error(retryable.map(result => result.error).filter(Boolean).join("; "));
  const missing = [blitz, prospeo].filter(result => result.missingKey);
  if (missing.length) return new Error(missing.map(result => result.error).filter(Boolean).join("; "));
  return new Error("No contact provider available");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Contact provider request failed";
}

function blockedProviderError(message: string): boolean {
  return /INVALID_API_KEY|INSUFFICIENT_CREDITS|-> (401|403)\b/.test(message);
}

async function sourceBlitz(domain: string, criteria: ContactCriteria, opts: { maxPerCall?: number }, credits: CreditSink): Promise<ProviderOutcome> {
  if (!process.env.BLITZ_API_KEY) {
    const error = "BLITZ_API_KEY is not set";
    console.warn(`[contacts] ${error}; continuing with other contact sources for ${domain}`);
    return { ok: false, missingKey: true, contacts: [], companyLinkedin: null, error };
  }
  try {
    const companyLinkedin = await domainToLinkedin(domain, credits);
    if (!companyLinkedin) {
      console.info(`[contacts] Blitz returned no company LinkedIn for ${domain}`);
      return { ok: true, contacts: [], companyLinkedin: null };
    }
    const max = opts.maxPerCall ?? 12;
    const functions = criteria.jobFunctions?.length ? criteria.jobFunctions : DEFAULT_FUNCTIONS;
    const levels = criteria.jobLevels?.length ? criteria.jobLevels : ["C-Team", "VP", "Director"];
    const calls: Promise<{ employees: BlitzEmployee[] }>[] = [];
    if (levels.includes("C-Team")) calls.push(employeeFinder({ companyLinkedinUrl: companyLinkedin, jobLevel: ["C-Team"], countryCode: criteria.countryCode, maxResults: max }, credits));
    const seniorLevels = levels.filter(level => level !== "C-Team");
    if (seniorLevels.length) calls.push(employeeFinder({
      companyLinkedinUrl: companyLinkedin, jobLevel: seniorLevels, jobFunction: functions, countryCode: criteria.countryCode, maxResults: max,
    }, credits));
    const settled = await Promise.allSettled(calls);
    const employees: BlitzEmployee[] = [];
    const errors: string[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") employees.push(...result.value.employees);
      else errors.push(messageOf(result.reason));
    }
    if (errors.length && !employees.length) {
      console.warn(`[contacts] Blitz failed for ${domain}: ${errors.join("; ")}`);
      return { ok: false, blocked: errors.every(blockedProviderError), contacts: [], companyLinkedin, error: errors.join("; ") };
    }
    if (errors.length) console.warn(`[contacts] Blitz partial failure for ${domain}: ${errors.join("; ")}`);
    const contacts = employees.map(employee => toContact(employee, "blitz"));
    if (!contacts.length) console.info(`[contacts] Blitz returned no contacts for ${domain}`);
    return { ok: true, contacts, companyLinkedin };
  } catch (error) {
    const errorMessage = messageOf(error);
    console.warn(`[contacts] Blitz failed for ${domain}: ${errorMessage}`);
    return { ok: false, blocked: blockedProviderError(errorMessage), contacts: [], companyLinkedin: null, error: errorMessage };
  }
}

async function sourceProspeo(domain: string, criteria: ContactCriteria, maxResults: number, credits: CreditSink): Promise<ProviderOutcome> {
  if (!domain) {
    console.info("[contacts] Prospeo skipped because the company domain is empty");
    return { ok: true, contacts: [], companyLinkedin: null };
  }
  if (!process.env.PROSPEO_API_KEY) {
    const error = "PROSPEO_API_KEY is not set";
    console.warn(`[contacts] ${error}; continuing with other contact sources for ${domain}`);
    return { ok: false, missingKey: true, contacts: [], companyLinkedin: null, error };
  }
  try {
    const leads = await searchPeople(domain, criteria, maxResults, credits);
    const contacts = leads.map(lead => toContact(lead, "prospeo"));
    if (!contacts.length) console.info(`[contacts] Prospeo returned no contacts for ${domain}`);
    return { ok: true, contacts, companyLinkedin: leads.find(lead => lead.companyLinkedin)?.companyLinkedin || null };
  } catch (error) {
    if (error instanceof ProspeoKeyMissingError) {
      console.warn(`[contacts] ${error.message}; continuing with other contact sources for ${domain}`);
      return { ok: false, missingKey: true, contacts: [], companyLinkedin: null, error: error.message };
    }
    const errorMessage = messageOf(error);
    console.warn(`[contacts] Prospeo failed for ${domain}: ${errorMessage}`);
    return { ok: false, blocked: blockedProviderError(errorMessage), contacts: [], companyLinkedin: null, error: errorMessage };
  }
}

function toContact(person: BlitzEmployee | ProspeoLead, source: ContactSource): SourcedContact {
  const linkedinUrl = normalizeLinkedin(person.linkedinUrl);
  const contact: SourcedContact = {
    fullName: person.fullName,
    title: person.title,
    linkedinUrl,
    jobLevel: person.jobLevel,
    jobFunction: person.jobFunction,
    location: person.location,
    priority: "P3",
    sources: [source],
    personId: "personId" in person ? person.personId : undefined,
    email: "email" in person ? person.email : undefined,
    mobile: "mobile" in person ? person.mobile : undefined,
  };
  contact.priority = classifyContact(contact);
  return contact;
}

async function enrichFromProspeo(contacts: SourcedContact[], domain: string, credits: CreditSink) {
  const identifiable = contacts.filter(contact => contact.personId || contact.linkedinUrl);
  const mobileTargets = identifiable.filter(contact => contact.priority === "P1" && !contact.mobile);
  if (mobileTargets.length) {
    console.info(`[contacts] Prospeo mobile lookup for ${mobileTargets.length} top-priority contact(s) at ${domain}`);
    const matched = await bulkEnrich(mobileTargets.map((contact, index) => enrichInput(contact, `m${index}`, domain)), "mobile", credits);
    mobileTargets.forEach((contact, index) => applyLead(contact, matched.get(`m${index}`), true));
  }
  const emailTargets = identifiable.filter(contact => !contact.email && (contact.personId || contact.linkedinUrl));
  if (emailTargets.length) {
    console.info(`[contacts] Prospeo verified-email lookup for ${emailTargets.length} contact(s) at ${domain}`);
    const matched = await bulkEnrich(emailTargets.map((contact, index) => enrichInput(contact, `e${index}`, domain)), "email", credits);
    emailTargets.forEach((contact, index) => applyLead(contact, matched.get(`e${index}`), false));
  }
}

function enrichInput(contact: SourcedContact, identifier: string, domain: string) {
  return {
    identifier,
    personId: contact.personId,
    linkedinUrl: contact.linkedinUrl || undefined,
    fullName: contact.fullName || undefined,
    companyWebsite: domain,
  };
}

function applyLead(contact: SourcedContact, lead: ProspeoLead | undefined, allowMobile: boolean) {
  if (!lead) return;
  if (!contact.email && lead.email) contact.email = lead.email;
  if (allowMobile && !contact.mobile && lead.mobile) contact.mobile = lead.mobile;
  if (!contact.personId && lead.personId) contact.personId = lead.personId;
  if (!contact.linkedinUrl && lead.linkedinUrl) contact.linkedinUrl = normalizeLinkedin(lead.linkedinUrl);
  if (!contact.title && lead.title) contact.title = lead.title;
  if (!contact.jobLevel && lead.jobLevel) contact.jobLevel = lead.jobLevel;
  if (!contact.jobFunction && lead.jobFunction) contact.jobFunction = lead.jobFunction;
  if (!contact.location && lead.location) contact.location = lead.location;
  if (!contact.fullName && lead.fullName) contact.fullName = lead.fullName;
}
