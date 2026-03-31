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
  ".cm-activeLine": { background: "rgba(255,255,255,0.03)" },
  ".cm-activeLineGutter": { background: "rgba(255,255,255,0.03)" },
  ".cm-gutters": {
    background: "#1a1a1a",
    color: "#6b6660",
    border: "none",
    borderRight: "1px solid #2e2e2e",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 0.6rem" },
  ".cm-selectionBackground, ::selection": { background: "rgba(201,168,76,0.2) !important" },
  ".cm-scroller": { overflow: "auto", background: "#1a1a1a" },
  // ── Syntax highlighting ──
  ".cml-comment":  { color: "#6b6660", fontStyle: "italic" },
  ".cml-op":       { color: "#7a7060" },
  ".cml-lambda":   { color: "#e8e4dc", fontWeight: "600" },
  ".cml-pi":       { color: "#e8e4dc", fontWeight: "600" },
  ".cml-def-name": { color: "#c9a84c", fontWeight: "600" },
  ".cml-def-use":  { color: "#c9a84c" },
  ".cml-param":    { color: "#4caf7d", fontWeight: "600" },  // binder (declaration site)
  ".cml-bound":    { color: "#4caf7d" },                     // bound variable use
  ".cml-free":     { color: "#7ab0c8" },                     // free variable
}, { dark: true });

// ── Bracket-wrap keymap ───────────────────────────────────────────────────────
// When text is selected and a bracket key is pressed, wrap the selection.

function wrapSelection(view: EditorView, open: string, close: string): boolean {
  const { from, to } = view.state.selection.main;
  if (from === to) return false; // no selection — let default handling proceed
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

export const lambdaKeymap: Extension = Prec.highest(keymap.of([
  { key: "Ctrl-/", run: toggleLineComment },
  { key: "(", run: v => wrapSelection(v, "(", ")") },
  { key: "[", run: v => wrapSelection(v, "[", "]") },
  { key: "{", run: v => wrapSelection(v, "{", "}") },
  { key: "<", run: v => wrapSelection(v, "<", ">") },
  { key: "Alt-l", run: v => insertAt(v, "λ") },
  { key: "Alt-L", run: v => insertAt(v, "λ") },
  { key: "Alt-m", run: v => insertAt(v, "μ") },
  { key: "Alt-M", run: v => insertAt(v, "μ") },
  { key: "Alt-p", run: v => insertAt(v, "π") },
  { key: "Alt-P", run: v => insertAt(v, "π") },
]));
