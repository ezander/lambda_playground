import { autocompletion, startCompletion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { keymap, Extension } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { parsedField } from "./highlight";
import { KNOWN_PRAGMAS, BOOLEAN_PRAGMAS } from "./parser/parser";
import { BUNDLED_CONTENT } from "./data/content";

const SAVE_PREFIX = "lambda-playground:saved:";

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

function getUserIncludePaths(): string[] {
  const paths: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(SAVE_PREFIX)) paths.push("user/" + key.slice(SAVE_PREFIX.length));
  }
  return paths.sort();
}

function getAllIncludePaths(): string[] {
  return [...Object.keys(BUNDLED_CONTENT), ...getUserIncludePaths()];
}

// Check if the cursor is inside a comment (line or block)
function isInComment(line: { text: string }, pos: number, lineFrom: number): boolean {
  const text = line.text;
  const col = pos - lineFrom;
  // Line comment
  const hashIdx = text.search(/(?<![\S])#(?![!*])|^#(?![!*])/);
  if (hashIdx !== -1 && col > hashIdx) return true;
  // Simplified block comment: just check if line contains #*
  // (full detection would require multi-line scan; good enough for autocomplete)
  return false;
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
    // Only complete inside comments
    const lineIsComment = line.text.trimStart().startsWith("#");
    // Check for block comment context by scanning backwards for #*
    const fullText = context.state.doc.toString();
    const posInDoc = context.pos;
    const lastBlockOpen  = fullText.lastIndexOf("#*", posInDoc);
    const lastBlockClose = fullText.lastIndexOf("*#", posInDoc);
    const inBlockComment = lastBlockOpen !== -1 && lastBlockOpen > lastBlockClose;

    if (lineIsComment || inBlockComment) {
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
