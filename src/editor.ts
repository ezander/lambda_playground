import { EditorView, keymap } from "@codemirror/view";
import { Extension } from "@codemirror/state";

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

export const bracketWrapKeymap: Extension = keymap.of([
  { key: "(", run: v => wrapSelection(v, "(", ")") },
  { key: "[", run: v => wrapSelection(v, "[", "]") },
  { key: "{", run: v => wrapSelection(v, "{", "}") },
  { key: "<", run: v => wrapSelection(v, "<", ">") },
]);
