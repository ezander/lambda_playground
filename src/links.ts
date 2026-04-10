import { ViewPlugin, ViewUpdate, DecorationSet, Decoration, EditorView, hoverTooltip } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { findCommentRanges, inComment } from "./comment";
import { contentExists } from "./storage";

// ── Link pattern ──────────────────────────────────────────────────────────────
// Matches [example/name], [user/name], [tut/name] inside comments.

const LINK_RE    = /\[(doc|sys|example|tutorial|user)\/([^\]\n]+)\]/g;
const URL_LINK_RE = /\[https?:\/\/[^\]\n]+\]/g;

// ── Include pragma pattern ────────────────────────────────────────────────────
// Matches the path inside #! include "..." and #! mixin "..." pragma lines.

const INCLUDE_RE = /^[ \t]*#!\s*(?:include|mixin)\s+"([^"\n]+)"/gm;

export type LinkHandler = (type: string, name: string) => void;

// ── ViewPlugin ────────────────────────────────────────────────────────────────

const linkMark     = Decoration.mark({ class: "cml-link" });
const linkDeadMark = Decoration.mark({ class: "cml-link-dead" });
const linkExtMark  = Decoration.mark({ class: "cml-link-ext" });

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
    const matches: { from: number; to: number; dead: boolean; ext?: boolean }[] = [];
    LINK_RE.lastIndex = 0;
    let m;
    while ((m = LINK_RE.exec(text)) !== null)
      if (inComment(m.index, commentRanges))
        matches.push({ from: m.index + 1, to: m.index + m[0].length - 1, dead: !contentExists(`${m[1]}/${m[2]}`) });

    URL_LINK_RE.lastIndex = 0;
    while ((m = URL_LINK_RE.exec(text)) !== null)
      if (inComment(m.index, commentRanges))
        matches.push({ from: m.index + 1, to: m.index + m[0].length - 1, dead: false, ext: true });

    INCLUDE_RE.lastIndex = 0;
    while ((m = INCLUDE_RE.exec(text)) !== null) {
      const quoteStart = text.indexOf('"', m.index) + 1;
      matches.push({ from: quoteStart, to: quoteStart + m[1].length, dead: !contentExists(m[1]) });
    }

    matches.sort((a, b) => a.from - b.from);
    for (const { from, to, dead, ext } of matches)
      builder.add(from, to, ext ? linkExtMark : dead ? linkDeadMark : linkMark);
    return builder.finish();
  }
}

// ── Tooltip messages ──────────────────────────────────────────────────────────

function shortenUrl(url: string, maxLen = 50): string {
  const display = url.replace(/^https?:\/\//, "");
  return display.length > maxLen ? display.slice(0, maxLen) + "…" : display;
}

function linkTooltipMessage(text: string, dead: boolean, ext: boolean): string {
  if (ext)   return `Open in new tab: ${shortenUrl(text)}`;
  if (dead)  return `Link target '${text}' not found`;
  const slash = text.indexOf("/");
  if (slash < 1) return "";
  const type = text.slice(0, slash);
  const name = text.slice(slash + 1);
  if (type === "user") return `Switch to buffer '${name}'`;
  return `Load '${name}' into scratch buffer`;
}

function buildLinkTooltip(view: EditorView, pos: number) {
  const text = view.state.doc.toString();
  const commentRanges = findCommentRanges(text);

  const check = (from: number, to: number, dead: boolean, ext: boolean) => {
    if (pos >= from && pos < to) {
      const linkText = text.slice(from, to);
      const msg = linkTooltipMessage(linkText, dead, ext);
      if (!msg) return null;
      return {
        pos: from,
        above: true,
        create() {
          const dom = document.createElement("div");
          dom.className = "cml-tooltip";
          dom.textContent = msg;
          return { dom };
        },
      };
    }
    return null;
  };

  LINK_RE.lastIndex = 0;
  let m;
  while ((m = LINK_RE.exec(text)) !== null) {
    if (!inComment(m.index, commentRanges)) continue;
    const from = m.index + 1, to = m.index + m[0].length - 1;
    const dead = !contentExists(`${m[1]}/${m[2]}`);
    const hit = check(from, to, dead, false);
    if (hit) return hit;
  }

  URL_LINK_RE.lastIndex = 0;
  while ((m = URL_LINK_RE.exec(text)) !== null) {
    if (!inComment(m.index, commentRanges)) continue;
    const from = m.index + 1, to = m.index + m[0].length - 1;
    const hit = check(from, to, false, true);
    if (hit) return hit;
  }

  INCLUDE_RE.lastIndex = 0;
  while ((m = INCLUDE_RE.exec(text)) !== null) {
    const quoteStart = text.indexOf('"', m.index) + 1;
    const from = quoteStart, to = quoteStart + m[1].length;
    const dead = !contentExists(m[1]);
    const hit = check(from, to, dead, false);
    if (hit) return hit;
  }

  return null;
}

// ── Extension factory ─────────────────────────────────────────────────────────

export function lambdaLinks(handlerRef: { current: LinkHandler | null }) {
  return [
    ViewPlugin.fromClass(LinkViewPlugin, { decorations: p => p.decorations }),
    hoverTooltip(buildLinkTooltip),
    EditorView.domEventHandlers({
      click(event) {
        const target = (event.target as HTMLElement).closest(".cml-link, .cml-link-dead, .cml-link-ext");
        if (!target) return false;
        const text = target.textContent ?? "";
        if (target.classList.contains("cml-link-ext")) {
          window.open(text, "_blank", "noopener,noreferrer");
          event.preventDefault();
          return true;
        }
        const slash = text.indexOf("/");
        if (slash < 1) return false;
        handlerRef.current?.(text.slice(0, slash), text.slice(slash + 1));
        event.preventDefault();
        return true;
      }
    }),
  ];
}
