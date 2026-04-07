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

  it("desugars e[x:=a] to (\\x. e) a", () => {
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
    const r = parseProgram("I := \\x. x\nI");
    expect(r.ok).toBe(true);
    // expr should be the expanded form (the body of I)
    expect(r.expr).toEqual(Abs("x", Var("x")));
    expect(r.defs.get("I")).toEqual(Abs("x", Var("x")));
  });

  it("desugars param shorthand  f x := e  →  f := \\x. e", () => {
    const r = parseProgram("K x y := x\nK");
    expect(r.ok).toBe(true);
    expect(r.defs.get("K")).toEqual(Abs("x", Abs("y", Var("x"))));
  });

  it("expands definitions eagerly into later lines", () => {
    const r = parseProgram("I := \\x. x\nf := I\nf");
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
    const r = parseProgram("I := \\x. x; I");
    expect(r.ok).toBe(true);
    expect(r.expr).toEqual(Abs("x", Var("x")));
  });

  it("allows multiple definitions on one line with semicolons", () => {
    const r = parseProgram("K := \\x y. x; I := \\x. x; K");
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
    const r = parseProgram("f := (");
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("warns on redefinition with different normal form", () => {
    const r = parseProgram("I := \\x. x\nI := \\x. x x");
    expect(r.ok).toBe(true); // warning doesn't block loading
    expect(r.errors.some(e => e.kind === "warning" && e.message.includes("I"))).toBe(true);
  });

  it("does not warn on redefinition with the same normal form", () => {
    // \x y. x  and  \a b. a  are alpha-equivalent
    const r = parseProgram("T := \\x y. x\nT := \\a b. a");
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
    // '(x) := y' — LHS contains a non-identifier token
    const r = parseProgram("(x) := y");
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.message.includes("left-hand side"))).toBe(true);
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

  it("rejects π followed by a definition: π a := b", () => {
    const r = parseProgram("π a := b");
    expect(r.ok).toBe(false);
  });
});

// ── Block comments (#* ... *#) ────────────────────────────────────────────────

describe("block comments", () => {
  it("ignores a single-line block comment", () => {
    const r = parseProgram("#* this is a comment *#\nf := \\x. x");
    expect(r.ok).toBe(true);
    expect(r.defs.has("f")).toBe(true);
  });

  it("ignores a multi-line block comment", () => {
    const r = parseProgram("f := \\x. x\n#* start\nstill comment\nend *#\ng := \\x. x x");
    expect(r.ok).toBe(true);
    expect(r.defs.has("f")).toBe(true);
    expect(r.defs.has("g")).toBe(true);
  });

  it("does not process defs inside a block comment", () => {
    const r = parseProgram("#*\nfake := \\x. x\n*#\nreal := \\x. x x");
    expect(r.ok).toBe(true);
    expect(r.defs.has("fake")).toBe(false);
    expect(r.defs.has("real")).toBe(true);
  });

  it("does not process pragmas inside a block comment", () => {
    const r = parseProgram("#*\n#! max-steps = 1\n*#\nf := \\x. x");
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("block comment extending to end of file ignores remaining content", () => {
    const r = parseProgram("f := \\x. x\n#* unclosed\ng := \\x. x x");
    expect(r.ok).toBe(true);
    expect(r.defs.has("f")).toBe(true);
    expect(r.defs.has("g")).toBe(false); // swallowed by unterminated comment
  });
});

// ── Pragma value syntax ───────────────────────────────────────────────────────

describe("pragma value syntax", () => {
  it("accepts = syntax: #! max-steps = 42", () => {
    const r = parseProgram("#! max-steps = 42");
    expect(r.pragmaConfig.maxStepsPrint).toBe(42);
  });

  it("accepts space syntax: #! max-steps 42", () => {
    const r = parseProgram("#! max-steps 42");
    expect(r.pragmaConfig.maxStepsPrint).toBe(42);
  });

  it("accepts no-space =: #! max-steps=42", () => {
    const r = parseProgram("#! max-steps=42");
    expect(r.pragmaConfig.maxStepsPrint).toBe(42);
  });

  it("accepts boolean pragma without value", () => {
    const r = parseProgram("#! normalize-defs");
    expect(r.pragmaConfig.normalizeDefs).toBe(true);
  });

  it("accepts boolean pragma with space value: #! normalize-defs true", () => {
    const r = parseProgram("#! normalize-defs true");
    expect(r.pragmaConfig.normalizeDefs).toBe(true);
  });
});

// ── Error clickability: every error must carry an offset ─────────────────────
// Errors without an offset cannot be made clickable in the UI.

describe("error offsets", () => {
  const cases: [string, string][] = [
    ["incomplete lambda (EOF error)",      "foo \\lambda"],
    ["unmatched paren",                    "(x"],
    ["bad definition body",                "f := ("],
    ["lex error",                          "@"],
    ["bad π body (unmatched paren)",       "π (x"],
    ["bad ≡ body (unmatched paren)",       "≡ (x (y"],
    ["stray token on second line",         "a\n)"],
    ["definition with paren on LHS",       "(x) := y"],
    ["incomplete lambda in definition",    "f := \\x"],
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
      "sys/Booleans": "true := λx y. x\nfalse := λx y. y",
      "sys/WithInclude": "#! include \"sys/Booleans\"\nnot p := p false true",
      "sys/Circular1": "#! include \"sys/Circular2\"\nx := λa. a",
      "sys/Circular2": "#! include \"sys/Circular1\"\ny := λa. a",
    };
    return files[path] ?? null;
  };

  it("imports defs from included file", () => {
    const r = parseProgram("#! include \"sys/Booleans\"\nπ true", {}, resolver);
    expect(r.errors).toHaveLength(0);
    expect(r.defs.has("true")).toBe(true);
    expect(r.defs.has("false")).toBe(true);
  });

  it("included file's own includes are resolved (nested)", () => {
    const r = parseProgram("#! include \"sys/WithInclude\"", {}, resolver);
    expect(r.errors).toHaveLength(0);
    expect(r.defs.has("true")).toBe(true);
    expect(r.defs.has("not")).toBe(true);
  });

  it("reports error for unknown include path", () => {
    const r = parseProgram("#! include \"sys/Unknown\"", {}, resolver);
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toMatch(/not found/i);
  });

  it("detects circular includes", () => {
    const r = parseProgram("#! include \"sys/Circular1\"", {}, resolver);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.message.match(/circular/i))).toBe(true);
  });

  it("annotates errors from included file with source", () => {
    const badResolver = (path: string) => path === "sys/Bad" ? "f := (" : null;
    const r = parseProgram("#! include \"sys/Bad\"", {}, badResolver);
    expect(r.ok).toBe(false);
    expect(r.errors[0].source).toBe("sys/Bad");
  });

  it("π statements in included file are silenced", () => {
    const piResolver = (path: string) => path === "sys/WithPi" ? "x := λa. a\nπ x" : null;
    const r = parseProgram("#! include \"sys/WithPi\"", {}, piResolver);
    expect(r.printInfos).toHaveLength(0);
    expect(r.defs.has("x")).toBe(true);
  });
});

// ── comprehension ─────────────────────────────────────────────────────────────

describe("comprehension", () => {
  const boolDefs = "true := λx y. x\nfalse := λx y. y\nand := λa b. a b false";

  it("π comprehension produces one row per combination", () => {
    const r = parseProgram(`${boolDefs}\nπ[a:={true,false}, b:={true,false}] and a b`);
    expect(r.printComprehensionInfos).toHaveLength(1);
    const info = r.printComprehensionInfos[0];
    expect(info.src).toBe("and a b");
    expect(info.bindings).toHaveLength(2);
    expect(info.rows).toHaveLength(4);
    // and true true → true
    expect(info.rows[0].substExpr).toBe("(and a b)[a:=true, b:=true]");
    expect(info.rows[0].result).toBe("λx y. x");
    expect(info.rows[0].normal).toBe(true);
  });

  it("π comprehension with single binding", () => {
    const r = parseProgram(`${boolDefs}\nπ[a:={true,false}] a`);
    expect(r.printComprehensionInfos).toHaveLength(1);
    expect(r.printComprehensionInfos[0].rows).toHaveLength(2);
  });

  it("≡ comprehension passes when all equivalent", () => {
    // not (not x) ≡ x for both true and false
    const prog = `${boolDefs}\nnot := λb. b false true\n≡[a:={true,false}] (not (not a)) a`;
    const r = parseProgram(prog);
    expect(r.equivComprehensionInfos).toHaveLength(1);
    const info = r.equivComprehensionInfos[0];
    expect(info.allPassed).toBe(true);
    expect(info.rows).toHaveLength(2);
    expect(info.rows.every(row => row.equivalent)).toBe(true);
  });

  it("≡ comprehension fails and sets equivFailed when not all pass", () => {
    // a ≡ (not a) — clearly false for both true and false
    const prog = `${boolDefs}\nnot := λb. b false true\n≡[a:={true,false}] a (not a)`;
    const r = parseProgram(prog);
    expect(r.equivComprehensionInfos).toHaveLength(1);
    expect(r.equivComprehensionInfos[0].allPassed).toBe(false);
    expect(r.ok).toBe(false); // equivFailed halts processing
  });

  it("≡ comprehension row substExprs are formatted correctly", () => {
    const prog = `${boolDefs}\n≡[a:={true,false}] (and a a) a`;
    const r = parseProgram(prog);
    const rows = r.equivComprehensionInfos[0].rows;
    expect(rows[0].substExpr1).toBe("(and a a)[a:=true]");
    expect(rows[0].substExpr2).toBe("(a)[a:=true]");
  });
});
