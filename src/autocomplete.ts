import { autocompletion, startCompletion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { keymap, Extension } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { parsedField } from "./highlight";
import { KNOWN_PRAGMAS, BOOLEAN_PRAGMAS } from "./parser/parser";

// Matches any identifier-like token (alphanumeric/Greek/operator chars)
const IDENT_RE = /[a-zA-Z0-9_\u0370-\u03FF+\-*/^~&|<>!?=]+/;
// Pragma keys are lowercase with hyphens, optional no- prefix
const PRAGMA_KEY_RE = /[a-z-]+/;

const PRAGMA_OPTIONS = [
  ...Object.keys(KNOWN_PRAGMAS).map(key => ({ label: key, type: "keyword" as const })),
  ...([...BOOLEAN_PRAGMAS]).map(key => ({ label: `no-${key}`, type: "keyword" as const })),
];

function completionSource(context: CompletionContext): CompletionResult | null {
  const parsed = context.state.field(parsedField);
  if (!parsed) return null;

  const line = context.state.doc.lineAt(context.pos);

  // ── Pragma context: #! line ──────────────────────────────────────────────────
  if (line.text.trimStart().startsWith("#!")) {
    const word = context.matchBefore(PRAGMA_KEY_RE);
    if (!word && !context.explicit) return null;
    return { from: word ? word.from : context.pos, options: PRAGMA_OPTIONS, filter: true };
  }

  // ── Normal context: definition names before the cursor ───────────────────────
  const word = context.matchBefore(IDENT_RE);
  if (!word && !context.explicit) return null;

  const seen = new Set<string>();
  const options = parsed.defInfos
    .filter(({ namePos }) => namePos.from < context.pos)
    .filter(({ name }) => !seen.has(name) && !!seen.add(name))
    .map(({ name }) => ({ label: name, type: "variable" as const }));

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
