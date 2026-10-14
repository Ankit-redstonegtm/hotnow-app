// Pure planner for the scheduled daily discovery sweep. Decides WHICH situations to
// launch for one seller under all the safety controls, with no I/O - so overlap
// prevention, disabled-situation respect, and the per-user daily caps are unit-testable
// without a database or any provider call. The cron route executes what this returns.

import { LIMITS, estimateFindAllCost, type Generator } from "@/lib/engine";

export interface PlanSituation {
  id: string;
  enabled: boolean;
  generator: Generator;
}

export interface PlanInput {
  situations: PlanSituation[];
  /** situation ids that already have a queued/running run - must not be relaunched */
  busySituationIds: Set<string>;
  /** today's usage for this seller's user */
  usage: { runs: number; cost: number };
  /** match limit each run will target (bounds the per-run cost) */
  matchLimit: number;
}

export interface PlannedRun {
  situationId: string;
  generator: Generator;
  matchLimit: number;
  estCost: number;
}

export interface PlanResult {
  toLaunch: PlannedRun[];
  skipped: "daily cost cap" | "daily run cap" | null;
}

/**
 * Select the day's runs for one seller. Rules:
 *  - skip disabled situations and any with an in-flight run (overlap prevention)
 *  - cap the batch at LIMITS.maxSituationsPerDailyRun
 *  - never exceed LIMITS.maxRunsPerUserPerDay (counting runs already done today)
 *  - never let estimated spend cross LIMITS.maxDailyCostPerUserUSD (counting today's spend)
 */
export function planSellerRuns(input: PlanInput): PlanResult {
  if (input.usage.cost >= LIMITS.maxDailyCostPerUserUSD) return { toLaunch: [], skipped: "daily cost cap" };
  if (input.usage.runs >= LIMITS.maxRunsPerUserPerDay) return { toLaunch: [], skipped: "daily run cap" };

  const eligible = input.situations
    .filter((s) => s.enabled && !input.busySituationIds.has(s.id))
    .slice(0, LIMITS.maxSituationsPerDailyRun);

  const toLaunch: PlannedRun[] = [];
  let spent = input.usage.cost;
  let runs = input.usage.runs;
  let skipped: PlanResult["skipped"] = null;

  for (const s of eligible) {
    if (runs >= LIMITS.maxRunsPerUserPerDay) { skipped = "daily run cap"; break; }
    const estCost = estimateFindAllCost(s.generator, input.matchLimit);
    if (spent + estCost > LIMITS.maxDailyCostPerUserUSD) { skipped = "daily cost cap"; break; }
    toLaunch.push({ situationId: s.id, generator: s.generator, matchLimit: input.matchLimit, estCost });
    spent += estCost;
    runs += 1;
  }

  return { toLaunch, skipped };
}
