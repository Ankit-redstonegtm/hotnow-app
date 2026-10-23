// Bundles the worker into one CommonJS file (path aliases resolved) for Docker/hosts.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { build } = require(require.resolve("esbuild", { paths: [require.resolve("tsx")] }));
await build({
  entryPoints: ["scripts/background-worker.ts"], outfile: ".next/background-worker.cjs",
  bundle: true, platform: "node", target: "node22", format: "cjs", external: ["next/*"], tsconfig: "tsconfig.json",
});
console.log("Built .next/background-worker.cjs");
