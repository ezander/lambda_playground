// Regression test: every bundled example must parse + evaluate cleanly.
// Reads files directly from disk (mirrors what import.meta.glob does at build
// time) and passes them through parseProgram with an include resolver covering
// the std/doc/example/tutorial namespaces.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parseProgram } from "./parser/parser";

const ROOT = join(__dirname, "includes");
const NAMESPACES = ["std", "doc", "example", "tutorial"];

const bundled: Record<string, string> = {};
for (const ns of NAMESPACES) {
  const dir = join(ROOT, ns);
  for (const f of readdirSync(dir)) {
    if (f.endsWith(".txt"))
      bundled[`${ns}/${f.slice(0, -4)}`] = readFileSync(join(dir, f), "utf-8");
  }
}
const resolver = (p: string) => bundled[p] ?? null;

const examplePaths = Object.keys(bundled).filter(p => p.startsWith("example/")).sort();

describe("examples (regression)", () => {
  it.each(examplePaths)("%s parses + evaluates without errors", (path) => {
    const content = bundled[path];
    const r = parseProgram(content, { maxStepsPrint: 1000, maxStepsIdent: 1000, maxSize: 3000 }, resolver);
    const realErrors = r.errors.filter(e => e.kind !== "warning");
    expect(realErrors, `errors in ${path}:\n${realErrors.map(e => `  ${e.message}`).join("\n")}`).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
