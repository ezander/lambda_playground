// Regenerate docs/grammar.md from the live Chevrotain parser.
// Run with `npm run gen:grammar`.

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateEBNF } from "../src/parser/ebnf.ts";

const here = dirname(fileURLToPath(import.meta.url));
const out  = resolve(here, "..", "docs", "grammar.md");
const ebnf = generateEBNF();
const content =
  "# Grammar\n\n" +
  "Auto-generated from the Chevrotain parser by `npm run gen:grammar`.\n" +
  "Do not edit by hand — change the parser in `src/parser/grammar.ts` and re-run the script.\n\n" +
  "```\n" + ebnf + "\n```\n";

writeFileSync(out, content, "utf8");
console.log(`Wrote ${out} (${ebnf.split("\n").length} rules)`);
