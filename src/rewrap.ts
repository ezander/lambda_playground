import { EditorView, keymap } from "@codemirror/view";
import { Compartment, Prec, Extension } from "@codemirror/state";
import type { Command } from "@codemirror/view";

function rewrapCmd(width: number): Command {
  return (view: EditorView): boolean => {
    const doc  = view.state.doc;
    const text = doc.toString();
    const pos  = view.state.selection.main.head;

    // Must be inside a block comment (#* ... *#)
    const BLOCK_RE = /#\*[\s\S]*?\*#/g;
    let inComment = false;
    let m: RegExpExecArray | null;
    while ((m = BLOCK_RE.exec(text)) !== null) {
      if (pos >= m.index && pos <= m.index + m[0].length) { inComment = true; break; }
    }
    if (!inComment) return false;

    const curLine = doc.lineAt(pos);
    const trimmed = curLine.text.trim();

    // Don't rewrap from delimiter or blank lines
    if (trimmed === "" || trimmed === "#*" || trimmed === "*#") return false;

    // Walk back to paragraph start (stop at blank line or #* line)
    let startLine = curLine.number;
    while (startLine > 1) {
      const t = doc.line(startLine - 1).text.trim();
      if (t === "" || t === "#*") break;
      startLine--;
    }

    // Walk forward to paragraph end (stop at blank line or *# line)
    let endLine = curLine.number;
    while (endLine < doc.lines) {
      const t = doc.line(endLine + 1).text.trim();
      if (t === "" || t === "*#") break;
      endLine++;
    }

    // Preserve leading whitespace of the first paragraph line
    const indent = doc.line(startLine).text.match(/^(\s*)/)?.[1] ?? "";

    // Collect all words across the paragraph
    const words: string[] = [];
    for (let ln = startLine; ln <= endLine; ln++)
      words.push(...doc.line(ln).text.trim().split(/\s+/).filter(Boolean));
    if (words.length === 0) return false;

    // Reflow into lines ≤ width chars
    const lines: string[] = [];
    let cur = indent + words[0];
    for (let i = 1; i < words.length; i++) {
      if (cur.length + 1 + words[i].length <= width) {
        cur += " " + words[i];
      } else {
        lines.push(cur);
        cur = indent + words[i];
      }
    }
    lines.push(cur);

    const from   = doc.line(startLine).from;
    const to     = doc.line(endLine).to;
    const insert = lines.join("\n");

    if (doc.sliceString(from, to) === insert) return true; // already wrapped
    view.dispatch({ changes: { from, to, insert } });
    return true;
  };
}

export function makeWrapExtensions(width: number): Extension {
  return [
    Prec.high(keymap.of([{ key: "Ctrl-r", run: rewrapCmd(width) }])),
    EditorView.theme({
      // Ruler: a hairline at column `width`; left padding of .cm-content is 1rem
      ".cm-content": { position: "relative" },
      ".cm-content::before": {
        content: '""',
        position: "absolute",
        left: `calc(1rem + ${width}ch)`,
        top: "0",
        bottom: "0",
        borderLeft: "1px solid rgba(128, 128, 128, 0.18)",
        pointerEvents: "none",
      },
    }),
  ];
}

export const wrapCompartment = new Compartment();
