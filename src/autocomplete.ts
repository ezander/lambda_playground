import { autocompletion, startCompletion, moveCompletionSelection, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { keymap, ViewPlugin, EditorView } from "@codemirror/view";
import { Prec, Extension } from "@codemirror/state";
import { parsedField } from "./highlight";
import { NUMERIC_OPTIONS, BOOLEAN_OPTIONS } from "./parser/parser";
import { BUNDLED_CONTENT } from "./data/content";
import { getUserIncludePaths } from "./storage";
import { findCommentRanges, inComment } from "./comment";

// Matches any identifier-like token (alphanumeric/Greek/operator chars)
const IDENT_RE = /[a-zA-Z0-9_'\u0370-\u03FF+\-*/^~&|<>!?=]+/;
// Option keys are lowercase with hyphens, optional no- prefix
const OPTION_KEY_RE = /[a-z-]+/;
// Link path inside [...]: type/name
const LINK_PATH_RE = /[a-zA-Z0-9_/ .'-]+/;

const DIRECTIVE_OPTIONS = [
  { label: ":import", type: "keyword" as const },
  { label: ":mixin", type: "keyword" as const },
  { label: ":set", type: "keyword" as const },
  { label: ":print", type: "keyword" as const },
  { label: ":assert", type: "keyword" as const },
  { label: ":eval", type: "keyword" as const },
  { label: ":infix", type: "keyword" as const },
];

const SET_OPTIONS = [
  ...Object.keys(NUMERIC_OPTIONS).map(key => ({ label: key, type: "keyword" as const })),
  ...Object.keys(BOOLEAN_OPTIONS).map(key => ({ label: key, type: "keyword" as const })),
  ...Object.keys(BOOLEAN_OPTIONS).map(key => ({ label: `no-${key}`, type: "keyword" as const })),
];

function getAllIncludePaths(): string[] {
  return [...Object.keys(BUNDLED_CONTENT), ...getUserIncludePaths()];
}

const IMPORT_SECTIONS = {
  std:      { name: "std",      rank: 0 },
  user:     { name: "user",     rank: 1 },
  tutorial: { name: "tutorial", rank: 2 },
};

type PathOption = {
  label: string;
  displayLabel: string;
  type: "text";
  section: { name: string; rank: number };
};

function getImportablePathOptions(): PathOption[] {
  const bundled = Object.keys(BUNDLED_CONTENT);
  const make = (label: string, section: { name: string; rank: number }): PathOption => ({
    label,
    displayLabel: label.slice(label.indexOf("/") + 1),
    type: "text",
    section,
  });
  const std      = bundled.filter(p => p.startsWith("std/"))     .map(p => make(p, IMPORT_SECTIONS.std));
  const user     = getUserIncludePaths()                         .map(p => make(p, IMPORT_SECTIONS.user));
  const tutorial = bundled.filter(p => p.startsWith("tutorial/")).map(p => make(p, IMPORT_SECTIONS.tutorial));
  return [...std, ...user, ...tutorial];
}

// Substring filter + ranking for import paths. Replaces CM6's default fuzzy
// matcher because the default biases short queries toward label-prefix matches,
// so e.g. "n" wouldn't find "Numerals" in "std/Church Numerals".
function filterImportPaths(query: string, opts: PathOption[]): PathOption[] {
  if (!query) return opts;
  const q = query.toLowerCase();
  const out: { opt: PathOption; rank: number; idx: number }[] = [];
  for (const opt of opts) {
    const lbl = opt.label.toLowerCase();
    const idx = lbl.indexOf(q);
    if (idx < 0) continue;
    const bareStart = opt.label.indexOf("/") + 1;
    const rank = idx === 0 ? 0 : idx === bareStart ? 1 : 2;
    out.push({ opt, rank, idx });
  }
  out.sort((a, b) =>
    a.rank !== b.rank ? a.rank - b.rank :
    a.idx  !== b.idx  ? a.idx  - b.idx  :
    a.opt.label.localeCompare(b.opt.label)
  );
  return out.map(x => x.opt);
}

function completionSource(context: CompletionContext): CompletionResult | null {
  const parsed = context.state.field(parsedField);
  if (!parsed) return null;

  const line = context.state.doc.lineAt(context.pos);

  // ── Directive context: : at line start ───────────────────────────────────────
  const trimmedLine = line.text.trimStart();
  if (trimmedLine.startsWith(":")) {
    // Path completion for :import[opts]? "..." and :mixin[opts]? "..."
    // Capture the head explicitly so we don't mis-locate the path quote when
    // the options bracket itself contains "..." (e.g. prefix="C").
    const pathMatch = line.text.match(/^(\s*:(?:import|mixin)\s*(?:\[[^\]]*\])?\s*)"([^"]*)/);
    if (pathMatch) {
      const quotePos = line.from + pathMatch[1].length + 1;
      if (context.pos >= quotePos) {
        const typed = line.text.slice(pathMatch[1].length + 1, context.pos - line.from);
        return {
          from: quotePos,
          options: filterImportPaths(typed, getImportablePathOptions()),
          filter: false,
        };
      }
    }
    // Option completion for :set
    const setMatch = line.text.match(/^\s*:set\s+/);
    if (setMatch) {
      const word = context.matchBefore(OPTION_KEY_RE);
      if (!word && !context.explicit) return null;
      return { from: word ? word.from : context.pos, options: SET_OPTIONS, filter: true };
    }
    // Command completion when the cursor is on a :word at line start
    const cmdWord = context.matchBefore(/:[a-z-]*/);
    if (cmdWord) {
      return { from: cmdWord.from, options: DIRECTIVE_OPTIONS, filter: true };
    }
    // Otherwise fall through to def-name completion — for expressions
    // after :print / :assert / :eval, names after :infix, etc.
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
