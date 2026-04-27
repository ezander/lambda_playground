// ── Bundled content loader ────────────────────────────────────────────────────
// All .txt files under src/includes/ are bundled at build time via import.meta.glob.
// Claude maintains the ordered name lists below; just drop files in the folders.

const stdRaw      = import.meta.glob("../includes/std/*.txt",      { eager: true, query: "?raw", import: "default" }) as Record<string, string>;
const docRaw      = import.meta.glob("../includes/doc/*.txt",      { eager: true, query: "?raw", import: "default" }) as Record<string, string>;
const exampleRaw  = import.meta.glob("../includes/example/*.txt",  { eager: true, query: "?raw", import: "default" }) as Record<string, string>;
const tutorialRaw = import.meta.glob("../includes/tutorial/*.txt", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;

function stripPath(globKey: string): string {
  return globKey.replace(/^.*\//, "").replace(/\.txt$/, "");
}

function buildMap(raw: Record<string, string>, ns: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [key, content] of Object.entries(raw))
    map[`${ns}/${stripPath(key)}`] = content;
  return map;
}

const stdMap      = buildMap(stdRaw,      "std");
const docMap      = buildMap(docRaw,      "doc");
const exampleMap  = buildMap(exampleRaw,  "example");
const tutorialMap = buildMap(tutorialRaw, "tutorial");

// All bundled paths — used by the include resolver (std/doc/example/tutorial)
export const BUNDLED_CONTENT: Record<string, string> = {
  ...stdMap, ...docMap, ...exampleMap, ...tutorialMap,
};

function ordered(map: Record<string, string>, ns: string, names: string[]): { label: string; src: string }[] {
  return names
    .filter(n => `${ns}/${n}` in map)
    .map(n => ({ label: n, src: map[`${ns}/${n}`] }));
}

// ── Ordered display lists (update when adding files) ──────────────────────────

export const DOCS: { label: string; src: string }[] = ordered(docMap, "doc", [
  "Welcome",
  "Content",
  "Language",
  "Definitions",
  "Identifier",
  "Substitution",
  "Normalization",
  "Printing",
  "Assertions",
  "Evaluation",
  "Identification",
  "Includes",
  "Pragmas",
  "Editor",
  "Buffers",
  "User Interface",
  "Literature",
  "Testing",
]);

export const EXAMPLES: { label: string; src: string }[] = ordered(exampleMap, "example", [
  "Truth Tables",
  "Bool Implementations",
  "Signed Numerals",
  "List Operations",
  "Tuples",
  "Recursion",
  "Equivalence and the FLT",
  "SKI Calculus",
]);

export const TUTORIALS: { label: string; src: string }[] = ordered(tutorialMap, "tutorial", [
  "Start",
  "Intro",
  "Church booleans",
  "Boolean junctors",
]);

// ── Default scratch content for new users ─────────────────────────────────────
export const DEFAULT_SCRATCH: string = DOCS[0]?.src.trimStart() ?? "";
