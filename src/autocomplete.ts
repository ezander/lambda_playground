import { autocompletion, startCompletion, moveCompletionSelection, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { keymap, ViewPlugin, EditorView } from "@codemirror/view";
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

const DIRECTIVE_OPTIONS = [
  { label: ":import", type: "keyword" as const },
  { label: ":mixin", type: "keyword" as const },
  { label: ":set", type: "keyword" as const },
  { label: ":print", type: "keyword" as const },
  { label: ":assert", type: "keyword" as const },
  { label: ":assert-not", type: "keyword" as const },
  { label: ":eval", type: "keyword" as const },
];

const SET_OPTIONS = [
  ...Object.keys(KNOWN_PRAGMAS).map(key => ({ label: key, type: "keyword" as const })),
  ...([...BOOLEAN_PRAGMAS]).map(key => ({ label: `no-${key}`, type: "keyword" as const })),
];

function getAllIncludePaths(): string[] {
  return [...Object.keys(BUNDLED_CONTENT), ...getUserIncludePaths()];
}

function completionSource(context: CompletionContext): CompletionResult | null {
  const parsed = context.state.field(parsedField);
  if (!parsed) return null;

  const line = context.state.doc.lineAt(context.pos);

  // ── Directive context: : at line start ───────────────────────────────────────
  const trimmedLine = line.text.trimStart();
  if (trimmedLine.startsWith(":")) {
    // Path completion for :import "..." and :mixin "..."
    const pathMatch = line.text.match(/^\s*:(?:import|mixin)\s*"([^"]*)/);
    if (pathMatch) {
      const quotePos = line.from + line.text.indexOf('"') + 1;
      if (context.pos >= quotePos) {
        return {
          from: quotePos,
          options: getAllIncludePaths().map(p => ({ label: p, type: "text" as const })),
          filter: true,
        };
      }
    }
    // Option completion for :set
    const setMatch = line.text.match(/^\s*:set\s+/);
    if (setMatch) {
      const word = context.matchBefore(PRAGMA_KEY_RE);
      if (!word && !context.explicit) return null;
      return { from: word ? word.from : context.pos, options: SET_OPTIONS, filter: true };
    }
    // Command completion for : at line start
    const cmdWord = context.matchBefore(/:[a-z-]*/);
    if (cmdWord) {
      return { from: cmdWord.from, options: DIRECTIVE_OPTIONS, filter: true };
    }
    return null;
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
    .filter(({ name }) => !parsed.defs.get(name)?.quiet && !seen.has(name) && !!seen.add(name))
    .map(({ name }) => ({ label: name, type: "variable" as const }));

  for (const [name, entry] of parsed.defs) {
    if (!seen.has(name) && !entry.quiet) options.push({ label: name, type: "variable" as const });
  }

  if (options.length === 0) return null;

  return { from: word ? word.from : context.pos, options, filter: true };
}

// Redirect mouse wheel on the autocomplete tooltip to selection movement.
// The tooltip lives outside the editor DOM so EditorView.domEventHandlers won't reach it.
const autocompleteWheelPlugin = ViewPlugin.fromClass(class {
  private view: EditorView;
  private handler: (e: WheelEvent) => void;
  constructor(view: EditorView) {
    this.view = view;
    this.handler = (e: WheelEvent) => {
      const tooltip = document.querySelector(".cm-tooltip-autocomplete");
      if (!tooltip?.contains(e.target as Node)) return;
      e.preventDefault();
      moveCompletionSelection(e.deltaY > 0)(this.view);
    };
    document.addEventListener("wheel", this.handler, { passive: false });
  }
  destroy() { document.removeEventListener("wheel", this.handler); }
});

export const lambdaComplete: Extension = autocompletion({
  override: [completionSource],
  activateOnTyping: false,
});

export const lambdaCompleteKeymap: Extension = Prec.highest(keymap.of([
  { key: "Alt-Space", run: startCompletion },
]));

export { autocompleteWheelPlugin };
