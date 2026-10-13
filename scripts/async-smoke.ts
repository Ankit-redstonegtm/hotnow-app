// Verify the async (create + poll) engine path works live.
import { config } from "dotenv";
config({ path: ".env.local" });
import { startResearch, finishResearch, startSituations, finishSituations } from "../src/lib/engine";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const domain = process.argv[2] || "salesrabbit.com";
  console.log(`[async] startResearch(${domain})…`);
  const { taskId, normalizedDomain } = await startResearch(domain);
  console.log("  taskId:", taskId);

  let profile = null;
  for (let i = 0; i < 60 && !profile; i++) {
    await sleep(5000);
    profile = await finishResearch(taskId, normalizedDomain);
    process.stdout.write(`\r  polling research… ${(i + 1) * 5}s  `);
  }
  if (!profile) throw new Error("research timed out");
  console.log("\n  ✅ research done:", profile.companyName, "—", profile.productDescription.slice(0, 60));

  console.log("[async] startSituations…");
  const started = await startSituations(profile, { count: 4 });
  if (started.situations) {
    console.log("  ✅ (sync provider) situations:", started.situations.length);
    return;
  }
  console.log("  taskId:", started.taskId);
  let sits = null;
  for (let i = 0; i < 60 && !sits; i++) {
    await sleep(5000);
    sits = await finishSituations(started.taskId!);
    process.stdout.write(`\r  polling situations… ${(i + 1) * 5}s  `);
  }
  if (!sits) throw new Error("situations timed out");
  console.log(`\n  ✅ situations done: ${sits.length}`);
  sits.forEach((s, i) => console.log(`     ${i}. ${s.name} (${s.generator}) — excludes vendors: ${/exclude/i.test(s.discoveryObjective) ? "yes" : "?"}`));
})().catch((e) => { console.error("\nFAIL:", e.message); process.exit(1); });
