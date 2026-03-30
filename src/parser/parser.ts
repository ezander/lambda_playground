import { CstParser, CstNode, IToken } from "chevrotain";
import {
  allTokens,
  LambdaLexer,
  Backslash,
  DefAssign,
  Assign,
  LParen,
  RParen,
  LBracket,
  RBracket,
  Identifier,
} from "./lexer";
import { Term, Var, Abs, App } from "./ast";
import { normalize, alphaEq } from "../evaluator/eval";

// ── 1. CST Parser ─────────────────────────────────────────────────────────────
//
//   term        ::= application
//   application ::= atom+                       (left-associative fold)
//   atom        ::= primary ('[' Identifier ':=' term ']')*
//   primary     ::= Identifier | '(' term ')' | function
//   function    ::= '\' Identifier+ (':='|'.') term

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
    this.SUBRULE(this.primary);
    this.MANY(() => this.SUBRULE(this.subst));
  });

  primary = this.RULE("primary", () => {
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

  subst = this.RULE("subst", () => {
    this.CONSUME(LBracket);
    this.CONSUME(Identifier);
    this.CONSUME(Assign);
    this.SUBRULE(this.term);
    this.CONSUME(RBracket);
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
    let base: Term = this.visit(ctx.primary);
    for (const s of (ctx.subst ?? [])) {
      const { param, arg } = this.visit(s) as { param: string; arg: Term };
      base = App(Abs(param, base), arg);
    }
    return base;
  }

  primary(ctx: any): Term {
    if (ctx.func)       return this.visit(ctx.func);
    if (ctx.Identifier) return Var((ctx.Identifier[0] as IToken).image);
    return this.visit(ctx.term);
  }

  subst(ctx: any): { param: string; arg: Term } {
    return {
      param: (ctx.Identifier[0] as IToken).image,
      arg:   this.visit(ctx.term),
    };
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

export type LambdaError = { message: string; offset?: number; kind?: "error" | "warning" };

export type ParseResult =
  | { ok: true;  term: Term }
  | { ok: false; errors: LambdaError[] };

export function parse(input: string): ParseResult {
  const { tokens, errors: lexErrors } = LambdaLexer.tokenize(input);

  if (lexErrors.length > 0) {
    return {
      ok: false,
      errors: lexErrors.map((e) => ({ message: `Lex error: ${e.message}`, offset: e.offset })),
    };
  }

  parser.input = tokens;
  const cst = parser.term();

  if (parser.errors.length > 0) {
    return {
      ok: false,
      errors: parser.errors.map((e) => ({
        message: e.token.image
          ? `Parse error at '${e.token.image}': ${e.message}`
          : `Parse error: ${e.message}`,
        offset: e.token.image ? e.token.startOffset : undefined,
      })),
    };
  }

  const term = astBuilder.visit(cst);
  return { ok: true, term };
}

// ── Definition expansion ───────────────────────────────────────────────────────
// Replace free occurrences of defined names with their terms.
// Lambda params shadow definitions.

export function expandDefs(term: Term, defs: Map<string, Term>): Term {
  switch (term.kind) {
    case "Var":
      return defs.has(term.name) ? defs.get(term.name)! : term;
    case "App":
      return App(expandDefs(term.func, defs), expandDefs(term.arg, defs));
    case "Abs": {
      if (!defs.has(term.param)) return Abs(term.param, expandDefs(term.body, defs));
      const inner = new Map(defs);
      inner.delete(term.param);
      return Abs(term.param, expandDefs(term.body, inner));
    }
    case "Subst":
      return term; // Subst nodes only appear during evaluation, not in parsed programs
  }
}

// ── Program parser ─────────────────────────────────────────────────────────────
// A program is a sequence of newline-separated lines, each either:
//   definition:  name param* ::= term
//   expression:  term
// Definitions are expanded eagerly into subsequent lines.
// The last expression is the term to evaluate.

export type ProgramResult = {
  ok: boolean;
  errors: LambdaError[];
  defs: Map<string, Term>;
  expr: Term | null;    // last expression, with defs expanded
  rawExpr: Term | null; // last expression, before expansion
};

export function parseProgram(input: string): ProgramResult {
  const defs = new Map<string, Term>();
  let expr: Term | null = null;
  let rawExpr: Term | null = null;
  const errors: LambdaError[] = [];
  let lineOffset = 0;

  for (const rawLine of input.split("\n")) {
    const { tokens, errors: lexErrors } = LambdaLexer.tokenize(rawLine);
    if (lexErrors.length > 0) {
      errors.push(...lexErrors.map((e) => ({
        message: `Lex error: ${e.message}`,
        offset: lineOffset + e.offset,
      })));
      lineOffset += rawLine.length + 1;
      continue;
    }
    if (tokens.length === 0) { lineOffset += rawLine.length + 1; continue; }

    const defIdx = tokens.findIndex((t) => t.tokenType === DefAssign);

    if (defIdx >= 0) {
      // ── Definition ────────────────────────────────────────────────────────
      const lhs = tokens.slice(0, defIdx);
      if (lhs.length === 0 || lhs.some((t) => t.tokenType !== Identifier)) {
        errors.push({ message: `Definition left-hand side must be identifiers only`, offset: lineOffset });
        lineOffset += rawLine.length + 1;
        continue;
      }
      const [nameToken, ...paramTokens] = lhs;
      const name   = nameToken.image;
      const params = paramTokens.map((t) => t.image);

      const rhsStart = tokens[defIdx].startOffset + 3;
      const rhs = rawLine.slice(rhsStart);
      const bodyResult = parse(rhs);
      if (!bodyResult.ok) {
        errors.push(...bodyResult.errors.map((e) => ({
          message: `In definition of '${name}': ${e.message}`,
          offset: e.offset !== undefined ? lineOffset + rhsStart + e.offset : lineOffset,
        })));
        lineOffset += rawLine.length + 1;
        continue;
      }

      // Expand known defs in body, excluding params (they shadow defs)
      const innerDefs = new Map(defs);
      for (const p of params) innerDefs.delete(p);
      let body = expandDefs(bodyResult.term, innerDefs);

      // Desugar: f x y ::= e  →  f ::= \x y := e
      if (params.length > 0)
        body = params.reduceRight((acc, p) => Abs(p, acc), body);

      if (defs.has(name)) {
        const oldNorm = normalize(defs.get(name)!).term;
        const newNorm = normalize(body).term;
        if (!alphaEq(oldNorm, newNorm))
          errors.push({ message: `Warning: '${name}' redefined with a different normal form`, offset: lineOffset, kind: "warning" });
      }
      defs.set(name, body);

    } else {
      // ── Expression ────────────────────────────────────────────────────────
      const result = parse(rawLine);
      if (!result.ok) {
        errors.push(...result.errors.map((e) => ({
          message: e.message,
          offset: e.offset !== undefined ? lineOffset + e.offset : undefined,
        })));
        lineOffset += rawLine.length + 1;
        continue;
      }
      rawExpr = result.term;
      expr    = expandDefs(result.term, defs);
    }

    lineOffset += rawLine.length + 1;
  }

  return { ok: errors.filter(e => e.kind !== "warning").length === 0, errors, defs, expr, rawExpr };
}
