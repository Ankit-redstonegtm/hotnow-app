import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tick, activeJobs } from "../src/lib/background/worker";

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
async function main() {
  console.log("HotNow background worker started (3 concurrent jobs; 5-second checks).");
  while (!stopping) {
    try {
      await tick();
      await writeFile(join(tmpdir(), "hotnow-worker-heartbeat"), String(Date.now()));
    } catch { console.error("Background worker cannot reach database. Retrying in 5 seconds."); }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  while (activeJobs()) await new Promise(resolve => setTimeout(resolve, 250));
}
void main();
