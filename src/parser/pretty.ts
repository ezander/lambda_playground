import { Term } from "./ast";
import { parse } from "./parser";

// Pretty-print a Term back to surface syntax.
// Multi-param lambdas are re-compressed: \x := \y := body  →  \x y := body
export function prettyPrint(term: Term): string {
  return pp(term, "top");
}

// Safe if it starts with alphanumeric/Greek or an operator char, then any mix of both.
// Excludes λ (\u03BB) and π (\u03C0) since those are keyword tokens.
const SAFE_IDENT = /^([a-zA-Z0-9_\u0370-\u03BA\u03BC-\u03BF\u03C1-\u03FF]|[+\-*\/^~&|<>!?=])[a-zA-Z0-9_\u0370-\u03BA\u03BC-\u03BF\u03C1-\u03FF+\-*\/^~&|<>!?=]*$/;

function safeName(name: string): string {
  return SAFE_IDENT.test(name) ? name : `\`${name}\``;
}

type Context = "top" | "appFunc" | "appArg";

function pp(term: Term, ctx: Context): string {
  switch (term.kind) {
    case "Var":
      return safeName(term.name);

    case "Abs": {
      // Collect consecutive params for pretty compression
      const params: string[] = [];
      let body: Term = term;
      while (body.kind === "Abs") {
        params.push(safeName(body.param));
        body = body.body;
      }
      const s = `λ${params.join(" ")}. ${pp(body, "top")}`;
      return (ctx === "top") ? s : `(${s})`;
    }

    case "App": {
      const func = pp(term.func, "appFunc");
      const arg  = pp(term.arg,  "appArg");
      const s = `${func} ${arg}`;
      // Application is left-associative, so App in func position never needs
      // parens: (f a) b == f a b. Only in arg position parens are required.
      return (ctx === "appArg") ? `(${s})` : s;
    }

    case "Subst": {
      // body[param:=arg] — body goes in primary position (parens for App/Abs)
      const bodyStr = pp(term.body, "appArg");
      return `${bodyStr}[${safeName(term.param)}:=${pp(term.arg, "top")}]`;
    }
  }
}

// Assert that pretty-printing and re-parsing yields the same AST.
// Throws if the round-trip fails — surfaces as a bug in the pretty-printer.
export function assertRoundTrip(term: Term): void {
  const printed = prettyPrint(term);
  const result = parse(printed);
  if (!result.ok) {
    throw new Error(`round-trip parse failed on "${printed}": ${result.errors.map(e => e.message).join(", ")}`);
  }
  if (JSON.stringify(result.term) !== JSON.stringify(term)) {
    throw new Error(`round-trip mismatch:\n  original: ${JSON.stringify(term)}\n  reparsed: ${JSON.stringify(result.term)}`);
  }
}

