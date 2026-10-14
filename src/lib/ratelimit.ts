// Lightweight per-process sliding-window rate limiter for the public, unauthenticated
// endpoints (prewarm research, signup). It raises the bar against casual scripted abuse
// without new infra. NOTE: state is per serverless instance, not shared across the fleet,
// so it is a FIRST line of defense - the durable backstops remain (prewarm's global
// per-minute DB cap + domain dedupe; per-user daily spend caps on authed paid endpoints).
// Good enough and simple for the first 10-30 users; swap for a Redis/DB limiter later.

const buckets = new Map<string, number[]>();
let lastPrune = 0;

/** Returns true if the action is ALLOWED, false if it should be rejected (429). */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();

  // Opportunistic cleanup so the map can't grow unbounded.
  if (now - lastPrune > 60_000) {
    for (const [k, hits] of buckets) {
      const kept = hits.filter((t) => now - t < windowMs);
      if (kept.length) buckets.set(k, kept);
      else buckets.delete(k);
    }
    lastPrune = now;
  }

  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
