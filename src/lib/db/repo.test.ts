import { describe, it, expect } from "vitest";
import { isStrongerEvidence, setContactEmail, upsertOpportunity } from "./repo";
import type { Opportunity } from "../engine/types";

// ---- pure dedup decision ----
describe("isStrongerEvidence", () => {
  it("prefers higher confidence", () => {
    expect(isStrongerEvidence("high", "2026-01-01", "medium", "2026-06-01")).toBe(true);
    expect(isStrongerEvidence("low", "2026-06-01", "high", "2026-01-01")).toBe(false);
  });
  it("breaks ties on fresher date", () => {
    expect(isStrongerEvidence("medium", "2026-06-01", "medium", "2026-01-01")).toBe(true);
    expect(isStrongerEvidence("medium", "2026-01-01", "medium", "2026-06-01")).toBe(false);
  });
  it("is not stronger when equal", () => {
    expect(isStrongerEvidence("high", "2026-01-01", "high", "2026-01-01")).toBe(false);
  });
});

// ---- email status mapping (missing-email handling; never mislabel) ----
describe("setContactEmail", () => {
  function mockAdmin() {
    const calls: Array<{ patch: any }> = [];
    const admin = {
      from() {
        return {
          update(patch: any) {
            return { eq: async () => { calls.push({ patch }); return { error: null }; } };
          },
        };
      },
    };
    return { admin: admin as any, calls };
  }

  it("marks a found email as 'found' (never 'verified')", async () => {
    const { admin, calls } = mockAdmin();
    await setContactEmail(admin, "id1", "dana@acme.com");
    expect(calls[0].patch).toEqual({ email: "dana@acme.com", email_status: "found" });
  });

  it("marks an empty result as 'none' so it is never retried", async () => {
    const { admin, calls } = mockAdmin();
    await setContactEmail(admin, "id2", "");
    expect(calls[0].patch).toEqual({ email: "", email_status: "none" });
  });
});

// ---- seller-level company dedup (one company once per seller, regardless of situation) ----
class FakeQuery {
  filters: Array<[string, unknown]> = [];
  _insert: any[] | null = null;
  _update: any | null = null;
  constructor(private store: Record<string, any[]>, private table: string) {}
  select() { return this; }
  eq(c: string, v: unknown) { this.filters.push([c, v]); return this; }
  order() { return this; }
  limit() { return this; }
  is() { return this; }
  lt() { return this; }
  private match() { return this.store[this.table].filter((r) => this.filters.every(([c, v]) => r[c] === v)); }
  insert(rows: any) { this._insert = Array.isArray(rows) ? rows : [rows]; return this; }
  update(patch: any) { this._update = patch; return this; }
  maybeSingle() { return Promise.resolve({ data: this.match()[0] ?? null, error: null }); }
  single() {
    if (this._insert) {
      const created = this._insert.map((r, i) => ({ id: `id-${this.store[this.table].length + 1 + i}`, ...r }));
      this.store[this.table].push(...created);
      return Promise.resolve({ data: created[0], error: null });
    }
    return Promise.resolve({ data: this.match()[0] ?? null, error: null });
  }
  then(res: any, rej: any) {
    if (this._update) { for (const r of this.match()) Object.assign(r, this._update); return Promise.resolve({ error: null }).then(res, rej); }
    if (this._insert) {
      const created = this._insert.map((r, i) => ({ id: `id-${this.store[this.table].length + 1 + i}`, ...r }));
      this.store[this.table].push(...created);
      return Promise.resolve({ data: created, error: null }).then(res, rej);
    }
    return Promise.resolve({ data: this.match(), error: null }).then(res, rej);
  }
}

function fakeAdmin(seed: any[]) {
  const store: Record<string, any[]> = { opportunities: seed, evidence: [] };
  return { admin: { from: (t: string) => new FakeQuery(store, t) } as any, store };
}

function opp(over: Partial<Opportunity> = {}): Opportunity {
  return {
    company: { name: "Acme", domain: "acme.com" },
    situationName: "Expansion",
    whatHappened: "Opened a UK office.",
    whyItMatters: "Creates demand.",
    confidence: "medium",
    evidence: [{ url: "https://news/1", date: "2026-03-01" }],
    evidenceDate: "2026-03-01",
    discoveredAt: new Date().toISOString(),
    ...over,
  };
}

describe("upsertOpportunity seller-level dedup", () => {
  it("does NOT create a second opportunity when the same company matches a different situation", async () => {
    const { admin, store } = fakeAdmin([
      { id: "existing", seller_profile_id: "S", company_id: "C", situation_id: "SIT-A", confidence: "medium", evidence_date: "2026-03-01", first_discovered_at: "2026-03-01" },
    ]);
    const res = await upsertOpportunity(admin, { sellerProfileId: "S", companyId: "C", situationId: "SIT-B", runId: "R", opp: opp() });
    expect(res.isNew).toBe(false);
    expect(store.opportunities).toHaveLength(1); // no duplicate across situations
  });

  it("creates a new opportunity for a genuinely new company", async () => {
    const { admin, store } = fakeAdmin([]);
    const res = await upsertOpportunity(admin, { sellerProfileId: "S", companyId: "C-new", situationId: "SIT-A", runId: "R", opp: opp() });
    expect(res.isNew).toBe(true);
    expect(store.opportunities).toHaveLength(1);
  });

  it("upgrades the existing opportunity in place when new evidence is stronger", async () => {
    const { admin, store } = fakeAdmin([
      { id: "existing", seller_profile_id: "S", company_id: "C", situation_id: "SIT-A", confidence: "low", evidence_date: "2026-01-01", first_discovered_at: "2026-01-01" },
    ]);
    const res = await upsertOpportunity(admin, { sellerProfileId: "S", companyId: "C", situationId: "SIT-B", runId: "R", opp: opp({ confidence: "high" }) });
    expect(res.isNew).toBe(false);
    expect(res.upgraded).toBe(true);
    expect(store.opportunities[0].confidence).toBe("high"); // replaced in place
    expect(store.opportunities).toHaveLength(1);
  });
});
