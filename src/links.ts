import { ViewPlugin, ViewUpdate, DecorationSet, Decoration, EditorView } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

// ── Comment range detection ───────────────────────────────────────────────────

const LINE_COMMENT_RE  = /^[ \t]*#(?![*!])[^\n]*/gm;
const BLOCK_COMMENT_RE = /#\*[\s\S]*?\*#/g;

function findCommentRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const re of [LINE_COMMENT_RE, BLOCK_COMMENT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null)
      ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function inComment(pos: number, ranges: [number, number][]): boolean {
  return ranges.some(([from, to]) => pos >= from && pos < to);
}

// ── Link pattern ──────────────────────────────────────────────────────────────
// Matches [example/name], [user/name], [tut/name] inside comments.

const LINK_RE = /\[(doc|sys|example|tutorial|user)\/([^\]\n]+)\]/g;

export type LinkHandler = (type: string, name: string) => void;

// ── ViewPlugin ────────────────────────────────────────────────────────────────

const linkMark = Decoration.mark({ class: "cml-link" });

class LinkViewPlugin {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = this.build(view); }
  update(u: ViewUpdate) {
    if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
  }
  build(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const text = view.state.doc.toString();
    const commentRanges = findCommentRanges(text);
    const matches: { from: number; to: number }[] = [];
    LINK_RE.lastIndex = 0;
    let m;
    while ((m = LINK_RE.exec(text)) !== null)
      if (inComment(m.index, commentRanges))
        matches.push({ from: m.index + 1, to: m.index + m[0].length - 1 }); // inside the brackets
    matches.sort((a, b) => a.from - b.from);
    for (const { from, to } of matches) builder.add(from, to, linkMark);
    return builder.finish();
  }
}

// ── Extension factory ─────────────────────────────────────────────────────────

export function lambdaLinks(handlerRef: { current: LinkHandler | null }) {
  return [
    ViewPlugin.fromClass(LinkViewPlugin, { decorations: p => p.decorations }),
    EditorView.domEventHandlers({
      click(event) {
        const target = (event.target as HTMLElement).closest(".cml-link");
        if (!target) return false;
        const m = /^(example|user|tut)\/(.+)$/.exec(target.textContent ?? "");
        if (!m) return false;
        handlerRef.current?.(m[1], m[2]);
        event.preventDefault();
        return true;
      }
    }),
  ];
}
