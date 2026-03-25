import { Term } from "./ast";
import { parse } from "./parser";

// Pretty-print a Term back to surface syntax.
// Multi-param lambdas are re-compressed: \x := \y := body  →  \x y := body
export function prettyPrint(term: Term): string {
  return pp(term, "top");
}

type Context = "top" | "appFunc" | "appArg";

function pp(term: Term, ctx: Context): string {
  switch (term.kind) {
    case "Var":
      return term.name;

    case "Abs": {
      // Collect consecutive params for pretty compression
      const params: string[] = [];
      let body: Term = term;
      while (body.kind === "Abs") {
        params.push(body.param);
        body = body.body;
      }
      const s = `\\${params.join(" ")} := ${pp(body, "top")}`;
      return `(${s})`;
    }

    case "App": {
      const func = pp(term.func, "appFunc");
      const arg  = pp(term.arg,  "appArg");
      return `${func} ${arg}`;
    }
  }
}

// Assert that pretty-printing and re-parsing yields the same AST.
// Throws if the round-trip fails — surfaces as a bug in the pretty-printer.
export function assertRoundTrip(term: Term): void {
  const printed = prettyPrint(term);
  const result = parse(printed);
  if (!result.ok) {
    throw new Error(`round-trip parse failed on "${printed}": ${result.errors.join(", ")}`);
  }
  if (JSON.stringify(result.term) !== JSON.stringify(term)) {
    throw new Error(`round-trip mismatch:\n  original: ${JSON.stringify(term)}\n  reparsed: ${JSON.stringify(result.term)}`);
  }
}

// Indented AST dump
export function dumpAST(term: Term, indent = 0): string {
  const pad = "  ".repeat(indent);
  switch (term.kind) {
    case "Var":
      return `${pad}Var(${term.name})`;
    case "Abs":
      return `${pad}Abs(${term.param})\n${dumpAST(term.body, indent + 1)}`;
    case "App":
      return `${pad}App\n${dumpAST(term.func, indent + 1)}\n${dumpAST(term.arg, indent + 1)}`;
  }
}
