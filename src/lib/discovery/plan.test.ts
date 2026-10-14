import { describe, it, expect } from "vitest";
import { planSellerRuns, type PlanSituation } from "./plan";
import { LIMITS } from "@/lib/engine";

const base = (id: string, enabled = true): PlanSituation => ({ id, enabled, generator: "base" });

describe("planSellerRuns (scheduled discovery safety controls)", () => {
  it("skips disabled situations and ones with an in-flight run (overlap prevention)", () => {
    const plan = planSellerRuns({
      situations: [base("a"), base("b", false), base("c")],
      busySituationIds: new Set(["c"]),
      usage: { runs: 0, cost: 0 },
      matchLimit: 5,
    });
    expect(plan.toLaunch.map((r) => r.situationId)).toEqual(["a"]); // b disabled, c busy
  });

  it("caps the batch at maxSituationsPerDailyRun", () => {
    const many = Array.from({ length: 8 }, (_, i) => base(`s${i}`));
    const plan = planSellerRuns({ situations: many, busySituationIds: new Set(), usage: { runs: 0, cost: 0 }, matchLimit: 5 });
    expect(plan.toLaunch).toHaveLength(LIMITS.maxSituationsPerDailyRun);
  });

  it("launches nothing when the user already hit the daily cost cap", () => {
    const plan = planSellerRuns({
      situations: [base("a")],
      busySituationIds: new Set(),
      usage: { runs: 1, cost: LIMITS.maxDailyCostPerUserUSD },
      matchLimit: 5,
    });
    expect(plan.toLaunch).toHaveLength(0);
    expect(plan.skipped).toBe("daily cost cap");
  });

  it("launches nothing when the user already hit the daily run cap", () => {
    const plan = planSellerRuns({
      situations: [base("a")],
      busySituationIds: new Set(),
      usage: { runs: LIMITS.maxRunsPerUserPerDay, cost: 0 },
      matchLimit: 5,
    });
    expect(plan.toLaunch).toHaveLength(0);
    expect(plan.skipped).toBe("daily run cap");
  });

  it("stops mid-batch before crossing the daily cost ceiling", () => {
    // base @ matchLimit 5 = $0.40/run. Starting at $2.50, only one more run fits under $3.
    const plan = planSellerRuns({
      situations: [base("a"), base("b"), base("c")],
      busySituationIds: new Set(),
      usage: { runs: 2, cost: 2.5 },
      matchLimit: 5,
    });
    expect(plan.toLaunch).toHaveLength(1);
    expect(plan.skipped).toBe("daily cost cap");
  });
});
