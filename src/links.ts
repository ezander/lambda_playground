import { ViewPlugin, ViewUpdate, DecorationSet, Decoration, EditorView } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { findCommentRanges, inComment } from "./comment";
import { contentExists } from "./storage";

// ── Link pattern ──────────────────────────────────────────────────────────────
// Matches [example/name], [user/name], [tut/name] inside comments.

const LINK_RE = /\[(doc|sys|example|tutorial|user)\/([^\]\n]+)\]/g;

export type LinkHandler = (type: string, name: string) => void;

// ── ViewPlugin ────────────────────────────────────────────────────────────────

const linkMark     = Decoration.mark({ class: "cml-link" });
const linkDeadMark = Decoration.mark({ class: "cml-link-dead" });

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
    const matches: { from: number; to: number; dead: boolean }[] = [];
    LINK_RE.lastIndex = 0;
    let m;
    while ((m = LINK_RE.exec(text)) !== null)
      if (inComment(m.index, commentRanges))
        matches.push({ from: m.index + 1, to: m.index + m[0].length - 1, dead: !contentExists(`${m[1]}/${m[2]}`) });
    matches.sort((a, b) => a.from - b.from);
    for (const { from, to, dead } of matches) builder.add(from, to, dead ? linkDeadMark : linkMark);
    return builder.finish();
  }
}

// ── Extension factory ─────────────────────────────────────────────────────────

export function lambdaLinks(handlerRef: { current: LinkHandler | null }) {
  return [
    ViewPlugin.fromClass(LinkViewPlugin, { decorations: p => p.decorations }),
    EditorView.domEventHandlers({
      click(event) {
        const target = (event.target as HTMLElement).closest(".cml-link, .cml-link-dead");
        if (!target) return false;
        const text = target.textContent ?? "";
        const slash = text.indexOf("/");
        if (slash < 1) return false;
        handlerRef.current?.(text.slice(0, slash), text.slice(slash + 1));
        event.preventDefault();
        return true;
      }
    }),
  ];
}
