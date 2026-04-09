import { describe, it, expect } from "vitest";
import { Var, Abs, App, Subst } from "../parser/ast";
import { substitute, step, etaStep, freeVars, alphaEq, normalize, canonicalForm } from "./eval";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Church booleans
const T = Abs("x", Abs("y", Var("x")));   // \x y := x
const F = Abs("x", Abs("y", Var("y")));   // \x y := y

// Church numerals
const zero = Abs("f", Abs("x", Var("x")));
const one  = Abs("f", Abs("x", App(Var("f"), Var("x"))));
const two  = Abs("f", Abs("x", App(Var("f"), App(Var("f"), Var("x")))));

// Combinators
const I = Abs("x", Var("x"));
const K = Abs("x", Abs("y", Var("x")));

// ── substitute ────────────────────────────────────────────────────────────────

describe("substitute", () => {
  it("replaces a free variable", () => {
    expect(substitute(Var("x"), "x", Var("a"))).toEqual(Var("a"));
  });

  it("leaves unrelated variables alone", () => {
    expect(substitute(Var("y"), "x", Var("a"))).toEqual(Var("y"));
  });

  it("substitutes inside App", () => {
    expect(substitute(App(Var("x"), Var("y")), "x", Var("a")))
      .toEqual(App(Var("a"), Var("y")));
  });

  it("stops at a shadowing binder", () => {
    // (\x := x)[x := a]  →  \x := x  (x is bound)
    const term = Abs("x", Var("x"));
    expect(substitute(term, "x", Var("a"))).toEqual(term);
  });

  it("performs capture-avoiding substitution", () => {
    // (\y := x)[x := y]  must rename y to avoid capturing the free y
    const term = Abs("y", Var("x"));
    const result = substitute(term, "x", Var("y"));
    // Result should be \<fresh> := y, not \y := y (which would be \y := y = I)
    expect(result.kind).toBe("Abs");
    if (result.kind === "Abs") {
      expect(result.param).not.toBe("y");  // renamed
      expect(result.body).toEqual(Var("y")); // body is the substituted value
    }
  });

  it("Subst: param shadows substitution variable in body", () => {
    // x[x:=x][x:=a] — param shadows x in body, but x in arg gets substituted
    const s = Subst(Var("x"), "x", Var("x"));
    expect(substitute(s, "x", Var("a"))).toEqual(Subst(Var("x"), "x", Var("a")));
  });

  it("Subst: substitutes freely when no capture risk", () => {
    // body[p:=arg][x:=a] where p≠x and a has no free p
    const s = Subst(Var("x"), "p", Var("b"));
    expect(substitute(s, "x", Var("a"))).toEqual(Subst(Var("a"), "p", Var("b")));
  });

  it("Subst: capture-avoiding rename when replacement contains param", () => {
    // body[p:=arg][x:=p] — replacement 'p' would be captured by Subst's param
    const s = Subst(Var("x"), "p", Var("b"));
    const result = substitute(s, "x", Var("p"));
    expect(result.kind).toBe("Subst");
    if (result.kind === "Subst") {
      expect(result.param).not.toBe("p"); // renamed to avoid capture
    }
  });
});

// ── canonicalForm ─────────────────────────────────────────────────────────────

describe("canonicalForm", () => {
  it("Subst is canonical-equivalent to App(Abs(param, body), arg)", () => {
    // x[x:=a] should have same canonical form as (\x. x) a
    const subst = Subst(Var("x"), "x", Var("a"));
    const appAbs = App(Abs("x", Var("x")), Var("a"));
    expect(canonicalForm(subst)).toBe(canonicalForm(appAbs));
  });
});

// ── freeVars ──────────────────────────────────────────────────────────────────

describe("freeVars", () => {
  it("Var: free variable is itself", () => {
    expect(freeVars(Var("x"))).toEqual(new Set(["x"]));
  });

  it("Abs: bound variable is not free", () => {
    expect(freeVars(Abs("x", Var("x")))).toEqual(new Set());
    expect(freeVars(Abs("x", Var("y")))).toEqual(new Set(["y"]));
  });

  it("App: union of free vars", () => {
    expect(freeVars(App(Var("f"), Var("x")))).toEqual(new Set(["f", "x"]));
  });

  it("Subst: param is bound in body, arg is free", () => {
    // x[x:=a]  — x bound in body, a free from arg
    expect(freeVars(Subst(Var("x"), "x", Var("a")))).toEqual(new Set(["a"]));
    // y[x:=a]  — y and a are both free
    expect(freeVars(Subst(Var("y"), "x", Var("a")))).toEqual(new Set(["y", "a"]));
  });
});

// ── step ──────────────────────────────────────────────────────────────────────

describe("step", () => {
  it("returns null for a variable (normal form)", () => {
    expect(step(Var("x"))).toBeNull();
  });

  it("returns null for a lambda (already normal)", () => {
    expect(step(I)).toBeNull();
  });

  it("beta-reduces a redex", () => {
    // (\x := x) y  →  y
    expect(step(App(I, Var("y")))).toEqual(Var("y"));
  });

  it("reduces the function position first (normal order)", () => {
    // (\x := x) (\y := y) z  →  (\y := y) z  (leftmost outermost)
    const term = App(App(I, I), Var("z"));
    const result = step(term);
    expect(result).toEqual(App(I, Var("z")));
  });

  it("reduces under lambda", () => {
    // \x := (\y := y) x  →  \x := x
    const term = Abs("x", App(I, Var("x")));
    expect(step(term)).toEqual(Abs("x", Var("x")));
  });

  it("K applied twice reduces to first argument", () => {
    // K a b  =  (\x y := x) a b  →  (\y := a) b  →  a
    const term = App(App(K, Var("a")), Var("b"));
    const s1 = step(term);
    expect(s1).toEqual(App(Abs("y", Var("a")), Var("b")));
    const s2 = step(s1!);
    expect(s2).toEqual(Var("a"));
  });
});

// ── step with showSubst ───────────────────────────────────────────────────────

describe("step (showSubst=true)", () => {
  it("phase 1: redex produces a Subst node", () => {
    // (\x := x) y  →  x[x:=y]
    const redex = App(I, Var("y"));
    const result = step(redex, true);
    expect(result).toEqual(Subst(Var("x"), "x", Var("y")));
  });

  it("phase 2: Subst node performs the substitution", () => {
    // x[x:=y]  →  y
    const s = Subst(Var("x"), "x", Var("y"));
    expect(step(s)).toEqual(Var("y"));
  });

  it("two-phase takes two steps for a single beta", () => {
    const redex = App(I, Var("y"));
    const phase1 = step(redex, true);
    expect(phase1?.kind).toBe("Subst");
    const phase2 = step(phase1!, true);
    expect(phase2).toEqual(Var("y"));
  });

  it("showSubst=false skips Subst node", () => {
    // (\x := x) y  →  y  directly
    expect(step(App(I, Var("y")))).toEqual(Var("y"));
  });
});

// ── etaStep ───────────────────────────────────────────────────────────────────

describe("etaStep", () => {
  it("reduces a simple eta-redex: λx. f x → f", () => {
    const term = Abs("x", App(Var("f"), Var("x")));
    expect(etaStep(term)).toEqual(Var("f"));
  });

  it("returns null when x is free in f", () => {
    // λx. x x — x appears free in the func, not an eta-redex
    expect(etaStep(Abs("x", App(Var("x"), Var("x"))))).toBeNull();
  });

  it("returns null for a normal form with no eta-redex", () => {
    expect(etaStep(I)).toBeNull();
    expect(etaStep(Var("x"))).toBeNull();
  });

  it("reduces outermost-first", () => {
    // λx. (λy. f y) x — outer is eta-redex (reduces to λy. f y), inner also is
    const term = Abs("x", App(Abs("y", App(Var("f"), Var("y"))), Var("x")));
    expect(etaStep(term)).toEqual(Abs("y", App(Var("f"), Var("y"))));
  });

  it("recurses into App", () => {
    // f (λx. g x) — eta-redex in argument
    const term = App(Var("f"), Abs("x", App(Var("g"), Var("x"))));
    expect(etaStep(term)).toEqual(App(Var("f"), Var("g")));
  });

  it("recurses into Subst body and arg", () => {
    // (λx. f x)[p:=a] — eta-redex in body
    const s = Subst(Abs("x", App(Var("f"), Var("x"))), "p", Var("a"));
    expect(etaStep(s)).toEqual(Subst(Var("f"), "p", Var("a")));
    // b[p:=(λx. g x)] — eta-redex in arg
    const s2 = Subst(Var("b"), "p", Abs("x", App(Var("g"), Var("x"))));
    expect(etaStep(s2)).toEqual(Subst(Var("b"), "p", Var("g")));
  });
});

// ── alphaEq ───────────────────────────────────────────────────────────────────

describe("alphaEq", () => {
  it("identical terms are equal", () => {
    expect(alphaEq(Var("x"), Var("x"))).toBe(true);
    expect(alphaEq(I, I)).toBe(true);
  });

  it("alpha-equivalent lambdas are equal", () => {
    expect(alphaEq(Abs("x", Var("x")), Abs("y", Var("y")))).toBe(true);
    expect(alphaEq(T, Abs("a", Abs("b", Var("a"))))).toBe(true);
  });

  it("different free variables are not equal", () => {
    expect(alphaEq(Var("x"), Var("y"))).toBe(false);
  });

  it("different structures are not equal", () => {
    expect(alphaEq(I, K)).toBe(false);
    expect(alphaEq(Var("x"), App(Var("x"), Var("x")))).toBe(false);
  });

  it("free vs bound variables are distinguished", () => {
    // \x := y  is NOT alpha-eq to  \x := x  (y is free, x is bound)
    expect(alphaEq(Abs("x", Var("y")), Abs("x", Var("x")))).toBe(false);
  });
});

// ── normalize ─────────────────────────────────────────────────────────────────

describe("normalize", () => {
  it("I x reduces to x", () => {
    const r = normalize(App(I, Var("x")));
    expect(r.kind).toBe("normalForm");
    expect(r.term).toEqual(Var("x"));
  });

  it("K a b reduces to a", () => {
    const r = normalize(App(App(K, Var("a")), Var("b")));
    expect(r.kind).toBe("normalForm");
    expect(alphaEq(r.term, Var("a"))).toBe(true);
  });

  it("true (and false false) reduces to false", () => {
    // T F F = (\x y := x) F F  → F
    const r = normalize(App(App(T, F), F));
    expect(r.kind).toBe("normalForm");
    expect(alphaEq(r.term, F)).toBe(true);
  });

  it("false (and true false) reduces to false", () => {
    const r = normalize(App(App(F, T), F));
    expect(r.kind).toBe("normalForm");
    expect(alphaEq(r.term, F)).toBe(true);
  });

  it("succ zero normalizes to one", () => {
    // succ n f x = f (n f x)
    const succ = Abs("n", Abs("f", Abs("x", App(Var("f"), App(App(Var("n"), Var("f")), Var("x"))))));
    const r = normalize(App(succ, zero));
    expect(r.kind).toBe("normalForm");
    expect(alphaEq(r.term, one)).toBe(true);
  });

  it("plus one one normalizes to two", () => {
    // plus m n f x = m f (n f x)
    const plus = Abs("m", Abs("n", Abs("f", Abs("x",
      App(App(Var("m"), Var("f")), App(App(Var("n"), Var("f")), Var("x")))))));
    const r = normalize(App(App(plus, one), one));
    expect(r.kind).toBe("normalForm");
    expect(alphaEq(r.term, two)).toBe(true);
  });

  it("hits step limit on diverging term", () => {
    // omega = (\x := x x) (\x := x x)  — diverges
    const delta = Abs("x", App(Var("x"), Var("x")));
    const omega = App(delta, delta);
    const r = normalize(omega, { maxSteps: 100 });
    expect(r.kind).toBe("stepLimit");
  });

  it("allowEta reduces eta-redex during normalize", () => {
    // λx. f x  should reduce to f when allowEta is true
    const term = Abs("x", App(Var("f"), Var("x")));
    const r = normalize(term, { allowEta: true });
    expect(r.kind).toBe("normalForm");
    expect(r.term).toEqual(Var("f"));
  });

  it("without allowEta, eta-redex is left as normal form", () => {
    const term = Abs("x", App(Var("f"), Var("x")));
    const r = normalize(term);
    expect(r.kind).toBe("normalForm");
    expect(r.term).toEqual(term);
  });
});
