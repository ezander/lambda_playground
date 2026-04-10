import { describe, it, expect } from "vitest";
import { computeHighlightRanges, HighlightRange } from "./highlight";
import { parseProgram } from "./parser/parser";

function parse(src: string) {
  return parseProgram(src, {}, () => null);
}

const SHORT: Record<string, string> = {
  "cml-def-name": "defi",
  "cml-def-use":  "defu",
  "cml-free":     "fv",
  "cml-bound":    "bv",
  "cml-param":    "pm",
  "cml-comment":  "cm",
  "cml-op":       "op",
  "cml-lambda":   "lm",
  "cml-pi":       "kw",
  "cml-pragma":   "pg",
  "cml-error":    "er",
  "cml-warning":  "wn",
  "cml-unparsed": "un",
};

// Annotates src with XML-like tags showing the highlight class of each character.
// When ranges overlap, shorter (more specific) ranges win over longer (line-level) ones.
// Uncoloured characters appear as plain text.
function tag(src: string, ranges: HighlightRange[]): string {
  // Sort: by from ascending; for same from, longer ranges first so shorter ones overwrite.
  const sorted = [...ranges].sort((a, b) =>
    a.from !== b.from ? a.from - b.from : (b.to - b.from) - (a.to - a.from)
  );

  // Assign each character its effective class.
  const cls: (string | null)[] = new Array(src.length).fill(null);
  for (const r of sorted)
    for (let i = r.from; i < r.to && i < src.length; i++)
      cls[i] = r.cls;

  // Compress runs and emit tagged segments.
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = cls[i];
    let j = i + 1;
    while (j < src.length && cls[j] === c) j++;
    const text = src.slice(i, j);
    if (c === null) {
      out += text;
    } else {
      const t = SHORT[c] ?? c;
      out += `<${t}>${text}</${t}>`;
    }
    i = j;
  }
  return out;
}

function tagged(src: string): string {
  return tag(src, computeHighlightRanges(src, parse(src)));
}

describe("computeHighlightRanges", () => {
  describe("basic def + lambda", () => {
    it("def name, operator, param, bound var", () => {
      expect(tagged("a := λx. x\n")).toBe(
        "<defi>a</defi> <op>:=</op> <lm>λ</lm><pm>x</pm><lm>.</lm> <bv>x</bv>\n"
      );
    });

    it("free variable in def body", () => {
      expect(tagged("a := y\n")).toBe(
        "<defi>a</defi> <op>:=</op> <fv>y</fv>\n"
      );
    });
  });

  describe("sequential semantics", () => {
    it("back-reference is defu, forward reference is fv", () => {
      // a defined first; b uses a (back-ref = defu). a uses b (forward = fv).
      expect(tagged("a := λx. x\nb := a\n")).toBe(
        "<defi>a</defi> <op>:=</op> <lm>λ</lm><pm>x</pm><lm>.</lm> <bv>x</bv>\n" +
        "<defi>b</defi> <op>:=</op> <defu>a</defu>\n"
      );
    });

    it("circular: first use is fv, second is defu", () => {
      expect(tagged("a := b\nb := a\n")).toBe(
        "<defi>a</defi> <op>:=</op> <fv>b</fv>\n" +
        "<defi>b</defi> <op>:=</op> <defu>a</defu>\n"
      );
    });

    it("π forward reference is fv", () => {
      expect(tagged("π g\ng := λx. x\n")).toBe(
        "<kw>π</kw> <fv>g</fv>\n" +
        "<defi>g</defi> <op>:=</op> <lm>λ</lm><pm>x</pm><lm>.</lm> <bv>x</bv>\n"
      );
    });

    it("π back-reference is defu", () => {
      expect(tagged("g := λx. x\nπ g\n")).toBe(
        "<defi>g</defi> <op>:=</op> <lm>λ</lm><pm>x</pm><lm>.</lm> <bv>x</bv>\n" +
        "<kw>π</kw> <defu>g</defu>\n"
      );
    });
  });

  describe("comments", () => {
    it("line comment", () => {
      expect(tagged("# hello\n")).toBe("<cm># hello</cm>\n");
    });

    it("block comment", () => {
      expect(tagged("#* hello *#\n")).toBe("<cm>#* hello *#</cm>\n");
    });
  });

  describe("operators and pragmas", () => {
    it(":= and ::= both tagged as op", () => {
      expect(tagged("f := λx. x\nf ::= λx. x\n")).toBe(
        "<defi>f</defi> <op>:=</op> <lm>λ</lm><pm>x</pm><lm>.</lm> <bv>x</bv>\n" +
        "<defi>f</defi> <op>::=</op> <lm>λ</lm><pm>x</pm><lm>.</lm> <bv>x</bv>\n"
      );
    });

    it("pragma line", () => {
      expect(tagged("#! max-steps 100\n")).toBe("<pg>#! max-steps 100</pg>\n");
    });
  });

  describe("warnings and errors", () => {
    it("::= on undefined name: token classes preserved, spaces get wn", () => {
      // f not previously defined — whole line gets warning squiggle,
      // but token-level classes win for the tokens themselves.
      const out = tagged("f ::= λx. x\n");
      expect(out).toContain("<defi>f</defi>");
      expect(out).toContain("<op>::=</op>");
      expect(out).toContain("<wn>");
      expect(out).not.toContain("<er>");
    });

    it("parse error line gets er squiggle", () => {
      const out = tagged(":= bad\n");
      expect(out).toContain("<er>");
      expect(out).not.toContain("<wn>");
    });
  });
});
