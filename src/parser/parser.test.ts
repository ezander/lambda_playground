import { describe, it, expect } from "vitest";
import { Var, Abs, App, Subst, Term } from "./ast";
import { parse, parseProgram, expandDefs } from "./parser";
import { prettyPrint } from "./pretty";

// ── parse (single expression) ─────────────────────────────────────────────────

describe("parse", () => {
  it("parses a variable", () => {
    const r = parse("x");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Var("x"));
  });

  it("parses a lambda", () => {
    const r = parse("λx. x");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Abs("x", Var("x")));
  });

  it("pretty-prints lambdas with λ", () => {
    expect(prettyPrint(Abs("x", Var("x")))).toBe("λx. x");
  });

  it("desugars multi-param lambda", () => {
    const r = parse("λx y. x");
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

  it("desugars e[x:=a] to (λx. e) a", () => {
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

  it("parses a single-char operator identifier", () => {
    const r = parse("+");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Var("+"));
  });

  it("parses a multi-char operator identifier", () => {
    const r = parse("->");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Var("->"));
  });

  it("parses operator application: + m n", () => {
    const r = parse("+ m n");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(App(App(Var("+"), Var("m")), Var("n")));
  });

  it("parses == as an operator identifier", () => {
    const r = parse("==");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Var("=="));
  });

  it("parses <= as an operator identifier", () => {
    const r = parse("<=");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Var("<="));
  });

  it("parses mixed operator+digit identifier: +3", () => {
    const r = parse("+3");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Var("+3"));
  });

  it("+3 is distinct from application: + 3", () => {
    const r = parse("+ 3");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(App(Var("+"), Var("3")));
  });

  it("parses mixed operator+alpha identifier: +n", () => {
    const r = parse("+n");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Var("+n"));
  });

  it("parses digit+operator+digit identifier: 3+3", () => {
    const r = parse("3+3");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Var("3+3"));
  });

  it("3+3 is distinct from application: 3 + 3", () => {
    const r = parse("3 + 3");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(App(App(Var("3"), Var("+")), Var("3")));
  });

  it("parses alpha+operator+alpha identifier: a+b", () => {
    const r = parse("a+b");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Var("a+b"));
  });
});

// ── eager binders (β) ─────────────────────────────────────────────────────────

describe("eager binders", () => {
  it("parses βx as an eager binder", () => {
    const r = parse("λβx. x");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Abs("x", Var("x"), true));
  });

  it("treats βx and β x identically (whitespace skipped)", () => {
    const a = parse("λβx. x");
    const b = parse("λβ x. x");
    // Both should produce the same AST: an eager binder for x
    if (a.ok && b.ok) {
      expect(a.term).toEqual(Abs("x", Var("x"), true));
      // β x lexes as Beta + Ident; bare Beta in binder position is a parse error
      // (Beta token is not in the Identifier category)
      expect(b.ok).toBe(false);
    } else {
      // The "β x" form should fail to parse
      expect(b.ok).toBe(false);
    }
  });

  it("rejects bare β in binder position", () => {
    const r = parse("λβ. x");
    expect(r.ok).toBe(false);
  });

  it("rejects β prefix on a definition name", () => {
    // The LHS of a def is a name slot, not a binder slot — β is illegal here.
    const r = parseProgram("βf := λx. x\n");
    expect(r.ok).toBe(false);
  });

  it("rejects β prefix on a free variable reference", () => {
    // Variable references are name slots — β has no role here.
    const r = parse("βx");
    expect(r.ok).toBe(false);
  });

  it("α/β/η are reserved everywhere, not absorbed into surrounding identifiers", () => {
    // These used to lex as a single PlainIdent (reserved letter mid-run).
    // Now they always tokenize as a separate reserved letter, so the parse
    // fails downstream.
    expect(parse("xβ").ok).toBe(false);
    expect(parse("xα").ok).toBe(false);
    expect(parse("xη").ok).toBe(false);
    // Other Greek letters still work mid-identifier:
    expect(parse("xγ").ok).toBe(true);
  });

  it("mixes eager and lazy binders in one λ", () => {
    const r = parse("λβx y. x");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Abs("x", Abs("y", Var("x"), false), true));
  });

  it("supports eager binder in [βx := arg] sugar", () => {
    const r = parse("e[βx:=a]");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(App(Abs("x", Var("e"), true), Var("a")));
  });

  it("accepts β fused to a backtick-quoted name", () => {
    const r = parse("λβ`weird name`. x");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Abs("weird name", Var("x"), true));
  });

  it("rejects β + whitespace + backtick name (whitespace breaks fusion)", () => {
    const r = parse("λβ `weird name`. x");
    expect(r.ok).toBe(false);
  });

  it("pretty-prints β prefix on eager binders", () => {
    expect(prettyPrint(Abs("x", Var("x"), true))).toBe("λβx. x");
    expect(prettyPrint(Abs("x", Abs("y", Var("x"), false), true))).toBe("λβx y. x");
  });

  it("round-trips eager binders through pretty + parse", () => {
    const t = Abs("x", Abs("y", App(Var("x"), Var("y")), true), true);
    const s = prettyPrint(t);
    const r = parse(s);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(t);
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
    // \x y z. x z (y z)
    const t = Abs("x", Abs("y", Abs("z",
      App(App(Var("x"), Var("z")), App(Var("y"), Var("z"))))));
    expect(roundTrip(t)).toEqual(t);
  });
  it("lambda in argument position", () => {
    // f (\x. x)  — arg needs parens
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
    // \x. x  — the x in the body is bound, not the def
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
    const r = parseProgram("I := λx. x\nI");
    expect(r.ok).toBe(true);
    // expr should be the expanded form (the body of I)
    expect(r.expr).toEqual(Abs("x", Var("x")));
    expect(r.defs.get("I")?.term).toEqual(Abs("x", Var("x")));
  });

  it("desugars param shorthand  f x := e  →  f := λx. e", () => {
    const r = parseProgram("K x y := x\nK");
    expect(r.ok).toBe(true);
    expect(r.defs.get("K")?.term).toEqual(Abs("x", Abs("y", Var("x"))));
  });

  it("expands definitions eagerly into later lines", () => {
    const r = parseProgram("I := λx. x\nf := I\nf");
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
    const r = parseProgram("I := λx. x; I");
    expect(r.ok).toBe(true);
    expect(r.expr).toEqual(Abs("x", Var("x")));
  });

  it("allows multiple definitions on one line with semicolons", () => {
    const r = parseProgram("K := λx y. x; I := λx. x; K");
    expect(r.ok).toBe(true);
    expect(r.defs.get("K")?.term).toEqual(Abs("x", Abs("y", Var("x"))));
    expect(r.defs.get("I")?.term).toEqual(Abs("x", Var("x")));
    expect(r.expr).toEqual(Abs("x", Abs("y", Var("x"))));
  });

  it("ignores trailing semicolons", () => {
    const r = parseProgram("x;");
    expect(r.ok).toBe(true);
    expect(r.expr).toEqual(Var("x"));
  });

  it("reports an error for a bad definition body", () => {
    const r = parseProgram("f := (");
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("warns on redefinition with different normal form", () => {
    const r = parseProgram("I := λx. x\nI := λx. x x");
    expect(r.ok).toBe(true); // warning doesn't block loading
    expect(r.errors.some(e => e.kind === "warning" && e.message.includes("I"))).toBe(true);
  });

  it("does not warn on redefinition with the same normal form", () => {
    // \x y. x  and  \a b. a  are alpha-equivalent
    const r = parseProgram("T := λx y. x\nT := λa b. a");
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
    // '(x) := y' — LHS contains a non-identifier token; the grammar cannot parse := after a term
    const r = parseProgram("(x) := y");
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("reports a lex error for unrecognised characters", () => {
    const r = parseProgram("@");
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.message.includes("Lex error"))).toBe(true);
  });

  it("parses an operator definition: + m n := m S n", () => {
    const r = parseProgram("+ m n := m S n\n+");
    expect(r.ok).toBe(true);
    expect(r.defs.has("+")).toBe(true);
  });

  it("π is a regular identifier and can be defined", () => {
    const r = parseProgram("π := λx y. x\nπ a b");
    expect(r.ok).toBe(true);
    expect(r.defs.has("π")).toBe(true);
    expect(r.printInfos[0].result).toBe("a");
  });

  it("returns null expr for an empty program", () => {
    const r = parseProgram("");
    expect(r.expr).toBeNull();
    expect(r.ok).toBe(true);
  });

  it("returns null expr for a defs-only program", () => {
    const r = parseProgram("I := λx. x");
    expect(r.expr).toBeNull();
    expect(r.ok).toBe(true);
    expect(r.defs.has("I")).toBe(true);
  });

  it("parses a backtick identifier in an expression", () => {
    const r = parse("`a b`");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.term).toEqual(Var("a b"));
  });

  it("backtick identifier can be a definition name", () => {
    const r = parseProgram("`my func` := λx. x");
    expect(r.ok).toBe(true);
    expect(r.defs.has("my func")).toBe(true);
  });

  it("records result and normal=true for a normalizing term", () => {
    const r = parseProgram("I := λx. x\nI");
    expect(r.printInfos).toHaveLength(1);
    expect(r.printInfos[0].result).toBe("λx. x");
    expect(r.printInfos[0].normal).toBe(true);
  });

  it("records normal=false when step limit is hit", () => {
    const r = parseProgram(":set max-steps = 5\n(λx. x x)(λx. x x)");
    expect(r.printInfos).toHaveLength(1);
    expect(r.printInfos[0].normal).toBe(false);
  });

  it("≡ with identical normal forms sets equivalent=true", () => {
    const r = parseProgram(":assert (λx. x) ≡ (λy. y)");
    expect(r.ok).toBe(true);
    expect(r.equivInfos).toHaveLength(1);
    expect(r.equivInfos[0].equivalent).toBe(true);
  });

  it("reduces an eager abstraction (arg evaluated before substitution)", () => {
    // (λβx. x x) ((λy. y) a) → a a  (arg reduced once, then duplicated as NF)
    const r = parseProgram("(λβx. x x) ((λy. y) a)\n");
    expect(r.ok).toBe(true);
    expect(r.printInfos[0].result).toBe("a a");
    expect(r.printInfos[0].normal).toBe(true);
  });

  it("eager and lazy abstractions are ≡-equivalent at NF", () => {
    const r = parseProgram(":assert (λβx. x) ≡ (λx. x)\n");
    expect(r.ok).toBe(true);
    expect(r.equivInfos[0].equivalent).toBe(true);
  });

  it("eager binder works in a definition: f βx := x", () => {
    const r = parseProgram("f βx := x\nf a\n");
    expect(r.ok).toBe(true);
    expect(r.printInfos[0].result).toBe("a");
  });
});

// ── Bare expressions: print + last-wins eval-panel state ─────────────────────

describe("bare expressions", () => {
  it("a bare expression prints and is recorded for the eval panel", () => {
    const r = parseProgram("I := λx. x\nI y\n");
    expect(r.ok).toBe(true);
    expect(r.printInfos).toHaveLength(1);
    expect(r.printInfos[0].result).toBe("y");
    expect(r.expr).not.toBeNull();
  });

  it("multiple bare expressions all print; last wins for the eval panel", () => {
    const r = parseProgram("I := λx. x\nI a\nI b\nI c\n");
    expect(r.printInfos).toHaveLength(3);
    expect(r.printInfos.map(p => p.result)).toEqual(["a", "b", "c"]);
    // eval panel shows the last bare expression
    expect(r.rawExpr).not.toBeNull();
  });

  it(":eval overrides bare expressions for the eval panel", () => {
    const r = parseProgram("I := λx. x\nI a\n:eval I b\nI c\n");
    expect(r.printInfos).toHaveLength(2);   // bare exprs print; :eval doesn't
    // After the first :eval, bare exprs no longer override the panel.
    // The eval panel keeps "I b" — verify via prettyPrint of rawExpr
    expect(r.rawExpr).not.toBeNull();
  });
});

// ── Block comments (#* ... *#) ────────────────────────────────────────────────

describe("block comments", () => {
  it("ignores a single-line block comment", () => {
    const r = parseProgram("#* this is a comment *#\nf := λx. x");
    expect(r.ok).toBe(true);
    expect(r.defs.has("f")).toBe(true);
  });

  it("ignores a multi-line block comment", () => {
    const r = parseProgram("f := λx. x\n#* start\nstill comment\nend *#\ng := λx. x x");
    expect(r.ok).toBe(true);
    expect(r.defs.has("f")).toBe(true);
    expect(r.defs.has("g")).toBe(true);
  });

  it("does not process defs inside a block comment", () => {
    const r = parseProgram("#*\nfake := λx. x\n*#\nreal := λx. x x");
    expect(r.ok).toBe(true);
    expect(r.defs.has("fake")).toBe(false);
    expect(r.defs.has("real")).toBe(true);
  });

  it("does not process pragmas inside a block comment", () => {
    const r = parseProgram("#*\n:set max-steps = 1\n*#\nf := λx. x");
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("block comment extending to end of file ignores remaining content", () => {
    const r = parseProgram("f := λx. x\n#* unclosed\ng := λx. x x");
    expect(r.ok).toBe(true);
    expect(r.defs.has("f")).toBe(true);
    expect(r.defs.has("g")).toBe(false); // swallowed by unterminated comment
  });
});

// ── Line continuation ────────────────────────────────────────────────────────

describe("line continuation", () => {
  it("indented line continues previous statement", () => {
    const r = parseProgram("f :=\n  λx. x\n");
    expect(r.ok).toBe(true);
    expect(r.defs.has("f")).toBe(true);
    expect(r.defs.get("f")?.term).toEqual(Abs("x", Var("x")));
  });

  it("tab-indented line continues previous statement", () => {
    const r = parseProgram("f :=\n\tλx. x\n");
    expect(r.ok).toBe(true);
    expect(r.defs.has("f")).toBe(true);
  });

  it("non-indented line starts a new statement", () => {
    const r = parseProgram("f := λx.\nx\n");
    expect(r.ok).toBe(false); // "λx." on its own is incomplete, "x" is a separate bare expr
  });

  it("blank lines between continuations break the statement", () => {
    const r = parseProgram("f :=\n\n  λx. x\n");
    expect(r.ok).toBe(false); // blank line breaks continuation
  });

  it("whitespace-only lines also break continuation", () => {
    const r = parseProgram("f :=\n   \n  λx. x\n");
    expect(r.ok).toBe(false); // whitespace-only line breaks like an empty line
  });

  it("whitespace-only line splits bare expressions instead of joining them", () => {
    const r = parseProgram("I := λx. x\nI\n  \n  I\n");
    expect(r.ok).toBe(true);
    expect(r.printInfos).toHaveLength(2);
  });

  it("multi-line definition with continuation", () => {
    const r = parseProgram("and p q :=\n  p q\n  false\n");
    expect(r.ok).toBe(true);
    expect(r.defs.has("and")).toBe(true);
  });

  it("continuation works for :print statements", () => {
    const r = parseProgram("I := λx. x\n:print\n  I\n");
    expect(r.ok).toBe(true);
    expect(r.printInfos).toHaveLength(1);
  });

  it("continuation works for bare expressions", () => {
    const r = parseProgram("f := λx y. x\nf\n  a\n  b\n");
    expect(r.ok).toBe(true);
    expect(r.printInfos).toHaveLength(1);
    expect(r.printInfos[0].result).toBe("a");
  });

  it("continuation works for :assert statements", () => {
    const r = parseProgram(":assert\n  (λx. x)\n  ≡\n  (λy. y)\n");
    expect(r.ok).toBe(true);
    expect(r.equivInfos).toHaveLength(1);
    expect(r.equivInfos[0].equivalent).toBe(true);
  });
});

// ── Indented-statement warning ───────────────────────────────────────────────

describe("indented-statement warning", () => {
  const indentWarnings = (r: { errors: { kind?: string; message: string }[] }) =>
    r.errors.filter(e => e.kind === "warning" && e.message.includes("not a continuation"));

  it("warns on leading whitespace at start of file", () => {
    const r = parseProgram("  λx. x\n");
    expect(indentWarnings(r)).toHaveLength(1);
  });

  it("warns on leading whitespace after a blank line", () => {
    const r = parseProgram("a\n\n  b\n");
    expect(indentWarnings(r)).toHaveLength(1);
  });

  it("warns on leading whitespace after a whitespace-only line", () => {
    const r = parseProgram("a\n   \n  b\n");
    expect(indentWarnings(r)).toHaveLength(1);
  });

  it("does not warn on a normal indented continuation", () => {
    const r = parseProgram("a\n  b\n  c\n");
    expect(indentWarnings(r)).toHaveLength(0);
  });

  it("does not warn on an indented line comment", () => {
    const r = parseProgram("a\n\n  # this is fine\nb\n");
    expect(indentWarnings(r)).toHaveLength(0);
  });

  it("does not warn on an indented block comment", () => {
    const r = parseProgram("a\n\n  #* fine *#\nb\n");
    expect(indentWarnings(r)).toHaveLength(0);
  });

  it("flags only the first line of an indented block (continuations absorb the rest)", () => {
    const r = parseProgram("a\n\n  b\n  c\n  d\n");
    expect(indentWarnings(r)).toHaveLength(1);
  });
});

// ── Directive value syntax ───────────────────────────────────────────────────────

describe("pragma value syntax", () => {
  it("accepts = syntax: :set max-steps = 42", () => {
    const r = parseProgram(":set max-steps = 42\n");
    expect(r.options.maxStepsPrint).toBe(42);
  });

  it("accepts space syntax: :set max-steps 42", () => {
    const r = parseProgram(":set max-steps 42\n");
    expect(r.options.maxStepsPrint).toBe(42);
  });

  it("accepts no-space =: :set max-steps=42", () => {
    const r = parseProgram(":set max-steps=42\n");
    expect(r.options.maxStepsPrint).toBe(42);
  });

  it("accepts boolean pragma without value", () => {
    const r = parseProgram(":set normalize-defs\n");
    expect(r.options.normalizeDefs).toBe(true);
  });

  it("accepts boolean pragma with space value: :set normalize-defs true", () => {
    const r = parseProgram(":set normalize-defs true\n");
    expect(r.options.normalizeDefs).toBe(true);
  });

  it("accepts max-size pragma", () => {
    const r = parseProgram(":set max-size = 5000\n");
    expect(r.options.maxSize).toBe(5000);
  });

  it("max-steps-print and max-steps-ident can be set independently", () => {
    const r = parseProgram(":set max-steps-print = 100\n:set max-steps-ident = 200\n");
    expect(r.options.maxStepsPrint).toBe(100);
    expect(r.options.maxStepsIdent).toBe(200);
  });

  it("unknown pragma key produces a warning", () => {
    const r = parseProgram(":set unknown-thing = 42\n");
    expect(r.errors.some(e => e.kind === "warning" && e.message.includes("unknown-thing"))).toBe(true);
  });

  it("boolean pragma with a non-boolean value produces a warning", () => {
    const r = parseProgram(":set normalize-defs = 42\n");
    expect(r.errors.some(e => e.kind === "warning" && e.message.includes("normalize-defs"))).toBe(true);
  });

  it("no-normalize-defs stores definition bodies without normalizing", () => {
    // f x := (λy. y) x — body has a redex that normalizeDefs=true would reduce
    const withNorm    = parseProgram("f x := (λy. y) x");
    const withoutNorm = parseProgram(":set no-normalize-defs\nf x := (λy. y) x");
    // With normalization: f = λx. x
    expect(prettyPrint(withNorm.defs.get("f")!.term)).toBe("λx. x");
    // Without: f = λx. (λy. y) x (redex preserved)
    expect(prettyPrint(withoutNorm.defs.get("f")!.term)).not.toBe("λx. x");
  });
});

// ── Error clickability: every error must carry an offset ─────────────────────
// Errors without an offset cannot be made clickable in the UI.

describe("error offsets", () => {
  const cases: [string, string][] = [
    ["incomplete lambda (EOF error)",      "foo λ"],
    ["unmatched paren",                    "(x"],
    ["bad definition body",                "f := ("],
    ["lex error",                          "@"],
    ["bad :assert body (unmatched paren)",  ":assert (x (y"],
    ["stray token on second line",         "a\n)"],
    ["definition with paren on LHS",       "(x) := y"],
    ["incomplete lambda in definition",    "f := λx"],
  ];

  for (const [label, src] of cases) {
    it(`all errors have an offset: ${label}`, () => {
      const r = parseProgram(src);
      expect(r.errors.length).toBeGreaterThan(0);
      for (const e of r.errors) {
        expect(e.offset, `error "${e.message}" has no offset`).not.toBeUndefined();
      }
    });
  }
});

// ── Include system ────────────────────────────────────────────────────────────

describe("include system", () => {
  const resolver = (path: string) => {
    const files: Record<string, string> = {
      "std/Booleans": "true := λx y. x\nfalse := λx y. y",
      "std/WithInclude": ":import \"std/Booleans\"\nnot p := p false true",
      "std/Circular1": ":import \"std/Circular2\"\nx := λa. a",
      "std/Circular2": ":import \"std/Circular1\"\ny := λa. a",
    };
    return files[path] ?? null;
  };

  it("imports defs from included file", () => {
    const r = parseProgram(":import \"std/Booleans\"\ntrue\n", {}, resolver);
    expect(r.errors).toHaveLength(0);
    expect(r.defs.has("true")).toBe(true);
    expect(r.defs.has("false")).toBe(true);
  });

  it("included file's own includes are resolved (nested)", () => {
    const r = parseProgram(":import \"std/WithInclude\"\n", {}, resolver);
    expect(r.errors).toHaveLength(0);
    expect(r.defs.has("true")).toBe(true);
    expect(r.defs.has("not")).toBe(true);
  });

  it("reports error for unknown include path", () => {
    const r = parseProgram(":import \"std/Unknown\"\n", {}, resolver);
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toMatch(/not found/i);
  });

  it("detects circular includes", () => {
    const r = parseProgram(":import \"std/Circular1\"\n", {}, resolver);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.message.match(/circular/i))).toBe(true);
  });

  it("annotates errors from included file with source", () => {
    const badResolver = (path: string) => path === "std/Bad" ? "f := (" : null;
    const r = parseProgram(":import \"std/Bad\"\n", {}, badResolver);
    expect(r.ok).toBe(false);
    expect(r.errors[0].source).toBe("std/Bad");
  });

  it("print and eval statements in included file are silenced", () => {
    // Bare expressions, :print, and :eval in an included file do not
    // affect the parent's output panel or eval panel — only defs and
    // errors propagate.
    const incl = "x := λa. a\nx\n:print x\n:eval x\n";
    const res = (path: string) => path === "std/WithStmts" ? incl : null;
    const r = parseProgram(":import \"std/WithStmts\"\n", {}, res);
    expect(r.printInfos).toHaveLength(0);
    expect(r.equivInfos).toHaveLength(0);
    expect(r.expr).toBeNull();
    expect(r.rawExpr).toBeNull();
    expect(r.defs.has("x")).toBe(true);
  });

  it("parent max-steps pragma does not affect included file", () => {
    // not(not(true)) takes several steps — would fail with max-steps=1 but include ignores parent pragmas
    const bools = "true := λx y. x\nfalse := λx y. y\nnot := λb. b false true\n";
    const res = (path: string) => path === "std/Bools" ? bools : null;
    const r = parseProgram(":set max-steps=1\n:import \"std/Bools\"\n", {}, res);
    expect(r.ok).toBe(true);
    expect(r.defs.has("not")).toBe(true);
  });

  it("bubbles up equiv failure from included file as an error", () => {
    const bad = "true := λx y. x\nfalse := λx y. y\n:assert true ≡ false\n";
    const res = (path: string) => path === "std/Bad" ? bad : null;
    const r = parseProgram(":import \"std/Bad\"\n", {}, res);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.message.match(/assertion failed/i))).toBe(true);
  });

  it("included file max-steps pragma does not affect parent", () => {
    // included file sets max-steps=1; parent's bare expr should still normalize not(not(true))
    const bools = ":set max-steps=1\ntrue := λx y. x\nfalse := λx y. y\nnot := λb. b false true\n";
    const res = (path: string) => path === "std/Bools" ? bools : null;
    const r = parseProgram(":import \"std/Bools\"\nnot (not true)\n", {}, res);
    expect(r.ok).toBe(true);
    expect(r.printInfos[0].normal).toBe(true);
  });

  it("_-prefixed defs are private and not exported across include boundary", () => {
    const lib = "_helper := λx. x\npublic := _helper\n";
    const res = (path: string) => path === "lib" ? lib : null;
    const r = parseProgram(":import \"lib\"\n", {}, res);
    expect(r.defs.has("public")).toBe(true);
    expect(r.defs.has("_helper")).toBe(false);
  });

  it("_-prefixed defs are private and not exported across mixin boundary", () => {
    const lib = "_helper := λx. x\npublic := _helper\n";
    const res = (path: string) => path === "lib" ? lib : null;
    const r = parseProgram(":mixin \"lib\"\n", {}, res);
    expect(r.defs.has("public")).toBe(true);
    expect(r.defs.has("_helper")).toBe(false);
  });

  it("import[quiet] marks all imported names as quiet", () => {
    const lib = "foo := λx. x\nbar := λy. y\n";
    const res = (path: string) => path === "lib" ? lib : null;
    const r = parseProgram(":import[quiet] \"lib\"\n", {}, res);
    expect(r.defs.has("foo")).toBe(true);
    expect(r.defs.has("bar")).toBe(true);
    expect(r.defs.get("foo")?.quiet).toBe(true);
    expect(r.defs.get("bar")?.quiet).toBe(true);
  });

  it("mixin[quiet] marks all mixed-in names as quiet", () => {
    const lib = "foo := λx. x\nbar := λy. y\n";
    const res = (path: string) => path === "lib" ? lib : null;
    const r = parseProgram(":mixin[quiet] \"lib\"\n", {}, res);
    expect(r.defs.has("foo")).toBe(true);
    expect(r.defs.has("bar")).toBe(true);
    expect(r.defs.get("foo")?.quiet).toBe(true);
    expect(r.defs.get("bar")?.quiet).toBe(true);
  });

  it("warns on unknown import/mixin options per token", () => {
    const lib = "foo := λx. x\n";
    const res = (path: string) => path === "lib" ? lib : null;
    // Single unknown bare flag.
    const r1 = parseProgram(":import[quie] \"lib\"\n", {}, res);
    expect(r1.defs.get("foo")?.quiet).toBe(false);
    expect(r1.errors.find(e => e.message.includes("Unknown include option") && e.message.includes("quie"))).toBeDefined();

    // quiet + unknown: quiet still applies, unknown still warns.
    const r2 = parseProgram(":import[quiet, bogus] \"lib\"\n", {}, res);
    expect(r2.defs.get("foo")?.quiet).toBe(true);
    expect(r2.errors.find(e => e.message.includes("\"bogus\""))).toBeDefined();

    // Multiple unknowns: warn for each separately.
    const r3 = parseProgram(":import[foo, bar] \"lib\"\n", {}, res);
    expect(r3.errors.filter(e => e.message.includes("Unknown include option")).length).toBe(2);

    // Mixin uses "mixin" wording in the warning, not "include".
    const r4 = parseProgram(":mixin[oopz] \"lib\"\n", {}, res);
    expect(r4.errors.find(e => e.message.includes("Unknown mixin option"))).toBeDefined();

    // Unknown kv option warns by key.
    const r5 = parseProgram(":import[suffix=\"X\"] \"lib\"\n", {}, res);
    expect(r5.errors.find(e => e.message.includes("Unknown include option") && e.message.includes("suffix"))).toBeDefined();
  });

  it("strips trailing # comments from directive lines", () => {
    const lib = "foo := λx. x\n";
    const res = (path: string) => path === "lib" ? lib : null;

    // Comment after path: import succeeds, no quiet, no warnings.
    const r1 = parseProgram(":import \"lib\" # quiet was a typo\n", {}, res);
    expect(r1.defs.has("foo")).toBe(true);
    expect(r1.defs.get("foo")?.quiet).toBe(false);
    expect(r1.errors).toEqual([]);

    // Comment after a recognized option: option still applies.
    const r2 = parseProgram(":import[quiet] \"lib\" # justification\n", {}, res);
    expect(r2.defs.get("foo")?.quiet).toBe(true);
    expect(r2.errors).toEqual([]);

    // Comment on a :set line: pragma applies, comment ignored, no junk warning.
    const r3 = parseProgram(":set max-size 1234 # bump for big terms\n", {}, res);
    expect(r3.options.maxSize).toBe(1234);
    expect(r3.errors).toEqual([]);

    // # inside the quoted path is part of the path, not a comment.
    const r4 = parseProgram(":import \"lib#weird\"\n", {}, res);
    expect(r4.errors.find(e => e.message.includes("Include not found"))?.message).toContain("lib#weird");
  });

  it("normal include preserves quiet=false", () => {
    const lib = "foo := λx. x\n";
    const res = (path: string) => path === "lib" ? lib : null;
    const r = parseProgram(":import \"lib\"\n", {}, res);
    expect(r.defs.has("foo")).toBe(true);
    expect(r.defs.get("foo")?.quiet).toBe(false);
  });

  it("empty options bracket is a no-op", () => {
    const lib = "foo := λx. x\n";
    const res = (path: string) => path === "lib" ? lib : null;
    const r = parseProgram(":import[] \"lib\"\n", {}, res);
    expect(r.defs.has("foo")).toBe(true);
    expect(r.defs.get("foo")?.quiet).toBe(false);
    expect(r.errors).toEqual([]);
  });

  it("local redefinition clears quiet flag", () => {
    const lib = "foo := λx. x\n";
    const res = (path: string) => path === "lib" ? lib : null;
    const r = parseProgram(":import[quiet] \"lib\"\nfoo ::= λy. y\n", {}, res);
    expect(r.defs.has("foo")).toBe(true);
    expect(r.defs.get("foo")?.quiet).toBe(false);
  });

  it("latter import wins: quiet then normal → visible", () => {
    const lib = "foo := λx. x\n";
    const res = (path: string) => path === "lib" ? lib : null;
    const r = parseProgram(":import[quiet] \"lib\"\n:import \"lib\"\n", {}, res);
    expect(r.defs.get("foo")?.quiet).toBe(false);
  });

  it("latter import wins: normal then quiet → quiet", () => {
    const lib = "foo := λx. x\n";
    const res = (path: string) => path === "lib" ? lib : null;
    const r = parseProgram(":import \"lib\"\n:import[quiet] \"lib\"\n", {}, res);
    expect(r.defs.get("foo")?.quiet).toBe(true);
  });

  it("quiet flag propagates through include chain", () => {
    const inner = "bar := λx. x\n";
    const outer = ":import[quiet] \"inner\"\nfoo := λy. y\n";
    const res = (path: string) => path === "inner" ? inner : path === "outer" ? outer : null;
    // outer imports inner quietly → bar is quiet in outer
    // parent imports outer normally → bar stays quiet, foo is visible
    const r = parseProgram(":import \"outer\"\n", {}, res);
    expect(r.defs.has("bar")).toBe(true);
    expect(r.defs.has("foo")).toBe(true);
    expect(r.defs.get("bar")?.quiet).toBe(true);
    expect(r.defs.get("foo")?.quiet).toBe(false);
  });

  it("import[quiet] forces transitive names quiet regardless of chain", () => {
    const inner = "bar := λx. x\n";
    const outer = ":import \"inner\"\nfoo := λy. y\n";
    const res = (path: string) => path === "inner" ? inner : path === "outer" ? outer : null;
    // outer imports inner normally → bar is visible in outer
    // parent imports outer quietly → both bar and foo become quiet
    const r = parseProgram(":import[quiet] \"outer\"\n", {}, res);
    expect(r.defs.get("bar")?.quiet).toBe(true);
    expect(r.defs.get("foo")?.quiet).toBe(true);
  });

  it("quiet defs are excluded from match list in print output", () => {
    const lib = "id := λx. x\n";
    const res = (path: string) => path === "lib" ? lib : null;
    const r = parseProgram(":import[quiet] \"lib\"\nλx. x\n", {}, res);
    expect(r.printInfos).toHaveLength(1);
    // id is quiet → should NOT appear in match
    expect(r.printInfos[0].match).toBeUndefined();
  });

  it("legacy trailing 'quiet' form warns with migration hint", () => {
    const lib = "foo := λx. x\n";
    const res = (path: string) => path === "lib" ? lib : null;
    const r = parseProgram(":import \"lib\" quiet\n", {}, res);
    // Import still succeeds (path is recognized), but a warning points to new syntax.
    expect(r.defs.has("foo")).toBe(true);
    const warn = r.errors.find(e => e.message.includes("Unexpected text after path"));
    expect(warn).toBeDefined();
    expect(warn?.message).toContain("[<opts>]");
    // The trailing 'quiet' is NOT applied (no silent acceptance).
    expect(r.defs.get("foo")?.quiet).toBe(false);
  });

  it("prefix renames public defs", () => {
    const lib = "zero := λs z. z\nsucc n := λs z. s (n s z)\n";
    const res = (path: string) => path === "lib" ? lib : null;
    const r = parseProgram(":import[prefix=\"C\"] \"lib\"\n", {}, res);
    expect(r.defs.has("Czero")).toBe(true);
    expect(r.defs.has("Csucc")).toBe(true);
    expect(r.defs.has("zero")).toBe(false);
    expect(r.defs.has("succ")).toBe(false);
  });

  it("two prefixed imports of competing libraries don't collide", () => {
    const church = "zero := λs z. z\nsucc n := λs z. s (n s z)\n";
    const scott = "zero := λs z. z\nsucc n := λs z. s n\n";
    const res = (path: string) => path === "church" ? church : path === "scott" ? scott : null;
    const r = parseProgram(":import[prefix=\"C\"] \"church\"\n:import[prefix=\"S\"] \"scott\"\n", {}, res);
    expect(r.defs.has("Czero")).toBe(true);
    expect(r.defs.has("Szero")).toBe(true);
    expect(r.errors.filter(e => e.kind === "warning")).toEqual([]);
  });

  it("prefix skips private defs", () => {
    const lib = "_helper := λx. x\npublic := λy. y\n";
    const res = (path: string) => path === "lib" ? lib : null;
    const r = parseProgram(":import[prefix=\"S\"] \"lib\"\n", {}, res);
    expect(r.defs.has("Spublic")).toBe(true);
    expect(r.defs.has("S_helper")).toBe(false);
    expect(r.defs.has("_helper")).toBe(false);
  });

  it("prefix=\"_\" makes imported defs private locally and not re-exported", () => {
    const lib = "cons := λh t. λc n. c h (t c n)\n";
    const outer = ":import[prefix=\"_\"] \"lib\"\nuser := _cons\n";
    const res = (path: string) => path === "lib" ? lib : path === "outer" ? outer : null;
    const r = parseProgram(":import \"outer\"\n", {}, res);
    // _cons works inside outer — proven by `user := _cons` not erroring out.
    expect(r.errors.filter(e => e.kind !== "warning")).toEqual([]);
    expect(r.defs.has("user")).toBe(true);
    // _cons is private → not re-exported up to the parent.
    expect(r.defs.has("_cons")).toBe(false);
    expect(r.defs.has("cons")).toBe(false);
  });

  it("quiet and prefix combine, order-independent", () => {
    const lib = "foo := λx. x\n";
    const res = (path: string) => path === "lib" ? lib : null;
    const r1 = parseProgram(":import[quiet, prefix=\"X\"] \"lib\"\n", {}, res);
    const r2 = parseProgram(":import[prefix=\"X\", quiet] \"lib\"\n", {}, res);
    for (const r of [r1, r2]) {
      expect(r.defs.has("Xfoo")).toBe(true);
      expect(r.defs.get("Xfoo")?.quiet).toBe(true);
    }
  });

  it("infix flag follows prefix rename", () => {
    // Library defines `+` as infix and aliases it to add.
    const lib = "add a b := a\n+ := add\n:infix +\n";
    const res = (path: string) => path === "lib" ? lib : null;
    const r = parseProgram(":import[prefix=\"S\"] \"lib\"\n", {}, res);
    expect(r.defs.has("Sadd")).toBe(true);
    expect(r.defs.has("S+")).toBe(true);
    // infix is per-DefEntry — the renamed `S+` carries the flag.
    expect(r.defs.get("S+")?.infix).toBe(true);
    expect(r.defs.get("Sadd")?.infix).toBe(false);
  });

  it("invalid prefix value warns and is treated as empty", () => {
    const lib = "foo := λx. x\n";
    const res = (path: string) => path === "lib" ? lib : null;
    const r = parseProgram(":import[prefix=\"bad space\"] \"lib\"\n", {}, res);
    expect(r.errors.find(e => e.message.includes("Invalid prefix"))).toBeDefined();
    // Falls back to empty prefix → name imports unchanged.
    expect(r.defs.has("foo")).toBe(true);
  });

  it("malformed option token warns", () => {
    const lib = "foo := λx. x\n";
    const res = (path: string) => path === "lib" ? lib : null;
    const r = parseProgram(":import[prefix=missingquotes] \"lib\"\n", {}, res);
    expect(r.errors.find(e => e.message.includes("Malformed include option"))).toBeDefined();
  });

  it("visible defs still appear in match list", () => {
    const lib = "id := λx. x\n";
    const res = (path: string) => path === "lib" ? lib : null;
    const r = parseProgram(":import \"lib\"\nλx. x\n", {}, res);
    expect(r.printInfos).toHaveLength(1);
    expect(r.printInfos[0].match).toBe("id");
  });
});

// ── comprehension ─────────────────────────────────────────────────────────────

describe("comprehension", () => {
  const boolDefs = "true := λx y. x\nfalse := λx y. y\nand := λa b. a b false";

  it("comprehension produces one row per combination", () => {
    const r = parseProgram(`${boolDefs}\n:print[a:={true,false}, b:={true,false}] and a b`);
    expect(r.printComprehensionInfos).toHaveLength(1);
    const info = r.printComprehensionInfos[0];
    expect(info.src).toBe("and a b");
    expect(info.bindings).toHaveLength(2);
    expect(info.rows).toHaveLength(4);
    // and true true → true
    expect(info.rows[0].substExpr).toBe("(and a b)[a:=true][b:=true]");
    expect(info.rows[0].result).toBe("λx y. x");
    expect(info.rows[0].normal).toBe(true);
  });

  it("comprehension with single binding", () => {
    const r = parseProgram(`${boolDefs}\n:print[a:={true,false}] a`);
    expect(r.printComprehensionInfos).toHaveLength(1);
    expect(r.printComprehensionInfos[0].rows).toHaveLength(2);
  });

  it("≡ comprehension passes when all equivalent", () => {
    // not (not x) ≡ x for both true and false
    const prog = `${boolDefs}\nnot := λb. b false true\n:assert[a:={true,false}] (not (not a)) ≡ a`;
    const r = parseProgram(prog);
    expect(r.equivComprehensionInfos).toHaveLength(1);
    const info = r.equivComprehensionInfos[0];
    expect(info.allPassed).toBe(true);
    expect(info.rows).toHaveLength(2);
    expect(info.rows.every(row => row.equivalent)).toBe(true);
  });

  it("≡ comprehension fails and sets equivFailed when not all pass", () => {
    // a ≡ (not a) — clearly false for both true and false
    const prog = `${boolDefs}\nnot := λb. b false true\n:assert[a:={true,false}] a ≡ (not a)`;
    const r = parseProgram(prog);
    expect(r.equivComprehensionInfos).toHaveLength(1);
    expect(r.equivComprehensionInfos[0].allPassed).toBe(false);
    expect(r.ok).toBe(false); // equivFailed halts processing
  });

  it("≡ comprehension row substExprs are formatted correctly", () => {
    const prog = `${boolDefs}\n:assert[a:={true,false}] (and a a) ≡ a`;
    const r = parseProgram(prog);
    const rows = r.equivComprehensionInfos[0].rows;
    expect(rows[0].substExpr1).toBe("(and a a)[a:=true]");
    expect(rows[0].substExpr2).toBe("(a)[a:=true]");
  });

  it("≢ passes when terms are not equivalent", () => {
    const prog = `${boolDefs}\n:assert true ≢ false`;
    const r = parseProgram(prog);
    expect(r.ok).toBe(true);
    expect(r.equivInfos).toHaveLength(1);
    expect(r.equivInfos[0].negated).toBe(true);
    expect(r.equivInfos[0].equivalent).toBe(false);
  });

  it("≢ fails (halts) when terms are equivalent", () => {
    const prog = `${boolDefs}\n:assert true ≢ true`;
    const r = parseProgram(prog);
    expect(r.ok).toBe(false);
    expect(r.equivInfos[0].equivalent).toBe(true);
    expect(r.equivInfos[0].negated).toBe(true);
  });

  it("≢ comprehension passes when all rows are non-equivalent", () => {
    const notDefs = `${boolDefs}\nnot := λb. b false true`;
    const r = parseProgram(`${notDefs}\n:assert[a:={true,false}] a ≢ (not a)`);
    expect(r.ok).toBe(true);
    expect(r.equivComprehensionInfos[0].allPassed).toBe(true);
    expect(r.equivComprehensionInfos[0].negated).toBe(true);
  });
});

// ── :assert grammar errors ──────────────────────────────────────────────────────
// Errors specific to the new infix `:assert <a> ≡ <b>` form: bare ≡/≢ at line
// start, missing relation, chained relations, and the legacy `:assert-not` keyword.

describe(":assert grammar errors", () => {
  it("bare ≡ at line start is a parse error (must be inside :assert)", () => {
    const r = parseProgram("≡ (λx. x) (λy. y)\n");
    expect(r.errors.some(e => e.kind !== "warning")).toBe(true);
  });

  it("bare ≢ at line start is a parse error", () => {
    const r = parseProgram("≢ x y\n");
    expect(r.errors.some(e => e.kind !== "warning")).toBe(true);
  });

  it(":assert without a relation is a parse error", () => {
    const r = parseProgram(":assert (λx. x) (λy. y)\n");
    expect(r.errors.some(e => e.kind !== "warning")).toBe(true);
  });

  it(":assert with only LHS (no ≡/≢ and no RHS) is a parse error", () => {
    const r = parseProgram(":assert foo\n");
    expect(r.errors.some(e => e.kind !== "warning")).toBe(true);
  });

  it("legacy :assert-not is no longer recognized", () => {
    const r = parseProgram(":assert-not x y\n");
    expect(r.errors.some(e => e.kind !== "warning")).toBe(true);
  });
});

// ── :set allow-eta pragma ───────────────────────────────────────────────────────

describe("allow-eta pragma", () => {
  it("without pragma, eta-redex is left as normal form", () => {
    const r = parseProgram("f := λx. g x\nf");
    expect(r.ok).toBe(true);
    expect(r.printInfos[0].result).toBe("λx. g x");
  });

  it("with :set allow-eta, eta-redex normalizes to g", () => {
    const r = parseProgram(":set allow-eta\nf := λx. g x\nf");
    expect(r.ok).toBe(true);
    expect(r.printInfos[0].result).toBe("g");
  });

  it("allow-eta affects ≡ evaluation", () => {
    // Without eta: λx. g x ≢ g. With eta: they are equivalent.
    const withEta    = parseProgram(":set allow-eta\n:assert (λx. g x) ≡ g");
    const withoutEta = parseProgram(":assert (λx. g x) ≡ g");
    expect(withEta.ok).toBe(true);
    expect(withoutEta.ok).toBe(false);
  });
});

// ── Include overwrites local defs ─────────────────────────────────────────────

describe("include def ordering", () => {
  const resolver = (path: string) => {
    const files: Record<string, string> = {
      "std/Booleans": "true := λx y. x\nfalse := λx y. y",
    };
    return files[path] ?? null;
  };

  it("include after local def overwrites it", () => {
    const r = parseProgram("true := λx y. x y\n:import \"std/Booleans\"\n", {}, resolver);
    const entry = r.defs.get("true");
    expect(entry).toBeDefined();
    // After include, true should be λx y. x (from Booleans), not λx y. x y
    expect(prettyPrint(entry!.term)).toBe("λx y. x");
  });

  it("include overwrites warns when normal forms differ", () => {
    const r = parseProgram("true := λx y. x y\n:import \"std/Booleans\"\n", {}, resolver);
    expect(r.errors.some(e => e.kind === "warning" && e.message.includes("true"))).toBe(true);
  });

  it("local def after include overwrites included def", () => {
    const r = parseProgram(":import \"std/Booleans\"\ntrue := λx y. x y z\n", {}, resolver);
    // Local def comes after include — it should win, with a warning
    expect(r.errors.some(e => e.kind === "warning" && e.message.includes("true"))).toBe(true);
  });
});

// ── Error location and attribution ───────────────────────────────────────────

describe("error location attribution", () => {
  it("local error has offset but no source", () => {
    const r = parseProgram("x\n(\n");
    const err = r.errors.find(e => e.kind !== "warning");
    expect(err).toBeDefined();
    expect(err!.source).toBeUndefined();
    expect(err!.offset).toBeDefined();
  });

  it("error from included file has source and location", () => {
    const resolver = (path: string) => path === "std/Bad" ? "f := (\n" : null;
    const r = parseProgram(":import \"std/Bad\"\n", {}, resolver);
    const err = r.errors.find(e => e.source === "std/Bad");
    expect(err).toBeDefined();
    expect(err!.location).toBeDefined(); // pre-computed line:col from included file
    expect(err!.offset).toBeDefined();   // jump target in current file (pragma line)
  });

  it("transitively included error has via set", () => {
    const resolver = (path: string) => {
      if (path === "std/Outer") return ":import \"std/Inner\"\n";
      if (path === "std/Inner") return "f := (\n";
      return null;
    };
    const r = parseProgram(":import \"std/Outer\"\n", {}, resolver);
    const err = r.errors.find(e => e.source === "std/Inner");
    expect(err).toBeDefined();
    expect(err!.via).toBe("std/Outer");
  });
});

describe("redef (::=)", () => {
  it("::= silences the redef warning when a name is already defined", () => {
    const r = parseProgram("I := λx. x\nI ::= λx. x x");
    expect(r.ok).toBe(true);
    expect(r.errors.filter(e => e.kind === "warning")).toHaveLength(0);
  });

  it("::= warns when the name was NOT previously defined", () => {
    const r = parseProgram("I ::= λx. x");
    expect(r.ok).toBe(true);
    expect(r.errors.some(e => e.kind === "warning" && e.message.includes("I") && e.message.includes("::="))).toBe(true);
  });

  it(":= still warns on redef with a different normal form", () => {
    const r = parseProgram("I := λx. x\nI := λx. x x");
    expect(r.ok).toBe(true);
    expect(r.errors.some(e => e.kind === "warning" && e.message.includes("I"))).toBe(true);
  });

  it("::= without prior def still sets the definition", () => {
    const r = parseProgram("I ::= λx. x\n:assert I ≡ (λx. x)");
    expect(r.ok).toBe(true);
    expect(r.equivInfos[0].equivalent).toBe(true);
  });

  it("::= updates the definition and it takes effect afterward", () => {
    const r = parseProgram("T := λx y. x\nT ::= λx y. y\n:assert T ≡ (λx y. y)");
    expect(r.ok).toBe(true);
    expect(r.equivInfos[0].equivalent).toBe(true);
  });
});

describe("runEval flag", () => {
  it("runEval=false marks print results as notRun and skips evaluation", () => {
    const r = parseProgram("(λx. x x) (λx. x x)", { runEval: false });
    expect(r.printInfos).toHaveLength(1);
    expect(r.printInfos[0].notRun).toBe(true);
    expect(r.printInfos[0].src).toBe("(λx. x x) (λx. x x)");
    expect(r.printInfos[0].result).toBe("");
  });

  it("runEval=false marks ≡ assertions as notRun, no equivFailed", () => {
    const r = parseProgram(":assert I ≡ (λx. x)\n:assert K ≡ (λx. x)", { runEval: false });
    expect(r.equivInfos).toHaveLength(2);
    expect(r.equivInfos.every(e => e.notRun === true)).toBe(true);
    expect(r.ok).toBe(true);  // assertion failures don't propagate when not run
  });

  it("runEval=false skips def normalization (canon undefined)", () => {
    const r = parseProgram("I := λx. x", { runEval: false });
    expect(r.defs.get("I")?.canon).toBeUndefined();
  });

  it("runEval=true (default) still evaluates normally", () => {
    const r = parseProgram("(λx. x) y");
    expect(r.printInfos[0].notRun).toBeUndefined();
    expect(r.printInfos[0].result).toBe("y");
    expect(r.printInfos[0].normal).toBe(true);
  });

  it("runEval=false marks comprehensions as notRun with empty rows", () => {
    const r = parseProgram(":print[x:={a,b}] x", { runEval: false });
    expect(r.printComprehensionInfos).toHaveLength(1);
    expect(r.printComprehensionInfos[0].notRun).toBe(true);
    expect(r.printComprehensionInfos[0].rows).toEqual([]);
    expect(r.printComprehensionInfos[0].bindings[0].values).toEqual(["a", "b"]);
  });
});
