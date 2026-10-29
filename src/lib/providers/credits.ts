// Per-job provider credit totals. Amounts are recorded only when a response
// reports them (Blitz fair_usage / x-records-used, Prospeo free / total_cost).

export type ProviderName = "blitz" | "prospeo";

export interface ProviderCredits {
  blitz: number | null;
  prospeo: number | null;
}

export interface CreditSink {
  add(provider: ProviderName, amount: number | null | undefined): void;
  snapshot(): ProviderCredits;
}

export function createCreditSink(): CreditSink {
  const totals: ProviderCredits = { blitz: null, prospeo: null };
  return {
    add(provider, amount) {
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return;
      totals[provider] = (totals[provider] ?? 0) + amount;
    },
    snapshot() {
      return { blitz: totals.blitz, prospeo: totals.prospeo };
    },
  };
}

export function mergeProviderCredits(existing: unknown, next: ProviderCredits): ProviderCredits {
  const prior = existing && typeof existing === "object" ? existing as Partial<ProviderCredits> : {};
  const pick = (key: ProviderName): number | null => {
    const previous = typeof prior[key] === "number" && Number.isFinite(prior[key]) ? prior[key] : null;
    const added = next[key];
    if (previous == null) return added;
    if (added == null) return previous;
    return previous + added;
  };
  return { blitz: pick("blitz"), prospeo: pick("prospeo") };
}
