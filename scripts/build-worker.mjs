import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { build } = require(require.resolve("esbuild", { paths: [require.resolve("tsx")] }));
await build({ entryPoints: ["scripts/background-worker.ts"], outfile: ".next/background-worker.cjs",
  bundle: true, platform: "node", target: "node24", format: "cjs", external: ["next/*"], tsconfig: "tsconfig.json" });
