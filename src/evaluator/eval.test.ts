import { describe, it, expect } from "vitest";
import { Var, Abs, App, Subst } from "../parser/ast";
import { substitute, step, etaStep, alphaEq, normalize } from "./eval";

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
    const r = normalize(omega, 100);
    expect(r.kind).toBe("stepLimit");
  });
});
