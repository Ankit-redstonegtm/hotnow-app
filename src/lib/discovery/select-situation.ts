// Balanced, least-recently-used situation selector for daily discovery.
// Each day we run ONE situation. We prefer situations run least recently (never-run first),
// with randomness among the least-recent pool so we don't always pick the same one and we
// rotate fairly across a seller's 5 confirmed situations. Pure + deterministic (inject rng).

export interface SelectableSituation {
  id: string;
  enabled?: boolean;
}

/**
 * Pick one enabled situation.
 *  - Disabled/unconfirmed situations are never selected.
 *  - Never-run situations are preferred first.
 *  - Otherwise choose at random among the least-recently-used half (fair rotation).
 * `lastRunAt` maps situationId -> ms epoch of its most recent run (absent = never run).
 * `rng` returns [0,1); inject a seeded rng for deterministic tests.
 */
export function selectSituation<T extends SelectableSituation>(
  situations: T[],
  lastRunAt: Record<string, number>,
  rng: () => number = Math.random,
): T | null {
  const enabled = situations.filter((s) => s.enabled !== false);
  if (enabled.length === 0) return null;

  const withTime = enabled
    .map((s) => ({ s, t: lastRunAt[s.id] ?? -1 })) // never-run = -1 (sorts first)
    .sort((a, b) => a.t - b.t);

  const neverRun = withTime.filter((x) => x.t < 0);
  const pool = neverRun.length > 0
    ? neverRun
    : withTime.slice(0, Math.max(1, Math.ceil(withTime.length / 2)));

  const idx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[idx].s;
}
