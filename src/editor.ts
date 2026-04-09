import { EditorView, keymap } from "@codemirror/view";
import { Extension, Prec } from "@codemirror/state";

// ── Theme ─────────────────────────────────────────────────────────────────────
// Matches the app's CSS variables.

export const lambdaTheme: Extension = EditorView.theme({
  "&": {
    background: "#1a1a1a",
    color: "#e8e4dc",
    fontSize: "0.95rem",
    fontFamily: "'JetBrains Mono', monospace",
    border: "1px solid #2e2e2e",
    borderRadius: "2px",
    transition: "border-color 0.15s",
  },
  "&.cm-focused": {
    outline: "none",
    borderColor: "#c9a84c",
  },
  ".cm-content": {
    padding: "0.85rem 1rem",
    lineHeight: "1.65",
    caretColor: "#e8e4dc",
    minHeight: "calc(10 * 0.95rem * 1.65 + 2 * 0.85rem)",
  },
  ".cm-line": { padding: "0" },
  ".cm-cursor": { borderLeftColor: "#e8e4dc" },
  ".cm-activeLine": { background: "rgba(255,255,255,0.09)" },
  ".cm-activeLineGutter": { background: "rgba(255,255,255,0.09)" },
  ".cm-gutters": {
    background: "#1a1a1a",
    color: "#6b6660",
    border: "none",
    borderRight: "1px solid #2e2e2e",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 0.6rem", fontSize: "0.75em", display: "flex", alignItems: "center", paddingTop: "1px" },
  ".cm-selectionBackground, ::selection": { background: "rgba(201,168,76,0.2) !important" },
  ".cm-scroller": { overflow: "auto", background: "#1a1a1a" },
  // ── Syntax highlighting ──
  ".cml-comment":  { color: "#8a9090", fontStyle: "italic" },
  ".cml-error":    { textDecoration: "underline wavy #b03030", textDecorationThickness: "1px", textUnderlineOffset: "4px" },
  ".cml-pragma":   { color: "#7a8fa8", fontStyle: "italic" },
  ".cml-op":       { color: "#9a8860" },
  ".cml-lambda":   { color: "#e8e4dc", fontWeight: "600" },
  ".cml-pi":       { color: "#e8e4dc", fontWeight: "600" },
  ".cml-def-name": { color: "#c9a84c", fontWeight: "600" },
  ".cml-def-use":  { color: "#c9a84c" },
  ".cml-param":    { color: "#4caf7d", fontWeight: "600", fontStyle: "italic" },  // binder (declaration site)
  ".cml-bound":    { color: "#4caf7d", fontStyle: "italic" },                     // bound variable use
  ".cml-free":     { color: "#7ab0c8", fontStyle: "italic" },                     // free variable
  ".cml-unparsed": { opacity: "0.35" },                      // region after first parse error
  ".cml-link":      { color: "#7ab0c8", textDecoration: "underline", textDecorationThickness: "1px", textUnderlineOffset: "2px", cursor: "pointer !important" },
  ".cml-link-dead": { color: "#7ab0c8", textDecoration: "underline dotted #b05050", textDecorationThickness: "1px", textUnderlineOffset: "2px", cursor: "pointer !important" },
}, { dark: true });

// ── Bracket-wrap keymap ───────────────────────────────────────────────────────
// When text is selected and a bracket key is pressed, wrap the selection.

function wrapSelection(view: EditorView, open: string, close: string, autoClose = false): boolean {
  const { from, to } = view.state.selection.main;
  if (from === to) {
    if (!autoClose) return false; // no selection — let default handling proceed
    view.dispatch({
      changes: { from, insert: open + close },
      selection: { anchor: from + open.length },
    });
    return true;
  }
  view.dispatch({
    changes: [{ from, insert: open }, { from: to, insert: close }],
    selection: { anchor: from + 1, head: to + 1 },
  });
  return true;
}

// ── Line-comment toggle ───────────────────────────────────────────────────────
// Ctrl-/ toggles # comments on all lines covered by the selection (or cursor).

function toggleLineComment(view: EditorView): boolean {
  const state = view.state;
  const { from, to } = state.selection.main;
  const firstLine = state.doc.lineAt(from);
  // If selection ends exactly at a line start, don't include that (empty) line
  const lastLine  = state.doc.lineAt(
    to > from && to === state.doc.lineAt(to).from ? to - 1 : to
  );

  const lines = [];
  for (let n = firstLine.number; n <= lastLine.number; n++)
    lines.push(state.doc.line(n));

  const allCommented = lines.every(l => l.text === "" || l.text.startsWith("#"));

  const changes = lines.flatMap(line => {
    if (allCommented) {
      if (line.text.startsWith("# ")) return [{ from: line.from, to: line.from + 2, insert: "" }];
      if (line.text.startsWith("#"))   return [{ from: line.from, to: line.from + 1, insert: "" }];
      return [];
    } else {
      return line.text.length > 0 ? [{ from: line.from, insert: "# " }] : [];
    }
  });

  if (changes.length > 0) view.dispatch({ changes });
  return true;
}

function insertAt(view: EditorView, text: string): boolean {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
  });
  return true;
}

// Insert text at the start of the current line (for line-level constructs like π and ≡).
// If the line already starts with the text, do nothing.
function insertAtLineStart(view: EditorView, text: string): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  if (line.text.startsWith(text)) return true;
  view.dispatch({
    changes: { from: line.from, insert: text },
    selection: { anchor: line.from + text.length },
  });
  return true;
}

// ── Greek symbol table ────────────────────────────────────────────────────────
// Shared by Tab-expansion and the symbol picker in App.tsx.

export type GreekSymbol = { sym: string; name: string; reserved?: boolean; shortcut?: string };

export const LOGIC_SYMBOLS: GreekSymbol[] = [
  { sym: "≡", name: "equiv",  shortcut: "alt-e"  },  // equivalence assertion
  { sym: "≢", name: "nequiv", shortcut: "alt-n"  },  // non-equivalence assertion
  { sym: "∧", name: "and"      },
  { sym: "∨", name: "or"       },
  { sym: "¬", name: "not"      },
  { sym: "→", name: "implies"  },
  { sym: "↔", name: "iff"      },
  { sym: "⊤", name: "top"      },
  { sym: "⊥", name: "bot"      },
  { sym: "⊕", name: "oplus"    },
  { sym: "⊗", name: "otimes"   },
  { sym: "∘", name: "compose"  },
  { sym: "≠", name: "neq"      },
  { sym: "∅", name: "emptyset" },
  { sym: "∀", name: "forall",   reserved: true  },  // reserved for types
  { sym: "∃", name: "exists",   reserved: true  },  // reserved for types
  { sym: "⊢", name: "vdash",    reserved: true  },  // reserved for proof notation
];

export const GREEK_SYMBOLS: GreekSymbol[] = [
  // lowercase
  { sym: "α", name: "alpha",   reserved: true }, { sym: "β", name: "beta",  reserved: true },
  { sym: "γ", name: "gamma"   }, { sym: "δ", name: "delta"   },
  { sym: "ε", name: "epsilon" }, { sym: "ζ", name: "zeta"    },
  { sym: "η", name: "eta",     reserved: true }, { sym: "θ", name: "theta"  },
  { sym: "ι", name: "iota"    }, { sym: "κ", name: "kappa"   },
  { sym: "λ", name: "lambda", shortcut: "alt-l" }, { sym: "μ", name: "mu"      },
  { sym: "ν", name: "nu"      }, { sym: "ξ", name: "xi"      },
  { sym: "π", name: "pi", shortcut: "alt-p" }, { sym: "ρ", name: "rho"     },
  { sym: "σ", name: "sigma"   }, { sym: "τ", name: "tau"     },
  { sym: "υ", name: "upsilon" }, { sym: "φ", name: "phi"     },
  { sym: "χ", name: "chi"     }, { sym: "ψ", name: "psi"     },
  { sym: "ω", name: "omega"   },
  // uppercase (visually distinct from Latin)
  { sym: "Γ", name: "Gamma"   }, { sym: "Δ", name: "Delta"   },
  { sym: "Θ", name: "Theta"   }, { sym: "Λ", name: "Lambda"  },
  { sym: "Ξ", name: "Xi"      }, { sym: "Π", name: "Pi"      },
  { sym: "Σ", name: "Sigma"   }, { sym: "Υ", name: "Upsilon" },
  { sym: "Φ", name: "Phi"     }, { sym: "Ψ", name: "Psi"     },
  { sym: "Ω", name: "Omega"   },
];

const GREEK_MAP: Record<string, string> = Object.fromEntries(
  [...GREEK_SYMBOLS, ...LOGIC_SYMBOLS].map(({ sym, name }) => [name, sym])
);

// Space-expand \name → symbol + space (e.g. \omega → ω ). Returns false if no match,
// so Space falls through to normal insertion.
function expandSymbol(view: EditorView): boolean {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const before = view.state.doc.sliceString(line.from, from);
  const match = before.match(/\\([a-zA-Z]+)$/);
  if (!match) return false;
  const sym = GREEK_MAP[match[1]];
  if (!sym) return false;
  const start = from - match[0].length;
  view.dispatch({
    changes: { from: start, to: from, insert: sym + " " },
    selection: { anchor: start + sym.length + 1 },
  });
  return true;
}

export const lambdaKeymap: Extension = Prec.highest(keymap.of([
  { key: " ",     run: expandSymbol },
  { key: "Ctrl-/", run: toggleLineComment },
  { key: "(", run: v => wrapSelection(v, "(", ")") },
  { key: "[", run: v => wrapSelection(v, "[", "]") },
  { key: "{", run: v => wrapSelection(v, "{", "}") },
  { key: "`", run: v => wrapSelection(v, "`", "`", true) },
  { key: "Alt-l", run: v => insertAt(v, "λ") },
  { key: "Alt-L", run: v => insertAt(v, "λ") },
  { key: "Alt-p", run: v => insertAtLineStart(v, "π") },
  { key: "Alt-P", run: v => insertAtLineStart(v, "π") },
  { key: "Alt-e", run: v => insertAtLineStart(v, "≡") },
  { key: "Alt-E", run: v => insertAtLineStart(v, "≡") },
  { key: "Alt-n", run: v => insertAtLineStart(v, "≢") },
  { key: "Alt-N", run: v => insertAtLineStart(v, "≢") },
]));
