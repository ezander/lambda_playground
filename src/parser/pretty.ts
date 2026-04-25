import { Term } from "./ast";
import { LambdaLexer, PlainIdent } from "./lexer";

// Pretty-print a Term back to surface syntax.
// Multi-param lambdas are re-compressed: \x := \y := body  →  \x y := body
export function prettyPrint(term: Term): string {
  return pp(term, "top");
}

// A name needs backticks iff it does not lex as a single PlainIdent token.
function safeName(name: string): string {
  const { tokens, errors } = LambdaLexer.tokenize(name);
  const isPlain = errors.length === 0 && tokens.length === 1 && tokens[0].tokenType === PlainIdent && tokens[0].image === name;
  return isPlain ? name : `\`${name}\``;
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

