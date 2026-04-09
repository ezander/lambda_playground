import { autocompletion, startCompletion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { keymap } from "@codemirror/view";
import { Prec, Extension } from "@codemirror/state";
import { parsedField } from "./highlight";
import { KNOWN_PRAGMAS, BOOLEAN_PRAGMAS } from "./parser/parser";
import { BUNDLED_CONTENT } from "./data/content";
import { getUserIncludePaths } from "./storage";
import { findCommentRanges, inComment } from "./comment";

// Matches any identifier-like token (alphanumeric/Greek/operator chars)
const IDENT_RE = /[a-zA-Z0-9_'\u0370-\u03FF+\-*/^~&|<>!?=]+/;
// Pragma keys are lowercase with hyphens, optional no- prefix
const PRAGMA_KEY_RE = /[a-z-]+/;
// Link path inside [...]: type/name
const LINK_PATH_RE = /[a-zA-Z0-9_/ .'-]+/;

const PRAGMA_OPTIONS = [
  ...Object.keys(KNOWN_PRAGMAS).map(key => ({ label: key, type: "keyword" as const })),
  ...([...BOOLEAN_PRAGMAS]).map(key => ({ label: `no-${key}`, type: "keyword" as const })),
  { label: "include", type: "keyword" as const },
];

function getAllIncludePaths(): string[] {
  return [...Object.keys(BUNDLED_CONTENT), ...getUserIncludePaths()];
}

function completionSource(context: CompletionContext): CompletionResult | null {
  const parsed = context.state.field(parsedField);
  if (!parsed) return null;

  const line = context.state.doc.lineAt(context.pos);

  // ── Pragma context: #! line ──────────────────────────────────────────────────
  if (line.text.trimStart().startsWith("#!")) {
    const incMatch = line.text.match(/^\s*#!\s*(?:include|mixin)\s*"([^"]*)/);
    if (incMatch) {
      const quotePos = line.from + line.text.indexOf('"') + 1;
      if (context.pos >= quotePos) {
        return {
          from: quotePos,
          options: getAllIncludePaths().map(p => ({ label: p, type: "text" as const })),
          filter: true,
        };
      }
    }
    const word = context.matchBefore(PRAGMA_KEY_RE);
    if (!word && !context.explicit) return null;
    return { from: word ? word.from : context.pos, options: PRAGMA_OPTIONS, filter: true };
  }

  // ── Link context: [...] in a comment ─────────────────────────────────────────
  // Look for an opening [ before the cursor on the same line
  const textToCursor = line.text.slice(0, context.pos - line.from);
  const bracketIdx = textToCursor.lastIndexOf("[");
  if (bracketIdx !== -1 && !textToCursor.slice(bracketIdx + 1).includes("]")) {
    const fullText = context.state.doc.toString();
    if (inComment(context.pos, findCommentRanges(fullText))) {
      const from = line.from + bracketIdx + 1;
      return {
        from,
        options: getAllIncludePaths().map(p => ({ label: p, type: "text" as const })),
        filter: true,
      };
    }
  }

  // ── Normal context: definition names before the cursor ───────────────────────
  const word = context.matchBefore(IDENT_RE);
  if (!word && !context.explicit) return null;

  const seen = new Set<string>();
  const options = parsed.defInfos
    .filter(({ namePos }) => namePos.from < context.pos)
    .filter(({ name }) => !seen.has(name) && !!seen.add(name))
    .map(({ name }) => ({ label: name, type: "variable" as const }));

  for (const name of parsed.defs.keys()) {
    if (!seen.has(name)) options.push({ label: name, type: "variable" as const });
  }

  if (options.length === 0) return null;

  return { from: word ? word.from : context.pos, options, filter: true };
}

export const lambdaComplete: Extension = autocompletion({
  override: [completionSource],
  activateOnTyping: false,
});

export const lambdaCompleteKeymap: Extension = Prec.highest(keymap.of([
  { key: "Alt-Space", run: startCompletion },
]));
