import { EditorView, keymap } from "@codemirror/view";
import { Compartment, Prec, Extension } from "@codemirror/state";
import type { Command } from "@codemirror/view";

// Pure reflow logic — no CM6 dependency, fully testable.
// Returns { from, to, insert } describing the change, or null if nothing to do.
export function rewrapAt(
  text: string,
  pos: number,
  width: number,
): { from: number; to: number; insert: string } | null {
  // Must be inside a block comment (#* ... *#)
  const BLOCK_RE = /#\*[\s\S]*?\*#/g;
  let inComment = false;
  let m: RegExpExecArray | null;
  while ((m = BLOCK_RE.exec(text)) !== null) {
    if (pos >= m.index && pos <= m.index + m[0].length) { inComment = true; break; }
  }
  if (!inComment) return null;

  // Split into lines for navigation
  const rawLines = text.split("\n");
  // Find 0-based line index for pos
  let lineIdx = 0, offset = 0;
  for (let i = 0; i < rawLines.length; i++) {
    if (offset + rawLines[i].length >= pos) { lineIdx = i; break; }
    offset += rawLines[i].length + 1;
  }

  const trimmed = rawLines[lineIdx].trim();
  if (trimmed === "" || trimmed === "#*" || trimmed === "*#") return null;

  // Walk back to paragraph start
  let startIdx = lineIdx;
  while (startIdx > 0) {
    const t = rawLines[startIdx - 1].trim();
    if (t === "" || t === "#*") break;
    startIdx--;
  }

  // Walk forward to paragraph end
  let endIdx = lineIdx;
  while (endIdx < rawLines.length - 1) {
    const t = rawLines[endIdx + 1].trim();
    if (t === "" || t === "*#") break;
    endIdx++;
  }

  const indent = rawLines[startIdx].match(/^(\s*)/)?.[1] ?? "";

  // Collect words, keeping [...] link groups atomic
  const words: string[] = [];
  for (let i = startIdx; i <= endIdx; i++)
    words.push(...(rawLines[i].trim().match(/\[[^\]\n]*\]|\S+/g) ?? []));
  if (words.length === 0) return null;

  // Reflow
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

  const from = rawLines.slice(0, startIdx).reduce((s, l) => s + l.length + 1, 0);
  const to   = from + rawLines.slice(startIdx, endIdx + 1).reduce((s, l, i) => s + l.length + (i < endIdx - startIdx ? 1 : 0), 0);
  const insert = lines.join("\n");

  if (text.slice(from, to) === insert) return null; // already wrapped
  return { from, to, insert };
}

function rewrapCmd(width: number): Command {
  return (view: EditorView): boolean => {
    const result = rewrapAt(view.state.doc.toString(), view.state.selection.main.head, width);
    if (!result) return false;
    view.dispatch({ changes: result });
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
