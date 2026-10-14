// Minimal structured logger. Writes one JSON line per event to stdout/stderr, which
// Vercel captures as searchable logs. This is deliberately dependency-free; a Sentry
// (or similar) transport can later wrap `error()` without touching call sites.
//
// Usage: log.info("discovery.launch", { sellerProfileId, situations: 3 })
//        log.error("provider.parallel", { stage: "findall", err })

type Fields = Record<string, unknown>;

function serializeErr(v: unknown): unknown {
  if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
  return v;
}

function emit(level: "info" | "warn" | "error", event: string, fields?: Fields) {
  const payload: Fields = { level, event, ts: new Date().toISOString() };
  if (fields) {
    for (const [k, v] of Object.entries(fields)) payload[k] = k === "err" ? serializeErr(v) : v;
  }
  const line = JSON.stringify(payload);
  // Route errors to stderr so they surface distinctly in log drains.
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  error: (event: string, fields?: Fields) => emit("error", event, fields),
};
