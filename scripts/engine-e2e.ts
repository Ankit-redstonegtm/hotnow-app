/**
 * Headless end-to-end engine test (no UI, no DB). Proves A→F works live.
 *
 *   npx tsx scripts/engine-e2e.ts <domain> [--desc "what they sell"] \
 *        [--situation N] [--limit N] [--stage situations|full]
 *
 * Reads CLAY_API_KEY + PARALLEL_API_KEY from .env.local (or env).
 * Clay returns the seller and buying situations together. Discovery still uses Parallel.
 * Default runs discovery on ONE situation only (cost control).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { researchSeller, runSituation } from "../src/lib/engine";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const domain = process.argv[2];
if (!domain || domain.startsWith("--")) {
  console.error('Usage: tsx scripts/engine-e2e.ts <domain> [--desc "..."] [--situation N] [--limit N] [--stage situations|full]');
  process.exit(1);
}
const desc = arg("--desc");
const situationIdx = parseInt(arg("--situation") ?? "0", 10);
const limit = parseInt(arg("--limit") ?? "5", 10);
const stage = arg("--stage") ?? "full";

const line = (s = "") => console.log(s);
const rule = () => line("=".repeat(76));

(async () => {
  const t0 = Date.now();
  rule();
  line(`HotNow engine E2E — ${domain}`);
  rule();

  // Stage A+B — one Clay routine.
  line("\n[A+B] Researching seller and buying situations…");
  if (desc) line("    (typed description is kept for your notes; Clay input is the domain only)");
  const { profile, situations, icp } = await researchSeller(domain);
  line(`    company:   ${profile.companyName}`);
  line(`    sells:     ${profile.productDescription}`);
  line(`    buyers:    ${profile.targetCustomers}`);
  line(`    personas:  ${profile.buyerPersonas.join(", ") || "—"}`);
  line(`    industries:${profile.industries.join(", ") || "—"}`);

  if (stage === "research") {
    line("\n(stopping after seller research — pass --stage situations|full to continue)");
    return done(t0);
  }

  line("\n[B] Buying situations from Clay…");
  situations.forEach((s, i) => {
    line(`\n   ${i}. ${s.name}  (${s.generator})`);
    line(`      ${s.description}`);
    line(`      why: ${s.demandHypothesis}`);
    line(`      objective: ${s.discoveryObjective}`);
    line(`      conditions: ${s.matchConditions.map((c) => c.name).join(", ")}`);
  });

  if (stage === "situations") {
    line("\n(stopping after situation generation — pass --stage full to discover)");
    return done(t0);
  }

  const chosen = situations[situationIdx];
  if (!chosen) {
    line(`\nNo situation at index ${situationIdx}.`);
    return done(t0);
  }
  const genOverride = arg("--generator");
  if (genOverride === "base" || genOverride === "core" || genOverride === "preview" || genOverride === "pro") {
    chosen.generator = genOverride;
  }

  // Stage C/D/E/F
  line(`\n[C-F] Discovering for situation #${situationIdx}: "${chosen.name}" (limit ${limit})…`);
  const { opportunities, rejected, runId, estCost } = await runSituation(chosen, icp, {
    matchLimit: limit,
    onTick: (s) => process.stdout.write(`\r      status: ${s.status}  matched: ${s.matchedCount}   `),
  });
  line("");

  rule();
  line(`QUALIFIED OPPORTUNITIES: ${opportunities.length}`);
  rule();
  opportunities.forEach((o, i) => {
    line(`\n#${i + 1}  ${o.company.name}  (${o.company.domain})`);
    line(`    situation:   ${o.situationName}`);
    line(`    what happened: ${o.whatHappened}`);
    line(`    why it matters: ${o.whyItMatters}`);
    line(`    confidence:  ${o.confidence}   evidence date: ${o.evidenceDate ?? "—"}`);
    o.evidence.slice(0, 3).forEach((e) => line(`      · ${e.url}${e.date ? `  (${e.date})` : ""}`));
  });

  if (rejected.length) {
    line(`\nRejected (${rejected.length}):`);
    rejected.forEach((r) => line(`    - ${r.name}: ${r.reason}`));
  }

  rule();
  line("METRICS");
  line(`    run id:          ${runId}`);
  line(`    qualified:       ${opportunities.length}`);
  line(`    rejected:        ${rejected.length}`);
  line(`    est. cost:       $${estCost.toFixed(2)} (discovery) + ~$0.03 research`);
  done(t0);
})().catch((e) => {
  console.error("\nFATAL:", e.message);
  process.exit(1);
});

function done(t0: number) {
  console.log(`\nTotal wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
