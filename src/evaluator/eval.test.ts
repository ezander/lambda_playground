import { describe, it, expect } from "vitest";
import { Var, Abs, App, Subst, Term } from "../parser/ast";
import { substitute, step, etaStep, freeVars, alphaEq, normalize, canonicalForm, termSize, buildNormDefs, findMatch } from "./eval";

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

  it("Subst is alpha-eq to its App(Abs,...) equivalent", () => {
    // x[x:=a]  is semantically App(Abs("x", Var("x")), Var("a"))
    const subst  = Subst(Var("x"), "x", Var("a"));
    const appAbs = App(Abs("x", Var("x")), Var("a"));
    expect(alphaEq(subst, appAbs)).toBe(true);
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

  it("hits size limit on a growing term", () => {
    // (λx. x x x)(λx. x x x) — after one beta step the term has 20 nodes, > 15
    const tri = Abs("x", App(App(Var("x"), Var("x")), Var("x")));
    const r = normalize(App(tri, tri), { maxSize: 15 });
    expect(r.kind).toBe("sizeLimit");
    if (r.kind === "sizeLimit") expect(r.size).toBeGreaterThan(15);
  });

  it("returns normalForm when term reaches normal form exactly at the step limit", () => {
    // App(App(I, I), Var("a")) takes exactly 2 steps: I I a → I a → a
    const r = normalize(App(App(I, I), Var("a")), { maxSteps: 2 });
    expect(r.kind).toBe("normalForm");
    expect(r.term).toEqual(Var("a"));
    expect(r.steps).toBe(2);
  });
});

// ── termSize ──────────────────────────────────────────────────────────────────

describe("termSize", () => {
  it("Var counts as 1", () => {
    expect(termSize(Var("x"))).toBe(1);
  });

  it("Abs counts as 1 + body size", () => {
    // λx. x = Abs("x", Var("x")) → 1 + 1 = 2
    expect(termSize(Abs("x", Var("x")))).toBe(2);
  });

  it("App counts as 1 + func size + arg size", () => {
    // f x = App(Var("f"), Var("x")) → 1 + 1 + 1 = 3
    expect(termSize(App(Var("f"), Var("x")))).toBe(3);
  });

  it("Subst counts as 1 + body size + arg size", () => {
    // x[p:=a] = Subst(Var("x"), "p", Var("a")) → 1 + 1 + 1 = 3
    expect(termSize(Subst(Var("x"), "p", Var("a")))).toBe(3);
  });

  it("I combinator has size 2", () => {
    expect(termSize(I)).toBe(2);
  });

  it("K combinator has size 3", () => {
    // λx. λy. x → 1 + (1 + 1) = 3
    expect(termSize(K)).toBe(3);
  });

  it("nested App has correct size", () => {
    // f x y = App(App(Var("f"), Var("x")), Var("y")) → 1 + (1+1+1) + 1 = 5
    expect(termSize(App(App(Var("f"), Var("x")), Var("y")))).toBe(5);
  });
});

// ── buildNormDefs ─────────────────────────────────────────────────────────────

describe("buildNormDefs", () => {
  it("builds a map from names to canonical forms of their normal forms", () => {
    const defs = new Map([["I", I], ["K", K]]);
    const nd = buildNormDefs(defs);
    expect(nd.has("I")).toBe(true);
    expect(nd.has("K")).toBe(true);
    expect(nd.get("I")).toBe(canonicalForm(I));
    expect(nd.get("K")).toBe(canonicalForm(K));
  });

  it("alpha-equivalent definitions produce the same canonical form", () => {
    const defs = new Map([
      ["I1", Abs("x", Var("x"))],
      ["I2", Abs("y", Var("y"))],
    ]);
    const nd = buildNormDefs(defs);
    expect(nd.get("I1")).toBe(nd.get("I2"));
  });

  it("normalizes redex defs before storing", () => {
    // (λx. x) a is not in normal form; buildNormDefs should store canonical(a)
    const defs = new Map([["r", App(I, Var("a"))]]);
    const nd = buildNormDefs(defs);
    expect(nd.get("r")).toBe(canonicalForm(Var("a")));
  });
});

// ── findMatch ─────────────────────────────────────────────────────────────────

describe("findMatch", () => {
  const defs = new Map<string, Term>([
    ["I",        I],
    ["K",        K],
    ["_private", Abs("x", Var("x"))],   // same normal form as I, but private
  ]);
  const nd = buildNormDefs(defs);

  it("finds a matching definition by name", () => {
    expect(findMatch(Abs("x", Var("x")), nd)).toBe("I");
  });

  it("returns undefined when no definition matches", () => {
    expect(findMatch(Var("z"), nd)).toBeUndefined();
    expect(findMatch(Abs("x", Abs("y", Abs("z", Var("x")))), nd)).toBeUndefined();
  });

  it("excludes _-prefixed (private) names from matches", () => {
    // I and _private have the same form; only I should appear
    const result = findMatch(Abs("x", Var("x")), nd);
    expect(result).toBe("I");
    expect(result).not.toContain("_private");
  });

  it("matches alpha-equivalent terms", () => {
    // λa. a  is alpha-eq to I = λx. x
    expect(findMatch(Abs("a", Var("a")), nd)).toBe("I");
  });

  it("returns multiple matches joined with ', '", () => {
    const defs2 = new Map<string, Term>([["I", I], ["id", Abs("y", Var("y"))]]);
    const nd2 = buildNormDefs(defs2);
    const result = findMatch(Abs("z", Var("z")), nd2);
    expect(result).toBeDefined();
    expect(result).toContain("I");
    expect(result).toContain("id");
    expect(result).toContain(", ");
  });
});

// ── Strict (call-by-value) reduction ──────────────────────────────────────────

describe("strict binders", () => {
  it("strict abstraction reduces arg to NF before substituting", () => {
    // (λβx. x) ((λy. y) a)  — strict: arg reduces first
    const term = App(Abs("x", Var("x"), true), App(I, Var("a")));
    // Step 1: arg reduces (λy. y) a → a, lambda body unchanged
    const s1 = step(term)!;
    expect(s1).toEqual(App(Abs("x", Var("x"), true), Var("a")));
    // Step 2: now perform beta
    expect(step(s1)).toEqual(Var("a"));
  });

  it("lazy abstraction substitutes immediately (control)", () => {
    // (λx. x) ((λy. y) a)  — lazy: substitute first, no pre-reduction
    const term = App(I, App(I, Var("a")));
    // Step 1: outermost beta — substitute (λy. y) a for x in body x
    expect(step(term)).toEqual(App(I, Var("a")));
  });

  it("strict normalize: arg reduced once, then duplicated as NF", () => {
    // (λβx. x x) ((λy. y) a) — should reach (a a) and stop
    const term = App(Abs("x", App(Var("x"), Var("x")), true), App(I, Var("a")));
    const r = normalize(term);
    expect(r.kind).toBe("normalForm");
    if (r.kind === "normalForm") expect(r.term).toEqual(App(Var("a"), Var("a")));
  });

  it("strict and lazy produce same NF when both terminate", () => {
    // (λβx. x x x) ((λy. y) a)  vs  (λx. x x x) ((λy. y) a)
    const arg = App(I, Var("a"));
    const strictT = App(Abs("x", App(App(Var("x"), Var("x")), Var("x")), true), arg);
    const lazyT   = App(Abs("x", App(App(Var("x"), Var("x")), Var("x")), false), arg);
    const rs = normalize(strictT);
    const rl = normalize(lazyT);
    expect(rs.kind).toBe("normalForm");
    expect(rl.kind).toBe("normalForm");
    if (rs.kind === "normalForm" && rl.kind === "normalForm")
      expect(alphaEq(rs.term, rl.term)).toBe(true);
  });

  it("alphaEq ignores strict flag (operational, not denotational)", () => {
    expect(alphaEq(Abs("x", Var("x"), true), Abs("y", Var("y"), false))).toBe(true);
  });

  it("substitute preserves strict flag", () => {
    // (λβy. y x)[x := a]  →  λβy. y a, strict still set
    const term = Abs("y", App(Var("y"), Var("x")), true);
    const result = substitute(term, "x", Var("a"));
    expect(result.kind).toBe("Abs");
    if (result.kind === "Abs") expect(result.strict).toBe(true);
  });

  it("eta does not reduce strict binders", () => {
    // λβx. f x  is NOT eta-reducible (would change strictness behavior)
    expect(etaStep(Abs("x", App(Var("f"), Var("x")), true))).toBeNull();
    // λx. f x  (lazy) IS eta-reducible
    expect(etaStep(Abs("x", App(Var("f"), Var("x")), false))).toEqual(Var("f"));
  });

  it("strict cuts step count when arg is duplicated", () => {
    // body uses x three times; arg takes 3 reductions to reach a normal form.
    //   lazy:   substitute unreduced arg → 3 copies each reduce independently
    //   strict: reduce arg once (3 steps) then substitute the NF
    const arg  = App(I, App(I, App(I, Var("a"))));   // I (I (I a))  — 3 steps to "a"
    const body = App(App(Var("x"), Var("x")), Var("x")); // x x x

    const lazyT   = App(Abs("x", body, false), arg);
    const strictT = App(Abs("x", body, true),  arg);

    const rl = normalize(lazyT);
    const rs = normalize(strictT);

    expect(rl.kind).toBe("normalForm");
    expect(rs.kind).toBe("normalForm");
    if (rl.kind !== "normalForm" || rs.kind !== "normalForm") return;

    // Both reach the same NF: a a a
    expect(alphaEq(rl.term, rs.term)).toBe(true);
    expect(rs.term).toEqual(App(App(Var("a"), Var("a")), Var("a")));

    // Strict should be meaningfully cheaper. Ratio between 2× and 3× covers
    // the expected lazy-vs-strict gap on a 3-use body with a 3-step arg.
    const ratio = rl.steps / rs.steps;
    expect(ratio).toBeGreaterThanOrEqual(2);
    expect(ratio).toBeLessThanOrEqual(3);
  });
});
