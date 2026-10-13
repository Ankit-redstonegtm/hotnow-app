import type { Generator } from "./types";

// --- Parallel pricing (docs, Oct 2026), used for estimate + enforcement ---
export const FINDALL_PRICE: Record<Generator, { fixed: number; perMatch: number }> = {
  preview: { fixed: 0.1, perMatch: 0.0 },
  base: { fixed: 0.25, perMatch: 0.03 },
  core: { fixed: 2.0, perMatch: 0.15 },
  pro: { fixed: 10.0, perMatch: 1.0 },
};

export const TASK_PRICE_PER_RUN: Record<string, number> = {
  lite: 0.005,
  base: 0.01,
  core: 0.025,
  core2x: 0.05,
  pro: 0.1,
  ultra: 0.3,
};

export const SEARCH_PRICE_PER_REQ = { turbo: 0.001, fast: 0.001, base: 0.005, advanced: 0.005 };

// --- Cost control (spec §16). Enforced before launching provider work. ---
export const LIMITS = {
  /**
   * Default generator for real discovery. `base` searches until it finds up to
   * match_limit actual MATCHES (reliable). `preview` only evaluates a small fixed
   * pool and is reserved for cheap query testing in the UI, not delivery.
   */
  defaultGenerator: "base" as Generator,
  /** max opportunities targeted per situation per run */
  defaultMatchLimit: 5,
  maxMatchLimit: 15,
  /** max discovery runs per user per day */
  maxRunsPerUserPerDay: 10,
  /** max situations evaluated in one daily batch per user */
  maxSituationsPerDailyRun: 5,
  /** hard dollar ceiling per single discovery run */
  maxCostPerRunUSD: 5.0,
  /** how fresh evidence must be to qualify (days) */
  freshnessWindowDays: 240,
  /** poll + timeout for async provider runs */
  pollIntervalMs: 5000,
  findAllTimeoutMs: 10 * 60 * 1000,
  taskTimeoutMs: 5 * 60 * 1000,
};

export function estimateFindAllCost(generator: Generator, matchedCount: number): number {
  const p = FINDALL_PRICE[generator];
  return p.fixed + p.perMatch * matchedCount;
}
