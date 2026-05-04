import { describe, it, expect } from "vitest";
import { convert, DEFAULT_DIALECT, DialectConfig } from "./dialect";

const off: DialectConfig = {
  unindent: "none",
  lambdaBackslash: false, lambdaWord: false, lambdaL: false,
  commentDoubleDash: false, commentSlashSlash: false,
  blockSlashStar: false, blockBraceStar: false,
  bodyArrow: false, bodyColonEq: false,
  defEquals: false, splitAdjacent: false, splitCurrying: false,
};

const cfg = (over: Partial<DialectConfig>): DialectConfig => ({ ...off, ...over });
const run = (src: string, over: Partial<DialectConfig>) => convert(src, cfg(over)).text;

describe("dialect.convert — lambda token", () => {
  it("backslash → λ", () => {
    expect(run("\\x. x", { lambdaBackslash: true })).toBe("λx. x");
  });
  it("'lambda' word → λ", () => {
    // Whitespace after the keyword is preserved; users tend to write `lambda x` with a gap.
    expect(run("lambda x. x", { lambdaWord: true })).toBe("λ x. x");
  });
  it("'lambda' substring of identifier is untouched", () => {
    expect(run("lambdaList", { lambdaWord: true })).toBe("lambdaList");
  });
  it("'L' followed by params and dot → λ", () => {
    expect(run("Lx. x", { lambdaL: true })).toBe("λx. x");
    expect(run("L x. x", { lambdaL: true })).toBe("λ x. x");
    expect(run("Lxy. y x", { lambdaL: true })).toBe("λxy. y x");
  });
  it("'L' as identifier is untouched", () => {
    expect(run("Local := 42", { lambdaL: true })).toBe("Local := 42");
    expect(run("Last x", { lambdaL: true })).toBe("Last x");
    expect(run("LIST", { lambdaL: true })).toBe("LIST");
  });
});

describe("dialect.convert — comments", () => {
  it("-- → #, line comment to EOL", () => {
    expect(run("x -- hello\ny", { commentDoubleDash: true })).toBe("x # hello\ny");
  });
  it("// → #", () => {
    expect(run("x // hi\ny", { commentSlashSlash: true })).toBe("x # hi\ny");
  });
  it("block /* */ → #* *#", () => {
    expect(run("a /* x */ b", { blockSlashStar: true })).toBe("a #* x *# b");
  });
  it("block {* *} → #* *#", () => {
    expect(run("a {* x *} b", { blockBraceStar: true })).toBe("a #* x *# b");
  });
  it("comment content is preserved verbatim, not transformed", () => {
    // -> inside comment must NOT become . even if bodyArrow is on.
    const out = run("-- λx -> x\nf := λx -> x", {
      commentDoubleDash: true, bodyArrow: true,
    });
    expect(out).toBe("# λx -> x\nf := λx. x");
  });
  it("existing # comments survive untouched", () => {
    expect(run("a # keep -> me\nb", { bodyArrow: true })).toBe("a # keep -> me\nb");
  });
});

describe("dialect.convert — abstraction body separator", () => {
  it("-> within lambda head → .", () => {
    expect(run("λx -> x", { bodyArrow: true })).toBe("λx. x");
  });
  it(":= within lambda head → .", () => {
    expect(run("λx := x", { bodyColonEq: true })).toBe("λx. x");
  });
  it("-> outside lambda head is left alone", () => {
    expect(run("a -> b", { bodyArrow: true })).toBe("a -> b");
  });
  it("does not cross over an existing dot", () => {
    expect(run("λx. x -> y", { bodyArrow: true })).toBe("λx. x -> y");
  });
  it("nested lambdas each get their separator", () => {
    expect(run("λx -> λy -> y", { bodyArrow: true })).toBe("λx. λy. y");
  });
});

describe("dialect.convert — definitions", () => {
  it("simple = at line start → :=", () => {
    expect(run("f = x", { defEquals: true })).toBe("f := x");
  });
  it("with params", () => {
    expect(run("f x y = x", { defEquals: true })).toBe("f x y := x");
  });
  it("preserves leading indentation", () => {
    expect(run("  f = x", { defEquals: true })).toBe("  f := x");
  });
  it("does not touch == ", () => {
    expect(run("p == q", { defEquals: true })).toBe("p == q");
  });
  it("does not touch = inside an expression", () => {
    expect(run("f x = a = b", { defEquals: true })).toBe("f x := a = b");
  });
  it("digit-starting names (Church numerals)", () => {
    expect(run("2 = λf x. f (f x)", { defEquals: true })).toBe("2 := λf x. f (f x)");
    expect(run("12 = λf. 3 (4 f)",   { defEquals: true })).toBe("12 := λf. 3 (4 f)");
    expect(run("4k = 12 2",          { defEquals: true })).toBe("4k := 12 2");
  });
});

describe("dialect.convert — unindent", () => {
  it("none: leaves indentation alone", () => {
    expect(run("    f := x\n    g := y\n", { unindent: "none" })).toBe("    f := x\n    g := y\n");
  });
  it("leading: strips common indent across non-empty lines", () => {
    expect(run("    f := x\n    g := y\n", { unindent: "leading" })).toBe("f := x\ng := y\n");
  });
  it("leading: respects the minimum indent", () => {
    expect(run("    f := x\n  g := y\n", { unindent: "leading" })).toBe("  f := x\ng := y\n");
  });
  it("leading: ignores empty lines for indent calculation", () => {
    expect(run("    a\n\n    b\n", { unindent: "leading" })).toBe("a\n\nb\n");
  });
  it("leading: no-op when something starts at column 0", () => {
    expect(run("    a\nb\n", { unindent: "leading" })).toBe("    a\nb\n");
  });
  it("full: strips all leading whitespace per line", () => {
    expect(run("    a\n  b\n      c\n", { unindent: "full" })).toBe("a\nb\nc\n");
  });
});

describe("dialect.convert — split adjacent lambdas", () => {
  it("inserts . between chained heads", () => {
    expect(run("λxλy. x", { splitAdjacent: true })).toBe("λx. λy. x");
  });
  it("handles three or more chained", () => {
    expect(run("λxλyλz. x", { splitAdjacent: true })).toBe("λx. λy. λz. x");
  });
  it("does not touch separated lambdas in an expression", () => {
    expect(run("λx. x λy. y", { splitAdjacent: true })).toBe("λx. x λy. y");
  });
  it("composes with backslash conversion", () => {
    const out = convert("\\x\\y\\z. x", { ...DEFAULT_DIALECT });
    expect(out.text).toBe("λx. λy. λz. x");
  });
});

describe("dialect.convert — currying split", () => {
  it("λabc. → λa b c.", () => {
    expect(run("λabc. a", { splitCurrying: true })).toBe("λa b c. a");
  });
  it("single param untouched", () => {
    expect(run("λx. x", { splitCurrying: true })).toBe("λx. x");
  });
  it("splits any ASCII letter run — destructive for multi-char idents (caveat emptor)", () => {
    // Currying-split assumes the source dialect uses single-letter conventions
    // throughout. If the head genuinely holds a multi-char identifier, this
    // option will mangle it — the user must turn it off in that case.
    expect(run("λfoo. foo", { splitCurrying: true })).toBe("λf o o. foo");
  });
  it("greek params untouched (ASCII only)", () => {
    expect(run("λαβ. α", { splitCurrying: true })).toBe("λαβ. α");
  });
});

describe("dialect.convert — combined dialects", () => {
  it("Haskell-style", () => {
    const src = "-- identity\nid x = \\y -> y";
    const out = convert(src, DEFAULT_DIALECT).text;
    expect(out).toBe("# identity\nid x := λy. y");
  });
  it("Lean-ish (with bodyColonEq)", () => {
    const src = "/- id -/\nid := λx := x";
    const out = convert(src, { ...DEFAULT_DIALECT, bodyColonEq: true });
    // /- -/ is not in our supported block set; leave alone except for body :=
    expect(out.text).toBe("/- id -/\nid := λx. x");
  });
  it("playground-native input is a no-op", () => {
    const src = "# hi\nid := λx. x\n";
    expect(convert(src, DEFAULT_DIALECT).text).toBe(src);
  });
  it("Haskell + currying split", () => {
    const src = "k = \\xy -> x";
    const out = convert(src, { ...DEFAULT_DIALECT, splitCurrying: true });
    expect(out.text).toBe("k := λx y. x");
  });
});
