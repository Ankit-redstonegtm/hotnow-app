// Verify the async (create + poll) Clay seller-intelligence path works live.
import { config } from "dotenv";
config({ path: ".env.local" });
import { startResearch, finishResearch } from "../src/lib/engine";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const domain = process.argv[2] || "salesrabbit.com";
  console.log(`[async] startResearch(${domain})…`);
  const { taskId, normalizedDomain } = await startResearch(domain);
  console.log("  taskId:", taskId);

  let intelligence = null;
  for (let i = 0; i < 90 && !intelligence; i++) {
    await sleep(5000);
    intelligence = await finishResearch(taskId, normalizedDomain);
    process.stdout.write(`\r  polling Clay… ${(i + 1) * 5}s  `);
  }
  if (!intelligence) throw new Error("research timed out");
  const { profile, situations } = intelligence;
  console.log("\n  ✅ research done:", profile.companyName, "—", profile.productDescription.slice(0, 60));
  console.log(`  ✅ situations: ${situations.length}`);
  situations.forEach((s, i) => console.log(`     ${i}. ${s.name} (${s.generator}) — excludes vendors: ${/exclude/i.test(s.discoveryObjective) ? "yes" : "?"}`));
})().catch((e) => { console.error("\nFAIL:", e.message); process.exit(1); });
