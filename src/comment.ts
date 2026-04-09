// ── Comment range utilities ───────────────────────────────────────────────────
// Shared by links.ts (link detection) and autocomplete.ts (completion context).

export const LINE_COMMENT_RE  = /^[ \t]*#(?![*!])[^\n]*/gm;
export const BLOCK_COMMENT_RE = /#\*[\s\S]*?\*#/g;

export function findCommentRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const re of [LINE_COMMENT_RE, BLOCK_COMMENT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null)
      ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

export function inComment(pos: number, ranges: [number, number][]): boolean {
  return ranges.some(([from, to]) => pos >= from && pos < to);
}
