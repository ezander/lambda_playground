// AST node types for the lambda dialect
// All nodes are fully normalized: Abs has exactly one parameter.

export type Var = {
  kind: "Var";
  name: string;
};

export type Abs = {
  kind: "Abs";
  param: string;   // exactly one — \x y := body desugars to Abs(x, Abs(y, body))
  body: Term;
};

export type App = {
  kind: "App";
  func: Term;
  arg: Term;
};

export type Term = Var | Abs | App;

// Constructors
export const Var = (name: string): Var => ({ kind: "Var", name });
export const Abs = (param: string, body: Term): Abs => ({ kind: "Abs", param, body });
export const App = (func: Term, arg: Term): App => ({ kind: "App", func, arg });
