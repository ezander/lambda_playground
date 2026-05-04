// bench/vs.mjs
//
// Run the current bench against a named baseline in bench/baselines/.
//   node bench/vs.mjs <name>

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const [name] = process.argv.slice(2);
if (!name) {
  console.error("usage: node bench/vs.mjs <name>");
  process.exit(2);
}

const baseline = resolve(process.cwd(), "bench/baselines", `${name}.json`);
if (!existsSync(baseline)) {
  console.error(`baseline not found: ${baseline}`);
  process.exit(1);
}

const r = spawnSync("npx", ["vite-node", "bench/run.mts", "--baseline", baseline], { stdio: "inherit" });
process.exit(r.status ?? 1);
