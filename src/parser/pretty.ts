import { Term } from "./ast";

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
      // return ctx === "appArg" ? `(${s})` : s;
      return `(${s})`;
    }

    case "App": {
      const func = pp(term.func, "appFunc");
      const arg  = pp(term.arg,  "appArg");
      return `${func} ${arg}`;
    }
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
