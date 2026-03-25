import { Term, Var, Abs, App } from "../parser/ast";

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
  }
}

export function alphaEq(t1: Term, t2: Term): boolean {
  return canonical(t1, new Map(), 0) === canonical(t2, new Map(), 0);
}

// ── Free variables ────────────────────────────────────────────────────────────

export function freeVars(term: Term): Set<string> {
  switch (term.kind) {
    case "Var":
      return new Set([term.name]);
    case "Abs":
      const fv = freeVars(term.body);
      fv.delete(term.param);
      return fv;
    case "App":
      return new Set([...freeVars(term.func), ...freeVars(term.arg)]);
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

    case "Abs":
      // Bound variable is the same as what we're substituting — stop
      if (term.param === x) return term;

      const fvRepl = freeVars(replacement);

      // No capture risk — substitute freely
      if (!fvRepl.has(term.param)) {
        return Abs(term.param, substitute(term.body, x, replacement));
      }

      // Capture would occur — alpha-rename the bound variable first
      const avoid = new Set([...fvRepl, ...freeVars(term.body), x]);
      const fresh = freshName(term.param, avoid);
      const renamedBody = substitute(term.body, term.param, Var(fresh));
      return Abs(fresh, substitute(renamedBody, x, replacement));
  }
}

// ── Single normal-order step ──────────────────────────────────────────────────
// Returns the reduced term, or null if the term is already in normal form.
//
// Normal order: leftmost outermost redex first.
//   1. If the term is a redex (App(Abs, arg)), beta-reduce it.
//   2. Otherwise recurse into func first, then arg, then body of Abs.

export function step(term: Term): Term | null {
  switch (term.kind) {
    case "Var":
      return null;

    case "App": {
      // Is this a redex?
      if (term.func.kind === "Abs") {
        // Beta reduction: (\x := body) arg  →  body[x := arg]
        return substitute(term.func.body, term.func.param, term.arg);
      }
      // Try to reduce func first (outermost-leftmost)
      const func2 = step(term.func);
      if (func2 !== null) return App(func2, term.arg);
      // Then try arg
      const arg2 = step(term.arg);
      if (arg2 !== null) return App(term.func, arg2);
      return null;
    }

    case "Abs": {
      // Reduce under the lambda (normal order goes under binders)
      const body2 = step(term.body);
      if (body2 !== null) return Abs(term.param, body2);
      return null;
    }
  }
}

// ── Run to normal form ────────────────────────────────────────────────────────

export type RunResult =
  | { kind: "normalForm"; term: Term; steps: number }
  | { kind: "stepLimit"; term: Term; steps: number };

const DEFAULT_STEP_LIMIT = 1000;

export function normalize(
  term: Term,
  limit = DEFAULT_STEP_LIMIT
): RunResult {
  resetCounter();
  let current = term;
  let steps = 0;
  while (steps < limit) {
    const next = step(current);
    if (next === null) return { kind: "normalForm", term: current, steps };
    current = next;
    steps++;
  }
  return { kind: "stepLimit", term: current, steps };
}
