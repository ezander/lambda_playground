// AST node types for the untyped lambda dialect
// All nodes are fully normalized: Abs has exactly one parameter.

export type Pos = { from: number; to: number };

// Each node carries its own subtree size (count of AST nodes). Computed at
// construction by the factory functions below, so size is O(1) to read at
// every call site (eval loop, history bookkeeping, render decisions).

export type Var = {
  kind: "Var";
  name: string;
  size: number;
};

export type Abs = {
  kind: "Abs";
  param: string;   // exactly one — \x y := body desugars to Abs(x, Abs(y, body))
  body: Term;
  eager: boolean;  // true when bound by βx (call-by-value: arg reduced before substitution)
  size: number;
};

export type App = {
  kind: "App";
  func: Term;
  arg: Term;
  size: number;
};

// Pending substitution: body[param:=arg], produced during two-phase beta reduction.
// Semantically equivalent to App(Abs(param, body), arg).
export type Subst = {
  kind: "Subst";
  body: Term;
  param: string;
  arg: Term;
  size: number;
};

export type Term = Var | Abs | App | Subst;

// Constructors
export const Var = (name: string): Var => ({ kind: "Var", name, size: 1 });
export const Abs = (param: string, body: Term, eager: boolean = false): Abs => ({ kind: "Abs", param, body, eager, size: 1 + body.size });
export const App = (func: Term, arg: Term): App => ({ kind: "App", func, arg, size: 1 + func.size + arg.size });
export const Subst = (body: Term, param: string, arg: Term): Subst => ({ kind: "Subst", body, param, arg, size: 1 + body.size + arg.size });
