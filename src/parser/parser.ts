import { CstParser, CstNode, IToken } from "chevrotain";
import {
  allTokens,
  LambdaLexer,
  Backslash,
  Assign,
  LParen,
  RParen,
  Identifier,
} from "./lexer";
import { Term, Var, Abs, App } from "./ast";

// ── 1. CST Parser ─────────────────────────────────────────────────────────────
//
//   term        ::= application
//   application ::= atom+            (left-associative fold)
//   atom        ::= Identifier
//                 | '(' term ')'
//                 | function
//   function    ::= '\' Identifier+ ':=' term

class LambdaParser extends CstParser {
  constructor() {
    super(allTokens);
    this.performSelfAnalysis();
  }

  term = this.RULE("term", () => {
    this.SUBRULE(this.application);
  });

  application = this.RULE("application", () => {
    this.AT_LEAST_ONE(() => {
      this.SUBRULE(this.atom);
    });
  });

  atom = this.RULE("atom", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.func) },
      { ALT: () => this.CONSUME(Identifier) },
      {
        ALT: () => {
          this.CONSUME(LParen);
          this.SUBRULE(this.term);
          this.CONSUME(RParen);
        },
      },
    ]);
  });

  func = this.RULE("func", () => {
    this.CONSUME(Backslash);
    this.AT_LEAST_ONE(() => {
      this.CONSUME(Identifier);
    });
    this.CONSUME(Assign);
    this.SUBRULE(this.term);
  });
}

export const parser = new LambdaParser();

// ── 2. CST → AST visitor ──────────────────────────────────────────────────────

const BaseCstVisitor = parser.getBaseCstVisitorConstructor();

class AstBuilder extends BaseCstVisitor {
  constructor() {
    super();
    this.validateVisitor();
  }

  term(ctx: any): Term {
    return this.visit(ctx.application);
  }

  application(ctx: any): Term {
    const atoms: Term[] = ctx.atom.map((a: CstNode) => this.visit(a));
    // fold left: [f, x, y] → App(App(f, x), y)
    return atoms.reduce((func, arg) => App(func, arg));
  }

  atom(ctx: any): Term {
    if (ctx.func)       return this.visit(ctx.func);
    if (ctx.Identifier) return Var((ctx.Identifier[0] as IToken).image);
    return this.visit(ctx.term);
  }

  func(ctx: any): Term {
    const params: string[] = ctx.Identifier.map((t: IToken) => t.image);
    const body: Term = this.visit(ctx.term);
    // Desugar \x y z := body  →  Abs(x, Abs(y, Abs(z, body)))
    return params.reduceRight((acc, param) => Abs(param, acc), body);
  }
}

const astBuilder = new AstBuilder();

// ── 3. Public parse function ───────────────────────────────────────────────────

export type ParseResult =
  | { ok: true;  term: Term }
  | { ok: false; errors: string[] };

export function parse(input: string): ParseResult {
  const { tokens, errors: lexErrors } = LambdaLexer.tokenize(input);

  if (lexErrors.length > 0) {
    return {
      ok: false,
      errors: lexErrors.map((e) => `Lex error: ${e.message}`),
    };
  }

  parser.input = tokens;
  const cst = parser.term();

  if (parser.errors.length > 0) {
    return {
      ok: false,
      errors: parser.errors.map(
        (e) => `Parse error at '${e.token.image}': ${e.message}`
      ),
    };
  }

  const term = astBuilder.visit(cst);
  return { ok: true, term };
}
