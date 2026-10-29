import { asNumber } from "./format";

export type CreditTotals = { total: number; prospeo: number; blitz: number; other: number };

const ROLLUP_KEYS = new Set(["credits", "used", "amount", "total"]);

export function emptyCredits(): CreditTotals {
  return { total: 0, prospeo: 0, blitz: 0, other: 0 };
}

function bucket(key: string): "prospeo" | "blitz" | "other" {
  const name = key.toLowerCase();
  if (name === "prospeo") return "prospeo";
  if (name === "blitz") return "blitz";
  return "other";
}

function add(into: CreditTotals, provider: "prospeo" | "blitz" | "other", amount: number) {
  into[provider] += amount;
  into.total += amount;
}

function nestedAmount(value: unknown): number | null {
  const direct = asNumber(value);
  if (direct != null) return direct;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ROLLUP_KEYS) {
    const amount = asNumber(record[key]);
    if (amount != null) return amount;
  }
  return null;
}

/** Sum Prospeo and Blitz credits stored on a background job. */
export function creditBreakdown(value: unknown): CreditTotals {
  const totals = emptyCredits();
  absorb(totals, value);
  return totals;
}

export function addCredits(into: CreditTotals, value: unknown) {
  const part = creditBreakdown(value);
  into.total += part.total;
  into.prospeo += part.prospeo;
  into.blitz += part.blitz;
  into.other += part.other;
}

function absorb(into: CreditTotals, value: unknown) {
  if (value == null) return;
  const direct = asNumber(value);
  if (direct != null) {
    add(into, "other", direct);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) absorb(into, item);
    return;
  }
  if (typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  if (typeof record.provider === "string") {
    const amount = nestedAmount(record.credits ?? record.used ?? record.amount ?? record.total);
    if (amount != null) {
      add(into, bucket(record.provider), amount);
      return;
    }
  }

  const entries = Object.entries(record);
  const named = entries.filter(([key]) => bucket(key) !== "other");
  if (named.length) {
    for (const [key, raw] of named) {
      const amount = nestedAmount(raw);
      if (amount != null) add(into, bucket(key), amount);
    }
    for (const [key, raw] of entries) {
      if (bucket(key) !== "other" || ROLLUP_KEYS.has(key.toLowerCase())) continue;
      const amount = nestedAmount(raw);
      if (amount != null) add(into, "other", amount);
    }
    return;
  }

  for (const key of ROLLUP_KEYS) {
    const amount = asNumber(record[key]);
    if (amount != null) {
      add(into, "other", amount);
      return;
    }
  }

  for (const [key, raw] of entries) {
    if (ROLLUP_KEYS.has(key.toLowerCase())) continue;
    const amount = nestedAmount(raw);
    if (amount != null) add(into, bucket(key), amount);
  }
}
