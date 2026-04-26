import { Term, Var, Abs, App, Subst } from "../parser/ast";

// ── Alpha equivalence ─────────────────────────────────────────────────────────
// Two terms are alpha-equivalent if they differ only in the names of bound variables.
// Free variables must match exactly.

function canonical(t: Term, bound: Map<string, number>, depth: number): string {
  switch (t.kind) {
    case "Var":
      return bound.has(t.name) ? `#${bound.get(t.name)}` : t.name;
    case "App":
      return `@(${canonical(t.func, bound, depth)},${canonical(t.arg, bound, depth)})`;
    case "Abs": {
      const nb = new Map(bound);
      nb.set(t.param, depth);
      return `λ(${canonical(t.body, nb, depth + 1)})`;
    }
    case "Subst": {
      // Semantically equivalent to App(Abs(param, body), arg)
      const nb = new Map(bound);
      nb.set(t.param, depth);
      return `@(λ(${canonical(t.body, nb, depth + 1)}),${canonical(t.arg, bound, depth)})`;
    }
  }
}

export function canonicalForm(t: Term): string {
  return canonical(t, new Map(), 0);
}

export function alphaEq(t1: Term, t2: Term): boolean {
  return canonicalForm(t1) === canonicalForm(t2);
}

// ── Free variables ────────────────────────────────────────────────────────────

export function freeVars(term: Term): Set<string> {
  switch (term.kind) {
    case "Var":
      return new Set([term.name]);
    case "Abs": {
      const fv = freeVars(term.body);
      fv.delete(term.param);
      return fv;
    }
    case "App":
      return new Set([...freeVars(term.func), ...freeVars(term.arg)]);
    case "Subst": {
      // Same as App(Abs(param, body), arg)
      const fv = freeVars(term.body);
      fv.delete(term.param);
      return new Set([...fv, ...freeVars(term.arg)]);
    }
  }
}

// ── Fresh name generation ─────────────────────────────────────────────────────

let counter = 0;

export function resetCounter() {
  counter = 0;
}

function freshName(base: string, avoid: Set<string>): string {
  let candidate = base;
  while (avoid.has(candidate)) {
    candidate = `${base}${++counter}`;
  }
  return candidate;
}

// ── Substitution: term[x := replacement] ─────────────────────────────────────
// Capture-avoiding substitution.

export function substitute(term: Term, x: string, replacement: Term): Term {
  switch (term.kind) {
    case "Var":
      return term.name === x ? replacement : term;

    case "App":
      return App(
        substitute(term.func, x, replacement),
        substitute(term.arg,  x, replacement)
      );

    case "Abs": {
      // Bound variable is the same as what we're substituting — stop
      if (term.param === x) return term;

      const fvRepl = freeVars(replacement);

      // No capture risk — substitute freely
      if (!fvRepl.has(term.param)) {
        return Abs(term.param, substitute(term.body, x, replacement), term.strict);
      }

      // Capture would occur — alpha-rename the bound variable first
      const avoid = new Set([...fvRepl, ...freeVars(term.body), x]);
      const fresh = freshName(term.param, avoid);
      const renamedBody = substitute(term.body, term.param, Var(fresh));
      return Abs(fresh, substitute(renamedBody, x, replacement), term.strict);
    }

    case "Subst": {
      // Subst(body, param, arg)[x := repl]
      // param acts as a binder for body (like Abs)
      const newArg = substitute(term.arg, x, replacement);
      if (term.param === x) {
        // param shadows x in body — only substitute in arg
        return Subst(term.body, term.param, newArg);
      }
      const fvRepl = freeVars(replacement);
      if (!fvRepl.has(term.param)) {
        return Subst(substitute(term.body, x, replacement), term.param, newArg);
      }
      // Capture-avoiding: rename param in body
      const avoid = new Set([...fvRepl, ...freeVars(term.body), x]);
      const fresh = freshName(term.param, avoid);
      const renamedBody = substitute(term.body, term.param, Var(fresh));
      return Subst(substitute(renamedBody, x, replacement), fresh, newArg);
    }
  }
}

// ── Single normal-order step ──────────────────────────────────────────────────
// Returns the reduced term, or null if the term is already in normal form.
//
// Normal order: leftmost outermost redex first.
//   1. If the term is a redex (App(Abs, arg)), beta-reduce it.
//   2. Otherwise recurse into func first, then arg, then body of Abs.

// showSubst: when true, App(Abs, arg) first produces a Subst node (phase 1),
// and a subsequent step on that Subst node performs the actual substitution (phase 2).
export function step(term: Term, showSubst = false): Term | null {
  switch (term.kind) {
    case "Var":
      return null;

    case "Subst":
      // Phase 2: perform the pending substitution
      return substitute(term.body, term.param, term.arg);

    case "App": {
      // Is this a redex?
      if (term.func.kind === "Abs") {
        // Strict (call-by-value): reduce arg to normal form before substituting.
        // Each visible step shows one reduction inside the arg; only when arg is
        // irreducible do we fall through to the actual beta.
        if (term.func.strict) {
          const arg2 = step(term.arg, showSubst);
          if (arg2 !== null) return App(term.func, arg2);
        }
        if (showSubst) {
          // Phase 1: show substitution before performing it
          return Subst(term.func.body, term.func.param, term.arg);
        }
        // Beta reduction: (\x := body) arg  →  body[x := arg]
        return substitute(term.func.body, term.func.param, term.arg);
      }
      // Try to reduce func first (outermost-leftmost)
      const func2 = step(term.func, showSubst);
      if (func2 !== null) return App(func2, term.arg);
      // Then try arg
      const arg2 = step(term.arg, showSubst);
      if (arg2 !== null) return App(term.func, arg2);
      return null;
    }

    case "Abs": {
      // Reduce under the lambda (normal order goes under binders)
      const body2 = step(term.body, showSubst);
      if (body2 !== null) return Abs(term.param, body2, term.strict);
      return null;
    }
  }
}

// ── Single eta step ───────────────────────────────────────────────────────────
// Finds the leftmost-outermost eta-redex: λx. f x  where x ∉ fv(f).
// Returns the reduced term, or null if no eta-redex exists.

export function etaStep(term: Term): Term | null {
  switch (term.kind) {
    case "Var":
      return null;
    case "Abs": {
      // Check for eta-redex at this node. Strict abstractions are excluded:
      // λβx. f x forces evaluation of x, but f does not — eta would change semantics.
      if (
        !term.strict &&
        term.body.kind === "App" &&
        term.body.arg.kind === "Var" &&
        term.body.arg.name === term.param &&
        !freeVars(term.body.func).has(term.param)
      ) return term.body.func;
      // Otherwise recurse into body
      const b = etaStep(term.body);
      return b !== null ? Abs(term.param, b, term.strict) : null;
    }
    case "App": {
      const f = etaStep(term.func);
      if (f !== null) return App(f, term.arg);
      const a = etaStep(term.arg);
      return a !== null ? App(term.func, a) : null;
    }
    case "Subst": {
      const b = etaStep(term.body);
      if (b !== null) return Subst(b, term.param, term.arg);
      const a = etaStep(term.arg);
      return a !== null ? Subst(term.body, term.param, a) : null;
    }
  }
}

// ── Definition matching helpers ───────────────────────────────────────────────

// Cached canonical form of a term's normal form, keyed by Term identity.
// Only normalForm results are cached — step/size-limited results depend on cfg.
const canonNormCache = new WeakMap<Term, string>();

export function canonicalNormalForm(term: Term, cfg: EvalConfig = {}): string {
  const cached = canonNormCache.get(term);
  if (cached !== undefined) return cached;
  const r = normalize(term, cfg);
  const canon = canonicalForm(r.term);
  if (r.kind === "normalForm") canonNormCache.set(term, canon);
  return canon;
}

export function buildNormDefs(defs: Map<string, Term>, cfg: EvalConfig = {}): Map<string, string> {
  const m = new Map<string, string>();
  for (const [name, term] of defs)
    m.set(name, canonicalNormalForm(term, cfg));
  return m;
}

export function findMatch(term: Term, nd: Map<string, string>): string | undefined {
  const key = canonicalForm(term);
  const matches: string[] = [];
  for (const [name, canon] of nd)
    if (!name.startsWith("_") && key === canon) matches.push(name);
  return matches.length > 0 ? matches.join(", ") : undefined;
}

// ── Run to normal form ────────────────────────────────────────────────────────

export type RunResult =
  | { kind: "normalForm"; term: Term; steps: number }
  | { kind: "stepLimit"; term: Term; steps: number }
  | { kind: "sizeLimit"; term: Term; steps: number; size: number };

const DEFAULT_STEP_LIMIT = 1000;
const DEFAULT_SIZE_LIMIT = 3_000;

export type EvalConfig = { maxSteps?: number; maxSize?: number; allowEta?: boolean };

export function termSize(term: Term): number {
  switch (term.kind) {
    case "Var":   return 1;
    case "Abs":   return 1 + termSize(term.body);
    case "App":   return 1 + termSize(term.func) + termSize(term.arg);
    case "Subst": return 1 + termSize(term.body) + termSize(term.arg);
  }
}

export function normalize(
  term: Term,
  config: EvalConfig = {}
): RunResult {
  const stepLimit = config.maxSteps ?? DEFAULT_STEP_LIMIT;
  const sizeLimit = config.maxSize  ?? DEFAULT_SIZE_LIMIT;
  resetCounter();
  let current = term;
  let steps = 0;
  while (steps < stepLimit) {
    const next = step(current) ?? (config.allowEta ? etaStep(current) : null);
    if (next === null) return { kind: "normalForm", term: current, steps };
    current = next;
    steps++;
    const sz = termSize(current);
    if (sz > sizeLimit) return { kind: "sizeLimit", term: current, steps, size: sz };
  }
  // The last step may have produced a normal form — check before declaring step limit
  const finalNext = step(current) ?? (config.allowEta ? etaStep(current) : null);
  if (finalNext === null) return { kind: "normalForm", term: current, steps };
  return { kind: "stepLimit", term: current, steps };
}
