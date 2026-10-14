import { describe, it, expect } from "vitest";
import { rateLimit } from "./ratelimit";

describe("rateLimit", () => {
  it("allows up to max within the window, then blocks", () => {
    const key = `test-${Math.random()}`;
    expect(rateLimit(key, 3, 10_000)).toBe(true);
    expect(rateLimit(key, 3, 10_000)).toBe(true);
    expect(rateLimit(key, 3, 10_000)).toBe(true);
    expect(rateLimit(key, 3, 10_000)).toBe(false); // 4th is blocked
  });

  it("tracks keys independently", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    expect(rateLimit(a, 1, 10_000)).toBe(true);
    expect(rateLimit(a, 1, 10_000)).toBe(false);
    expect(rateLimit(b, 1, 10_000)).toBe(true); // independent bucket
  });

  it("frees up capacity once the window passes", () => {
    const key = `w-${Math.random()}`;
    expect(rateLimit(key, 1, 1)).toBe(true); // 1ms window
    const start = Date.now();
    while (Date.now() - start < 3) { /* spin ~3ms so the window elapses */ }
    expect(rateLimit(key, 1, 1)).toBe(true);
  });
});
