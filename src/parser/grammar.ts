import { CstParser, CstNode, IToken, tokenMatcher, EOF } from "chevrotain";
import {
  allTokens,
  LambdaLexer,
  Pragma,
  Lambda,
  Pi,
  Equiv,
  NEquiv,
  RedefAssign,
  DefAssign,
  Dot,
  LParen,
  RParen,
  LBracket,
  RBracket,
  LBrace,
  RBrace,
  Comma,
  NewLine,
  Semi,
  Identifier,
  BacktickIdent,
} from "./lexer";
import { Term, Var, Abs, App, Pos } from "./ast";
import { LambdaError, ParseResult, PositionMap } from "./types";

// Strip backtick quotes from a BacktickIdent token; leave plain identifiers unchanged.
export function tokenName(tok: IToken): string {
  return tok.tokenType === BacktickIdent ? tok.image.slice(1, -1) : tok.image;
}

function emptyPositionMap(): PositionMap {
  return { vars: new WeakMap(), params: new WeakMap() };
}

// ── 1. CST Parser ─────────────────────────────────────────────────────────────
//
// Program grammar:
//   program            ::= programItem*
//   programItem        ::= statementSep | statement statementSep | pragmaLine
//   statementSep       ::= NewLine | Semi
//   pragmaLine         ::= Pragma NewLine
//   statement          ::= printStmt | equivStmt | nequivStmt | definition | term
//   printStmt          ::= π comprehensionSpec? term
//   equivStmt          ::= ≡ comprehensionSpec? atom atom
//   nequivStmt         ::= ≢ comprehensionSpec? atom atom
//   definition         ::= identifier+ ':=' term         (gated: next := after identifier+)
//   comprehensionSpec  ::= '[' compBinding (',' compBinding)* ']'
//   compBinding ::= identLike ':=' '{' term (',' term)* '}'
//
// Term grammar:
//   term        ::= application
//   application ::= atom+                  (left-associative fold)
//   atom        ::= primary subst*
//   primary     ::= identLike | '(' term ')' | function
//   function    ::= '\' identLike+ '.' term
//   subst       ::= '[' identLike ':=' term ']'
//   identifier  ::= plainIdent | backtickIdent

class LambdaParser extends CstParser {
  constructor() {
    super(allTokens);
    this.performSelfAnalysis();
  }

  nextToken() { return this.LA(1); }

  // ── Program-level rules ────────────────────────────────────────────────────

  program = this.RULE("program", () => {
    this.MANY(() => this.SUBRULE(this.programItem));
  });

  programItem = this.RULE("programItem", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.statementSep) },
      {
        ALT: () => {
          this.SUBRULE(this.statement);
          this.SUBRULE2(this.statementSep);
        },
      },
      { ALT: () => this.SUBRULE(this.pragmaLine) },
    ]);
  });

  statementSep = this.RULE("statementSep", () => {
    this.OR([
      { ALT: () => this.CONSUME(NewLine) },
      { ALT: () => this.CONSUME(Semi) },
    ]);
  });

  statement = this.RULE("statement", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.printStmt) },
      { ALT: () => this.SUBRULE(this.equivStmt) },
      { ALT: () => this.SUBRULE(this.nequivStmt) },
      { GATE: () => this.isDefinition(), ALT: () => this.SUBRULE(this.definition) },
      { ALT: () => this.SUBRULE(this.term) },
    ]);
  });

  pragmaLine = this.RULE("pragmaLine", () => {
    this.CONSUME(Pragma);
    this.CONSUME(NewLine);
  });

  private isDefinition(): boolean {
    let i = 1;
    while (tokenMatcher(this.LA(i), Identifier)) i++;
    return tokenMatcher(this.LA(i), DefAssign) || tokenMatcher(this.LA(i), RedefAssign);
  }

  printStmt = this.RULE("printStmt", () => {
    this.CONSUME(Pi);
    this.OPTION(() => this.SUBRULE(this.comprehensionSpec));
    this.SUBRULE(this.term);
  });

  equivStmt = this.RULE("equivStmt", () => {
    this.CONSUME(Equiv);
    this.OPTION(() => this.SUBRULE(this.comprehensionSpec));
    this.SUBRULE(this.atom);
    this.SUBRULE2(this.atom);
  });

  nequivStmt = this.RULE("nequivStmt", () => {
    this.CONSUME(NEquiv);
    this.OPTION(() => this.SUBRULE(this.comprehensionSpec));
    this.SUBRULE(this.atom);
    this.SUBRULE2(this.atom);
  });

  definition = this.RULE("definition", () => {
    this.AT_LEAST_ONE(() => this.CONSUME(Identifier));
    this.OR([
      { ALT: () => this.CONSUME(DefAssign) },
      { ALT: () => this.CONSUME(RedefAssign) },
    ]);
    this.SUBRULE(this.term);
  });

  comprehensionSpec = this.RULE("comprehensionSpec", () => {
    this.CONSUME(LBracket);
    this.SUBRULE(this.compBinding);
    this.MANY(() => {
      this.CONSUME(Comma);
      this.SUBRULE2(this.compBinding);
    });
    this.CONSUME(RBracket);
  });

  compBinding = this.RULE("compBinding", () => {
    this.CONSUME(Identifier);
    this.CONSUME(DefAssign);
    this.CONSUME(LBrace);
    this.SUBRULE(this.term);
    this.MANY(() => {
      this.CONSUME(Comma);
      this.SUBRULE2(this.term);
    });
    this.CONSUME(RBrace);
  });

  // ── Term-level rules ───────────────────────────────────────────────────────

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
    this.CONSUME(DefAssign);
    this.SUBRULE(this.term);
    this.CONSUME(RBracket);
  });

  func = this.RULE("func", () => {
    this.CONSUME(Lambda);
    this.AT_LEAST_ONE(() => {
      this.CONSUME(Identifier);
    });
    this.CONSUME(Dot);
    this.SUBRULE(this.term);
  });
}

export const parser = new LambdaParser();

// ── 2. Internal raw statement types ──────────────────────────────────────────
// Used by the AST visitor and semantic analysis in semantics.ts.

export type RawBinding = { name: string; nameTok: IToken; termValues: Term[] };
export type RawEmpty   = { kind: "empty" };
export type RawPragma  = { kind: "pragma"; text: string; offset: number };
export type RawDef     = { kind: "def"; redef: boolean; name: string; nameTok: IToken; params: IToken[]; rawBody: Term; bodyTerm: Term; offset: number };
export type RawPrint   = { kind: "print"; term: Term; bindings: RawBinding[] | null; offset: number };
export type RawEquiv   = { kind: "equiv"; atom1: Term; atom2: Term; bindings: RawBinding[] | null; negated: boolean; offset: number };
export type RawExpr    = { kind: "expr"; term: Term; offset: number };
export type RawStmt    = RawEmpty | RawPragma | RawDef | RawPrint | RawEquiv | RawExpr;

// ── 3. CST → AST visitor ─────────────────────────────────────────────────────

const BaseCstVisitor = parser.getBaseCstVisitorConstructor();

export class AstBuilder extends BaseCstVisitor {
  offset   = 0;
  positions: PositionMap = emptyPositionMap();

  constructor() {
    super();
    this.validateVisitor();
  }

  reset(offset: number) {
    this.offset    = offset;
    this.positions = emptyPositionMap();
  }

  private pos(tok: IToken): Pos {
    return { from: this.offset + tok.startOffset, to: this.offset + (tok.endOffset ?? tok.startOffset) + 1 };
  }

  // ── Program-level visitors ─────────────────────────────────────────────────

  program(ctx: any): RawStmt[] {
    return (ctx.programItem ?? []).flatMap((item: CstNode) => {
      try {
        const stmt = this.visit(item) as RawStmt;
        return stmt ? [stmt] : [];
      } catch { return []; }
    });
  }

  programItem(ctx: any): RawStmt {
    if (ctx.pragmaLine) return this.visit(ctx.pragmaLine[0]) as RawStmt;
    if (ctx.statement)  return this.visit(ctx.statement[0])  as RawStmt;
    return { kind: "empty" };
  }

  statementSep(_ctx: any): void { /* separator only — no AST contribution */ }

  statement(ctx: any): RawStmt {
    if (ctx.printStmt)  return this.visit(ctx.printStmt[0])  as RawStmt;
    if (ctx.equivStmt)  return this.visit(ctx.equivStmt[0])  as RawStmt;
    if (ctx.nequivStmt) return this.visit(ctx.nequivStmt[0]) as RawStmt;
    if (ctx.definition) return this.visit(ctx.definition[0]) as RawStmt;
    if (ctx.term) { const term = this.visit(ctx.term[0]) as Term; return { kind: "expr", term, offset: 0 }; }
    return { kind: "empty" };
  }

  pragmaLine(ctx: any): RawPragma {
    const tok = ctx.Pragma[0] as IToken;
    return { kind: "pragma", text: tok.image.slice(2).trim(), offset: tok.startOffset };
  }

  printStmt(ctx: any): RawPrint | RawEmpty {
    if (!ctx.Pi || !ctx.term) return { kind: "empty" };
    const piTok = ctx.Pi[0] as IToken;
    const term = this.visit(ctx.term[0]) as Term;
    const bindings = ctx.comprehensionSpec ? this.visit(ctx.comprehensionSpec[0]) as RawBinding[] : null;
    return { kind: "print", term, bindings, offset: piTok.startOffset };
  }

  equivStmt(ctx: any): RawEquiv | RawEmpty {
    if (!ctx.Equiv || !ctx.atom || ctx.atom.length < 2) return { kind: "empty" };
    const equivTok = ctx.Equiv[0] as IToken;
    const atom1 = this.visit(ctx.atom[0]) as Term;
    const atom2 = this.visit(ctx.atom[1]) as Term;
    const bindings = ctx.comprehensionSpec ? this.visit(ctx.comprehensionSpec[0]) as RawBinding[] : null;
    return { kind: "equiv", atom1, atom2, bindings, negated: false, offset: equivTok.startOffset };
  }

  nequivStmt(ctx: any): RawEquiv | RawEmpty {
    if (!ctx.NEquiv || !ctx.atom || ctx.atom.length < 2) return { kind: "empty" };
    const tok = ctx.NEquiv[0] as IToken;
    const atom1 = this.visit(ctx.atom[0]) as Term;
    const atom2 = this.visit(ctx.atom[1]) as Term;
    const bindings = ctx.comprehensionSpec ? this.visit(ctx.comprehensionSpec[0]) as RawBinding[] : null;
    return { kind: "equiv", atom1, atom2, bindings, negated: true, offset: tok.startOffset };
  }

  definition(ctx: any): RawDef | RawEmpty {
    if (!ctx.Identifier || !ctx.term) return { kind: "empty" };
    const toks = ctx.Identifier as IToken[];
    const nameTok = toks[0];
    const params = toks.slice(1);
    const bodyTerm = this.visit(ctx.term[0]) as Term;
    let rawBody: Term = bodyTerm;
    for (let i = params.length - 1; i >= 0; i--) {
      const tok = params[i];
      const abs = Abs(tokenName(tok), rawBody);
      this.positions.params.set(abs, this.pos(tok));
      rawBody = abs;
    }
    const redef = !!ctx.RedefAssign;
    return { kind: "def", redef, name: tokenName(nameTok), nameTok, params, rawBody, bodyTerm, offset: nameTok.startOffset };
  }

  comprehensionSpec(ctx: any): RawBinding[] {
    return (ctx.compBinding ?? []).map((bn: CstNode) => this.visit(bn) as RawBinding);
  }

  compBinding(ctx: any): RawBinding {
    const nameTok = (ctx.Identifier as IToken[])[0];
    const termValues = (ctx.term ?? []).map((t: CstNode) => this.visit(t) as Term);
    return { name: tokenName(nameTok), nameTok, termValues };
  }

  // ── Term-level visitors ────────────────────────────────────────────────────

  term(ctx: any): Term {
    return this.visit(ctx.application);
  }

  application(ctx: any): Term {
    const atoms: Term[] = ctx.atom.map((a: CstNode) => this.visit(a));
    return atoms.reduce((func, arg) => App(func, arg));
  }

  atom(ctx: any): Term {
    let base: Term = this.visit(ctx.primary);
    for (const s of (ctx.subst ?? [])) {
      const { param, paramTok, arg } = this.visit(s) as { param: string; paramTok: IToken; arg: Term };
      const abs = Abs(param, base);
      this.positions.params.set(abs, this.pos(paramTok));
      base = App(abs, arg);
    }
    return base;
  }

  primary(ctx: any): Term {
    if (ctx.func) return this.visit(ctx.func);
    if (ctx.Identifier) {
      const tok = ctx.Identifier[0] as IToken;
      const v = Var(tokenName(tok));
      this.positions.vars.set(v, this.pos(tok));
      return v;
    }
    return this.visit(ctx.term);
  }

  subst(ctx: any): { param: string; paramTok: IToken; arg: Term } {
    const tok = ctx.Identifier[0] as IToken;
    return { param: tokenName(tok), paramTok: tok, arg: this.visit(ctx.term) };
  }

  func(ctx: any): Term {
    const toks: IToken[] = ctx.Identifier;
    const body: Term = this.visit(ctx.term);
    let result = body;
    for (let i = toks.length - 1; i >= 0; i--) {
      const abs = Abs(tokenName(toks[i]), result);
      this.positions.params.set(abs, this.pos(toks[i]));
      result = abs;
    }
    return result;
  }
}

export const astBuilder = new AstBuilder();

// ── 4. Public single-expression parse function ────────────────────────────────

export function parse(input: string, offset = 0): ParseResult {
  const trimmed = input.trimEnd();
  const { tokens, errors: lexErrors } = LambdaLexer.tokenize(trimmed);

  if (lexErrors.length > 0) {
    return {
      ok: false,
      errors: lexErrors.map((e) => ({ message: `Lex error: ${e.message}`, offset: offset + e.offset })),
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
        offset: isFinite(e.token.startOffset ?? NaN) ? offset + e.token.startOffset : trimmed.length,
      })),
    };
  }

  const next = parser.nextToken();
  if (next.tokenType !== EOF) {
    return { ok: false, errors: [{ message: `Unexpected '${next.image}'`, offset: offset + next.startOffset }] };
  }

  astBuilder.reset(offset);
  const term = astBuilder.visit(cst);
  return { ok: true, term, positions: astBuilder.positions };
}
