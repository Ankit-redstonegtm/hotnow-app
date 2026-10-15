import { describe, it, expect } from "vitest";
import { selectSituation } from "./select-situation";

const sits = (ids: string[], disabled: string[] = []) => ids.map((id) => ({ id, enabled: !disabled.includes(id) }));

describe("selectSituation", () => {
  it("returns null when nothing is enabled", () => {
    expect(selectSituation(sits(["a", "b"], ["a", "b"]), {})).toBeNull();
    expect(selectSituation([], {})).toBeNull();
  });

  it("never selects a disabled situation", () => {
    for (let i = 0; i < 20; i++) {
      const pick = selectSituation(sits(["a", "b", "c"], ["b"]), {}, () => Math.random());
      expect(pick?.id).not.toBe("b");
    }
  });

  it("prefers never-run situations over recently-run ones", () => {
    // a + b were run; c was never run -> must pick c.
    const pick = selectSituation(sits(["a", "b", "c"]), { a: 1000, b: 2000 }, () => 0.99);
    expect(pick?.id).toBe("c");
  });

  it("is deterministic given a seeded rng", () => {
    const lastRun = { a: 100, b: 200, c: 300, d: 400, e: 500 };
    const p1 = selectSituation(sits(["a", "b", "c", "d", "e"]), lastRun, () => 0);
    const p2 = selectSituation(sits(["a", "b", "c", "d", "e"]), lastRun, () => 0);
    expect(p1?.id).toBe(p2?.id);
    expect(p1?.id).toBe("a"); // rng 0 -> first of least-recently-used pool -> oldest = a
  });

  it("rotates fairly across all situations (balanced distribution)", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const lastRun: Record<string, number> = {};
    const picked: string[] = [];
    let clock = 1000;
    for (let i = 0; i < 5; i++) {
      const pick = selectSituation(sits(ids), lastRun, () => 0)!; // rng 0 -> first of pool
      picked.push(pick.id);
      lastRun[pick.id] = clock++; // mark as just run
    }
    // All five distinct over five rounds (never-run preference drains the pool fairly).
    expect(new Set(picked).size).toBe(5);
  });
});
