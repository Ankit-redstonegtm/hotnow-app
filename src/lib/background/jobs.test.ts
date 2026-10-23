import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- in-memory stand-ins; no network, no database, no provider spend ----
const state = vi.hoisted(() => ({
  jobs: [] as any[],
  remaining: 0,
  company: { companyId: "co1", domain: "acme.com", name: "Acme", opportunityId: "op1" } as any,
  contact: { id: "ct1", linkedin_url: "https://linkedin.com/in/x" } as any,
  source: vi.fn(), email: vi.fn(), saved: [] as any[], emails: [] as any[], enqueued: [] as any[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from() {
      const filters: Array<(r: any) => boolean> = []; let patch: any; let mode = "select";
      const q: any = {
        select() { return q; }, single: async () => ({ data: state.jobs.find((r) => filters.every((f) => f(r))), error: null }),
        update(p: any) { patch = p; mode = "update"; return q; },
        eq(k: string, v: any) { filters.push((r) => r[k] === v); return q; },
        in(k: string, v: any[]) { filters.push((r) => v.includes(r[k])); return q; },
        then(resolve: any) {
          const rows = state.jobs.filter((r) => filters.every((f) => f(r)));
          if (mode === "update") rows.forEach((r) => Object.assign(r, patch));
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/db/repo", () => ({
  getSellerProfileById: async () => ({ id: "p1", contact_criteria: {}, buyer_personas: ["Head of Ops"] }),
  countCompaniesNeedingContacts: async () => state.remaining,
  countContactsNeedingEmail: async () => state.remaining,
  companiesNeedingContacts: async () => [state.company],
  contactsNeedingEmail: async () => [state.contact],
  saveContacts: async (_: any, a: any) => { state.saved.push(a); return a.contacts.length; },
  setContactEmail: async (_: any, id: string, email: string) => { state.emails.push([id, email]); },
}));
vi.mock("@/lib/engine/contacts", () => ({ sourceContactsForCompany: (...a: any[]) => state.source(...a) }));
vi.mock("@/lib/providers/blitz", () => ({ enrichEmail: (...a: any[]) => state.email(...a) }));
vi.mock("@/lib/log", () => ({ log: { info() {}, warn() {}, error() {} } }));

import { isPermanentError, processEnrichmentJob, retryDelay } from "./jobs";

const W = "worker-1";
function job(over: Record<string, unknown> = {}) {
  const j = { id: "j1", seller_profile_id: "p1", kind: "contacts", status: "running", locked_by: W, cancel_requested: false,
    options: {}, completed_items: 0, total_items: 0, result_count: 0, attempts: 0, max_attempts: 3, ...over };
  state.jobs = [j];
  return j;
}

beforeEach(() => {
  state.remaining = 3; state.saved = []; state.emails = [];
  state.source = vi.fn(async () => ({ contacts: [{ fullName: "A" }, { fullName: "B" }] }));
  state.email = vi.fn(async () => "a@acme.com");
});

describe("error classification", () => {
  it("treats 4xx provider errors and missing keys as permanent, 5xx and network as retryable", () => {
    expect(isPermanentError("Blitz POST /v2/search/employee-finder -> 422: bad")).toBe(true);
    expect(isPermanentError("BLITZ_API_KEY is not set")).toBe(true);
    expect(isPermanentError("Blitz POST /x -> 503: unavailable")).toBe(false);
    expect(isPermanentError("fetch failed")).toBe(false);
  });
  it("backs off exponentially with a 2 minute cap", () => {
    expect(retryDelay(1)).toBeGreaterThanOrEqual(4000); expect(retryDelay(1)).toBeLessThanOrEqual(6000);
    expect(retryDelay(2)).toBeGreaterThan(retryDelay(1) * 0.8);
    expect(retryDelay(50)).toBeLessThanOrEqual(144_000);
  });
});

describe("processEnrichmentJob", () => {
  it("does one company per batch, records progress and passes the seller's personas", async () => {
    const j = job();
    await processEnrichmentJob(j, W);
    expect(state.source).toHaveBeenCalledWith("acme.com", {}, { personas: ["Head of Ops"] });
    expect(j).toMatchObject({ completed_items: 1, total_items: 3, result_count: 2, attempts: 0, status: "running", locked_by: null });
  });

  it("completes when nothing is left and never calls a provider", async () => {
    state.remaining = 0; const j = job();
    await processEnrichmentJob(j, W);
    expect(j.status).toBe("completed"); expect(state.source).not.toHaveBeenCalled();
  });

  it("stops without spending when cancellation was requested", async () => {
    const j = job({ cancel_requested: true });
    await processEnrichmentJob(j, W);
    expect(j.status).toBe("cancelled"); expect(state.source).not.toHaveBeenCalled();
  });

  it("ignores a job whose lease belongs to another worker", async () => {
    const j = job({ locked_by: "someone-else" });
    await processEnrichmentJob(j, W);
    expect(state.source).not.toHaveBeenCalled(); expect(j.status).toBe("running");
  });

  it("retries transient provider failures with backoff, then fails after max attempts", async () => {
    state.source = vi.fn(async () => { throw new Error("Blitz POST /x -> 503: down"); });
    const j = job();
    await processEnrichmentJob(j, W);
    expect(j).toMatchObject({ status: "retrying", attempts: 1 });
    expect(state.saved).toHaveLength(0); // the company is NOT marked sourced, so it is retried
    Object.assign(j, { status: "running", locked_by: W, attempts: 2 });
    await processEnrichmentJob(j, W);
    expect(j).toMatchObject({ status: "failed", attempts: 3 });
  });

  it("marks a provider-rejected company attempted and moves on instead of stalling the queue", async () => {
    state.source = vi.fn(async () => { throw new Error("Blitz POST /x -> 404: no such company"); });
    const j = job();
    await processEnrichmentJob(j, W);
    expect(state.saved).toEqual([expect.objectContaining({ companyId: "co1", contacts: [] })]);
    expect(j).toMatchObject({ status: "running", completed_items: 1, result_count: 0 });
  });

  it("fails fast with a clear message when the API key is missing", async () => {
    state.source = vi.fn(async () => { throw new Error("BLITZ_API_KEY is not set"); });
    const j = job();
    await processEnrichmentJob(j, W);
    expect(j).toMatchObject({ status: "failed", last_error: "BLITZ_API_KEY is not set" });
    expect(state.saved).toHaveLength(0);
  });

  it("email jobs store a found address, and an empty string when none exists", async () => {
    let j = job({ kind: "emails" });
    await processEnrichmentJob(j, W);
    expect(state.emails).toEqual([["ct1", "a@acme.com"]]); expect(j.result_count).toBe(1);
    state.email = vi.fn(async () => null); state.emails = [];
    j = job({ kind: "emails" });
    await processEnrichmentJob(j, W);
    expect(state.emails).toEqual([["ct1", ""]]); expect(j.result_count).toBe(0);
  });
});
