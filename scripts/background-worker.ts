import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tick, activeJobs } from "../src/lib/background/worker";

// Heartbeat file lets a container healthcheck detect a wedged loop.
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

async function main() {
  console.log("HotNow background worker started (3 concurrent jobs, 5-second checks).");
  while (!stopping) {
    try {
      await tick();
      await writeFile(join(tmpdir(), "hotnow-worker-heartbeat"), String(Date.now()));
    } catch (err) {
      console.error("Background worker cannot reach the database. Retrying in 5 seconds.", err instanceof Error ? err.message : err);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  // Let in-flight batches finish before exiting so a deploy never drops a half-written step.
  while (activeJobs()) await new Promise((resolve) => setTimeout(resolve, 250));
}
void main();
