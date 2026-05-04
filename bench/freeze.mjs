// bench/freeze.mjs
//
// Capture a named bench baseline by running the bench harness at an arbitrary
// historical commit. Uses a temporary git worktree so the current working
// tree is untouched. Symlinks node_modules from the main repo so we don't
// pay an install cost — package-lock mismatches between current and target
// commit are detected and warned about; the run will fail loudly if the
// older code is incompatible with current deps.
//
//   node bench/freeze.mjs <ref> <name>
//
// Result lands at bench/baselines/<name>.json in the *current* repo.

import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, readdirSync, statSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const [ref, name] = process.argv.slice(2);
if (!ref || !name) {
  console.error("usage: node bench/freeze.mjs <ref> <name>");
  process.exit(2);
}
if (!/^[A-Za-z0-9._-]+$/.test(name)) {
  console.error(`invalid <name>: ${name} (allowed: letters, digits, dot, underscore, dash)`);
  process.exit(2);
}

const repo = process.cwd();
const baselineFile = resolve(repo, "bench/baselines", `${name}.json`);

const worktree = mkdtempSync(join(tmpdir(), "lambda-bench-frozen-"));
console.log(`worktree:    ${worktree}`);
console.log(`ref:         ${ref}`);
console.log(`baseline:    ${baselineFile}`);

let cleanup = () => {
  try { execSync(`git worktree remove --force ${worktree}`, { stdio: "ignore" }); }
  catch { rmSync(worktree, { recursive: true, force: true }); }
};
process.on("exit",  cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });

try {
  execSync(`git worktree add --detach ${worktree} ${ref}`, { stdio: "inherit" });

  // Sanity check: package-lock.json identical between current and target?
  // If not, the symlinked node_modules may not match — warn but proceed.
  const currentLock = readFileSync(resolve(repo, "package-lock.json"), "utf8");
  const targetLock  = existsSync(resolve(worktree, "package-lock.json"))
    ? readFileSync(resolve(worktree, "package-lock.json"), "utf8")
    : null;
  if (targetLock !== currentLock) {
    console.warn("⚠ package-lock.json differs at target ref — symlinked node_modules may not match. Run will probably still work for nearby commits; if it fails, regenerate node_modules at that ref manually.");
  }

  symlinkSync(resolve(repo, "node_modules"), resolve(worktree, "node_modules"));

  const r = spawnSync("npx", ["vite-node", "bench/run.mts"], {
    cwd: worktree,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error(`bench failed at ref ${ref} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }

  // Pick the newest snapshot in the worktree's bench/results/.
  const resultsDir = resolve(worktree, "bench/results");
  const files = readdirSync(resultsDir)
    .filter(f => f.endsWith(".json"))
    .map(f => ({ f, t: statSync(join(resultsDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (files.length === 0) {
    console.error("no snapshot produced — bench may have changed format");
    process.exit(1);
  }
  const snapshot = join(resultsDir, files[0].f);
  copyFileSync(snapshot, baselineFile);
  console.log(`\n✓ baseline saved: ${baselineFile}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
