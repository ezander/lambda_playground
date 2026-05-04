// Standalone benchmark harness for parseProgram. Run via `npm run bench`.
// Measures wall-clock + phase breakdown (parse / eval / pretty / match) over
// K timed runs per workload, with cache cleared before every run for
// reproducibility. Writes a JSON snapshot per invocation; supports
// `--baseline <path.json>` for delta-vs-snapshot comparison.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseProgram, clearIncludeCaches } from "../src/parser/semantics";
import type { IncludeResolver } from "../src/parser/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const INCLUDES = resolve(REPO_ROOT, "src/includes");

// Mirror BUNDLED_CONTENT (src/data/content.ts): "namespace/name" → src/includes/namespace/name.txt.
const resolver: IncludeResolver = (path) => {
  try { return readFileSync(resolve(INCLUDES, path + ".txt"), "utf8"); }
  catch { return null; }
};

type Workload = { name: string; source: () => string };

// Mixin-only files (Boolean Operators, Logic Symbols, Numeric Symbols) error
// when imported standalone — they're meant to be :mixin'd over an existing
// bool/numeral implementation. Skip them for the smoke workload.
const STD_MIXIN_ONLY = new Set(["Boolean Operators", "Logic Symbols", "Numeric Symbols"]);

const stdNames = (): string[] =>
  readdirSync(resolve(INCLUDES, "std"))
    .filter(f => f.endsWith(".txt"))
    .map(f => f.replace(/\.txt$/, ""))
    .filter(n => !STD_MIXIN_ONLY.has(n))
    .sort();

const workloads: Workload[] = [
  {
    name: "FLT anyPowTriple 2",
    source: () => readFileSync(resolve(INCLUDES, "example/Equivalence and the FLT.txt"), "utf8"),
  },
  {
    name: "Factorial(4) via Y",
    // Recursion.txt has the heavy print commented out. Wrap it via :import so
    // we get fac with the Y-trick already applied, then run fac 4 with the
    // step limit the file recommends.
    source: () => `:import "example/Recursion"\n:set max-steps 4000\n:print fac 4\n`,
  },
  {
    name: "Stdlib smoke",
    // Import every std/* file. No :print — measures the def-time normalize
    // path on its own.
    source: () => stdNames().map(n => `:import "std/${n}"`).join("\n") + "\n",
  },
];

type RunSample = {
  total: number;
  parse: number;
  evalTotal: number;
  prettyTotal: number;
  matchTotal: number;
};

function runOnce(source: string): RunSample {
  clearIncludeCaches();
  const t0 = performance.now();
  const r = parseProgram(source, {}, resolver);
  const total = performance.now() - t0;
  const t = r.timing!;
  return { total, parse: t.parse, evalTotal: t.evalTotal, prettyTotal: t.prettyTotal, matchTotal: t.matchTotal };
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const min = (xs: number[]): number => Math.min(...xs);
const fmtMs = (ms: number): string => ms.toFixed(1) + " ms";

type Snapshot = {
  timestamp: string;
  node: string;
  workloads: { name: string; samples: RunSample[] }[];
};

function loadBaseline(path: string): Snapshot | null {
  if (!existsSync(path)) { console.warn(`(baseline not found: ${path})`); return null; }
  return JSON.parse(readFileSync(path, "utf8")) as Snapshot;
}

function fmtDelta(now: number, base: number): string {
  if (base <= 0) return "      —";
  const d = now - base;
  const pct = (d / base) * 100;
  const sign = d >= 0 ? "+" : "";
  return `${sign}${d.toFixed(1)}ms ${sign}${pct.toFixed(1)}%`;
}

const PHASES: { key: keyof RunSample; label: string }[] = [
  { key: "total",       label: "total" },
  { key: "parse",       label: "  parse" },
  { key: "evalTotal",   label: "  eval" },
  { key: "prettyTotal", label: "  pretty" },
  { key: "matchTotal",  label: "  match" },
];

function reportWorkload(w: Workload, samples: RunSample[], baselineSamples?: RunSample[]): void {
  console.log(`\n── ${w.name} ──`);
  const head = "phase".padEnd(12) + "median".padStart(12) + "min".padStart(12)
             + (baselineSamples ? "  Δ vs baseline".padStart(20) : "");
  console.log(head);
  for (const p of PHASES) {
    const xs = samples.map(s => s[p.key]);
    const med = median(xs);
    const mn = min(xs);
    let line = p.label.padEnd(12) + fmtMs(med).padStart(12) + fmtMs(mn).padStart(12);
    if (baselineSamples) {
      const baseMed = median(baselineSamples.map(s => s[p.key]));
      line += "  " + fmtDelta(med, baseMed).padStart(18);
    }
    console.log(line);
  }
}

const args = process.argv.slice(2);
const baselineIdx = args.indexOf("--baseline");
const baselinePath = baselineIdx >= 0 ? args[baselineIdx + 1] : null;
const baseline = baselinePath ? loadBaseline(baselinePath) : null;

const K = 7;
const snapshot: Snapshot = {
  timestamp: new Date().toISOString(),
  node: process.version,
  workloads: [],
};

console.log(`bench: K=${K} runs/workload, cache cleared before each run`);
if (baseline) console.log(`baseline: ${baselinePath} (${baseline.timestamp}, node ${baseline.node})`);

for (const w of workloads) {
  const src = w.source();
  runOnce(src);                          // warmup, discarded
  const samples: RunSample[] = [];
  for (let i = 0; i < K; i++) samples.push(runOnce(src));
  snapshot.workloads.push({ name: w.name, samples });
  const baseSamples = baseline?.workloads.find(b => b.name === w.name)?.samples;
  reportWorkload(w, samples, baseSamples);
}

const resultsDir = resolve(REPO_ROOT, "bench/results");
mkdirSync(resultsDir, { recursive: true });
const outFile = resolve(resultsDir, snapshot.timestamp.replace(/:/g, "-") + ".json");
writeFileSync(outFile, JSON.stringify(snapshot, null, 2));
console.log(`\nSnapshot: ${outFile}`);
