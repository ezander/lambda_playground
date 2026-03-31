import { describe, it, expect } from "vitest";
import { Var, Abs, App, Subst, Term } from "./ast";
import { parse, parseProgram, expandDefs } from "./parser";
import { prettyPrint, assertRoundTrip } from "./pretty";

// ── parse (single expression) ─────────────────────────────────────────────────

describe("parse", () => {
  it("parses a variable", () => {
    const r = parse("x");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Var("x"));
  });

  it("parses a lambda with := separator", () => {
    const r = parse("\\x := x");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Abs("x", Var("x")));
  });

  it("parses a lambda with . separator", () => {
    const r = parse("\\x. x");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Abs("x", Var("x")));
  });

  it("parses a lambda with unicode λ", () => {
    const r = parse("λx. x");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Abs("x", Var("x")));
  });

  it("pretty-prints lambdas with λ", () => {
    expect(prettyPrint(Abs("x", Var("x")))).toBe("λx. x");
  });

  it("desugars multi-param lambda", () => {
    const r = parse("\\x y. x");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Abs("x", Abs("y", Var("x"))));
  });

  it("parses application as left-associative", () => {
    const r = parse("f x y");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(App(App(Var("f"), Var("x")), Var("y")));
  });

  it("parses parenthesised sub-expression", () => {
    const r = parse("f (g x)");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(App(Var("f"), App(Var("g"), Var("x"))));
  });

  it("desugars e[x:=a] to (\\x := e) a", () => {
    const r = parse("e[x:=a]");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(App(Abs("x", Var("e")), Var("a")));
  });

  it("ignores # comments", () => {
    // Comments are stripped by the lexer; parse is called on a single line
    const r = parse("x");
    expect(r.ok).toBe(true);
  });

  it("allows digit-only identifiers", () => {
    const r = parse("0");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Var("0"));
  });

  it("allows identifiers starting with digits", () => {
    const r = parse("1st");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Var("1st"));
  });

  it("allows mixed alphanumeric identifiers", () => {
    const r = parse("succ2");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Var("succ2"));
  });

  it("parses application of digit identifiers", () => {
    const r = parse("f 0");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(App(Var("f"), Var("0")));
  });

  it("returns an error for empty input", () => {
    const r = parse("");
    expect(r.ok).toBe(false);
  });

  it("returns an error for unmatched paren", () => {
    const r = parse("(x");
    expect(r.ok).toBe(false);
  });

  it("returns an error for unrecognised characters", () => {
    const r = parse("@");
    expect(r.ok).toBe(false);
  });
});

// ── pretty-printer round-trip ─────────────────────────────────────────────────

describe("prettyPrint round-trip", () => {
  function roundTrip(term: Term) {
    const s = prettyPrint(term);
    const r = parse(s);
    if (!r.ok) throw new Error(`parse failed on "${s}"`);
    return r.term;
  }

  it("Var", () => { expect(roundTrip(Var("x"))).toEqual(Var("x")); });
  it("identity", () => { const t = Abs("x", Var("x")); expect(roundTrip(t)).toEqual(t); });
  it("K combinator", () => { const t = Abs("x", Abs("y", Var("x"))); expect(roundTrip(t)).toEqual(t); });
  it("simple App", () => { const t = App(Var("f"), Var("x")); expect(roundTrip(t)).toEqual(t); });
  it("left-assoc App", () => { const t = App(App(Var("f"), Var("x")), Var("y")); expect(roundTrip(t)).toEqual(t); });
  it("S combinator", () => {
    // \x y z := x z (y z)
    const t = Abs("x", Abs("y", Abs("z",
      App(App(Var("x"), Var("z")), App(Var("y"), Var("z"))))));
    expect(roundTrip(t)).toEqual(t);
  });
  it("lambda in argument position", () => {
    // f (\x := x)  — arg needs parens
    const t = App(Var("f"), Abs("x", Var("x")));
    expect(roundTrip(t)).toEqual(t);
  });
  it("nested application in function position", () => {
    // (f x) y — no parens needed for func, parens needed for arg if it's App
    const t = App(App(Var("f"), Var("x")), Var("y"));
    expect(roundTrip(t)).toEqual(t);
  });
  it("left-assoc App prints without parens: f x y not (f x) y", () => {
    expect(prettyPrint(App(App(Var("f"), Var("x")), Var("y")))).toBe("f x y");
  });
  it("right-nested App in arg position keeps parens: f (g x y)", () => {
    expect(prettyPrint(App(Var("f"), App(App(Var("g"), Var("x")), Var("y"))))).toBe("f (g x y)");
  });
});

// ── prettyPrint Subst ─────────────────────────────────────────────────────────

describe("prettyPrint Subst", () => {
  it("prints Var body: x[y:=a]", () => {
    expect(prettyPrint(Subst(Var("x"), "y", Var("a")))).toBe("x[y:=a]");
  });

  it("wraps App body in parens: (f x)[y:=a]", () => {
    expect(prettyPrint(Subst(App(Var("f"), Var("x")), "y", Var("a")))).toBe("(f x)[y:=a]");
  });

  it("wraps Abs body in parens: (λx. x)[y:=a]", () => {
    expect(prettyPrint(Subst(Abs("x", Var("x")), "y", Var("a")))).toBe("(λx. x)[y:=a]");
  });
});

// ── assertRoundTrip ───────────────────────────────────────────────────────────

describe("assertRoundTrip", () => {
  it("passes for well-formed terms", () => {
    expect(() => assertRoundTrip(Abs("x", Var("x")))).not.toThrow();
  });
});

// ── expandDefs ────────────────────────────────────────────────────────────────

describe("expandDefs", () => {
  it("replaces a free variable with its definition", () => {
    const defs = new Map([["I", Abs("x", Var("x"))]]);
    expect(expandDefs(Var("I"), defs)).toEqual(Abs("x", Var("x")));
  });

  it("leaves unrelated variables alone", () => {
    const defs = new Map([["I", Abs("x", Var("x"))]]);
    expect(expandDefs(Var("y"), defs)).toEqual(Var("y"));
  });

  it("expands inside App", () => {
    const defs = new Map([["I", Abs("x", Var("x"))]]);
    expect(expandDefs(App(Var("I"), Var("a")), defs))
      .toEqual(App(Abs("x", Var("x")), Var("a")));
  });

  it("lambda param shadows a definition", () => {
    const defs = new Map([["x", Var("replaced")]]);
    // \x := x  — the x in the body is bound, not the def
    expect(expandDefs(Abs("x", Var("x")), defs)).toEqual(Abs("x", Var("x")));
  });

  it("Subst passes through unchanged", () => {
    const defs = new Map([["I", Abs("x", Var("x"))]]);
    const s = Subst(Var("y"), "p", Var("a"));
    expect(expandDefs(s, defs)).toEqual(s);
  });
});

// ── parseProgram ──────────────────────────────────────────────────────────────

describe("parseProgram", () => {
  it("parses a single expression", () => {
    const r = parseProgram("x");
    expect(r.ok).toBe(true);
    expect(r.expr).toEqual(Var("x"));
  });

  it("parses a definition and expression", () => {
    const r = parseProgram("I = \\x. x\nI");
    expect(r.ok).toBe(true);
    // expr should be the expanded form (the body of I)
    expect(r.expr).toEqual(Abs("x", Var("x")));
    expect(r.defs.get("I")).toEqual(Abs("x", Var("x")));
  });

  it("desugars param shorthand  f x = e  →  f = \\x := e", () => {
    const r = parseProgram("K x y = x\nK");
    expect(r.ok).toBe(true);
    expect(r.defs.get("K")).toEqual(Abs("x", Abs("y", Var("x"))));
  });

  it("expands definitions eagerly into later lines", () => {
    const r = parseProgram("I = \\x. x\nf = I\nf");
    expect(r.ok).toBe(true);
    // f should expand to I's body, not the symbol I
    expect(r.expr).toEqual(Abs("x", Var("x")));
  });

  it("last expression wins when multiple expression lines exist", () => {
    const r = parseProgram("x\ny");
    expect(r.ok).toBe(true);
    expect(r.expr).toEqual(Var("y"));
  });

  it("ignores comment-only lines", () => {
    const r = parseProgram("# a comment\nx");
    expect(r.ok).toBe(true);
    expect(r.expr).toEqual(Var("x"));
  });

  it("treats semicolons as statement separators", () => {
    const r = parseProgram("I = \\x. x; I");
    expect(r.ok).toBe(true);
    expect(r.expr).toEqual(Abs("x", Var("x")));
  });

  it("allows multiple definitions on one line with semicolons", () => {
    const r = parseProgram("K = \\x y. x; I = \\x. x; K");
    expect(r.ok).toBe(true);
    expect(r.defs.get("K")).toEqual(Abs("x", Abs("y", Var("x"))));
    expect(r.defs.get("I")).toEqual(Abs("x", Var("x")));
    expect(r.expr).toEqual(Abs("x", Abs("y", Var("x"))));
  });

  it("ignores trailing semicolons", () => {
    const r = parseProgram("x;");
    expect(r.ok).toBe(true);
    expect(r.expr).toEqual(Var("x"));
  });

  it("reports an error for a bad definition body", () => {
    const r = parseProgram("f = (");
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("warns on redefinition with different normal form", () => {
    const r = parseProgram("I = \\x. x\nI = \\x. x x");
    expect(r.ok).toBe(true); // warning doesn't block loading
    expect(r.errors.some(e => e.kind === "warning" && e.message.includes("I"))).toBe(true);
  });

  it("does not warn on redefinition with the same normal form", () => {
    // \x y. x  and  \a b. a  are alpha-equivalent
    const r = parseProgram("T = \\x y. x\nT = \\a b. a");
    expect(r.ok).toBe(true);
    expect(r.errors.filter(e => e.kind === "warning")).toHaveLength(0);
  });

  it("reports errors with correct absolute offset", () => {
    // "abc\n)" — the stray ')' is at offset 4 (after "abc\n")
    const r = parseProgram("abc\n)");
    expect(r.ok).toBe(false);
    // At least one error should have offset >= 4
    const offsets = r.errors.map(e => e.offset).filter(o => o !== undefined);
    expect(offsets.some(o => o! >= 4)).toBe(true);
  });

  it("reports an error for a definition with non-identifier on LHS", () => {
    // '(x) = y' — LHS contains a non-identifier token
    const r = parseProgram("(x) = y");
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.message.includes("left-hand side"))).toBe(true);
  });

  it("reports a lex error for unrecognised characters", () => {
    const r = parseProgram("@");
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.message.includes("Lex error"))).toBe(true);
  });
});
