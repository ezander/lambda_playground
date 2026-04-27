// AST node types for the untyped lambda dialect
// All nodes are fully normalized: Abs has exactly one parameter.

export type Pos = { from: number; to: number };

export type Var = {
  kind: "Var";
  name: string;
};

export type Abs = {
  kind: "Abs";
  param: string;   // exactly one — \x y := body desugars to Abs(x, Abs(y, body))
  body: Term;
  eager: boolean;  // true when bound by βx (call-by-value: arg reduced before substitution)
};

export type App = {
  kind: "App";
  func: Term;
  arg: Term;
};

// Pending substitution: body[param:=arg], produced during two-phase beta reduction.
// Semantically equivalent to App(Abs(param, body), arg).
export type Subst = {
  kind: "Subst";
  body: Term;
  param: string;
  arg: Term;
};

export type Term = Var | Abs | App | Subst;

// Constructors
export const Var = (name: string): Var => ({ kind: "Var", name });
export const Abs = (param: string, body: Term, eager: boolean = false): Abs => ({ kind: "Abs", param, body, eager });
export const App = (func: Term, arg: Term): App => ({ kind: "App", func, arg });
export const Subst = (body: Term, param: string, arg: Term): Subst => ({ kind: "Subst", body, param, arg });
