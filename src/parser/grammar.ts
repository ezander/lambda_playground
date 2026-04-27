import { CstParser, CstNode, IToken, EOF } from "chevrotain";
import {
  allTokens,
  LambdaLexer,
  Directive,
  CmdPrint,
  CmdAssert,
  CmdAssertNot,
  CmdEval,
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
  StrictBinder,
} from "./lexer";
import { Term, Var, Abs, App, Pos } from "./ast";
import { LambdaError, ParseResult, PositionMap } from "./types";

// Strip backtick quotes from a BacktickIdent token; strip leading β (and any
// backtick wrap) from a StrictBinder; leave plain identifiers unchanged.
export function tokenName(tok: IToken): string {
  if (tok.tokenType === BacktickIdent) return tok.image.slice(1, -1);
  if (tok.tokenType === StrictBinder) {
    const rest = tok.image.slice(1);  // strip leading β
    return rest.startsWith("`") ? rest.slice(1, -1) : rest;
  }
  return tok.image;
}

export function isStrictBinder(tok: IToken): boolean {
  return tok.tokenType === StrictBinder;
}

function emptyPositionMap(): PositionMap {
  return { vars: new WeakMap(), params: new WeakMap() };
}

// ── 1. CST Parser ─────────────────────────────────────────────────────────────
//
// The grammar is the rule definitions below. For an EBNF rendering see
// docs/grammar.md (regenerate with `npm run gen:grammar`) or open the
// Help modal's Grammar tab in the running app.

class LambdaParser extends CstParser {
  constructor() {
    // nodeLocationTracking: needed by the application visitor to re-interleave
    // atoms and abstractions by source order (Chevrotain groups CST children by
    // name, losing the interleaved order otherwise).
    super(allTokens, { nodeLocationTracking: "onlyOffset" });
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
      { ALT: () => this.SUBRULE(this.directiveLine) },
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
      { ALT: () => this.SUBRULE(this.evalStmt) },
      // Gate via BACKTRACK: try parsing `definition` non-committed; if it
      // succeeds, take this alt. Cheaper than it looks (Chevrotain snapshots
      // are lightweight) and stays correct under future grammar changes —
      // no manual lookahead to keep in sync.
      { GATE: this.BACKTRACK(this.definition), ALT: () => this.SUBRULE(this.definition) },
      { ALT: () => this.SUBRULE(this.term) },
    ]);
  });

  directiveLine = this.RULE("directiveLine", () => {
    this.CONSUME(Directive);
    this.CONSUME(NewLine);
  });

  printStmt = this.RULE("printStmt", () => {
    this.OR([
      { ALT: () => this.CONSUME(Pi) },
      { ALT: () => this.CONSUME(CmdPrint) },
    ]);
    this.OPTION(() => this.SUBRULE(this.comprehensionSpec));
    this.SUBRULE(this.term);
  });

  equivStmt = this.RULE("equivStmt", () => {
    this.OR([
      { ALT: () => this.CONSUME(Equiv) },
      { ALT: () => this.CONSUME(CmdAssert) },
    ]);
    this.OPTION(() => this.SUBRULE(this.comprehensionSpec));
    this.SUBRULE(this.atom);
    this.SUBRULE2(this.atom);
  });

  nequivStmt = this.RULE("nequivStmt", () => {
    this.OR([
      { ALT: () => this.CONSUME(NEquiv) },
      { ALT: () => this.CONSUME(CmdAssertNot) },
    ]);
    this.OPTION(() => this.SUBRULE(this.comprehensionSpec));
    this.SUBRULE(this.atom);
    this.SUBRULE2(this.atom);
  });

  evalStmt = this.RULE("evalStmt", () => {
    this.CONSUME(CmdEval);
    this.SUBRULE(this.term);
  });

  definition = this.RULE("definition", () => {
    this.CONSUME(Identifier);                     // name — plain identifier only (β not allowed)
    this.MANY(() => this.SUBRULE(this.binder));   // params — may be strict (βx)
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
    this.OR([
      { ALT: () => this.SUBRULE(this.abstraction) },
      { ALT: () => this.SUBRULE(this.application) },
    ]);
  });

  application = this.RULE("application", () => {
    this.SUBRULE(this.atom);
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE2(this.atom) },
        { ALT: () => this.SUBRULE2(this.abstraction) },
      ]);
    });
  });

  atom = this.RULE("atom", () => {
    this.OR([
      { ALT: () => this.CONSUME(Identifier) },
      {
        ALT: () => {
          this.CONSUME(LParen);
          this.SUBRULE(this.term);
          this.CONSUME(RParen);
        },
      },
    ]);
    this.MANY(() => this.SUBRULE(this.subst));
  });

  subst = this.RULE("subst", () => {
    this.CONSUME(LBracket);
    this.SUBRULE(this.binder);
    this.CONSUME(DefAssign);
    this.SUBRULE(this.term);
    this.CONSUME(RBracket);
  });

  abstraction = this.RULE("abstraction", () => {
    this.CONSUME(Lambda);
    this.AT_LEAST_ONE(() => this.SUBRULE(this.binder));
    this.CONSUME(Dot);
    this.SUBRULE(this.term);
  });

  // A binder is a parameter slot: a plain identifier, or a β-prefixed strict
  // binder. Strict binders are restricted to binder positions — definition
  // names and comprehension targets cannot carry β.
  binder = this.RULE("binder", () => {
    this.OR([
      { ALT: () => this.CONSUME(Identifier) },
      { ALT: () => this.CONSUME(StrictBinder) },
    ]);
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
export type RawEval    = { kind: "eval"; term: Term; offset: number };
export type RawStmt    = RawEmpty | RawPragma | RawDef | RawPrint | RawEquiv | RawExpr | RawEval;

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
    if (ctx.directiveLine) return this.visit(ctx.directiveLine[0]) as RawStmt;
    if (ctx.statement)  return this.visit(ctx.statement[0])  as RawStmt;
    return { kind: "empty" };
  }

  statementSep(_ctx: any): void { /* separator only — no AST contribution */ }

  private termStart(term: Term): number {
    switch (term.kind) {
      case "Var":   return this.positions.vars.get(term as import("./ast").Var)?.from ?? 0;
      case "Abs":   return this.positions.params.get(term as import("./ast").Abs)?.from ?? 0;
      case "App":   return this.termStart(term.func);
      case "Subst": return 0;
    }
  }

  statement(ctx: any): RawStmt {
    if (ctx.printStmt)  return this.visit(ctx.printStmt[0])  as RawStmt;
    if (ctx.equivStmt)  return this.visit(ctx.equivStmt[0])  as RawStmt;
    if (ctx.nequivStmt) return this.visit(ctx.nequivStmt[0]) as RawStmt;
    if (ctx.evalStmt)   return this.visit(ctx.evalStmt[0])   as RawStmt;
    if (ctx.definition) return this.visit(ctx.definition[0]) as RawStmt;
    if (ctx.term) { const term = this.visit(ctx.term[0]) as Term; return { kind: "expr", term, offset: this.termStart(term) }; }
    return { kind: "empty" };
  }

  directiveLine(ctx: any): RawPragma {
    const tok = ctx.Directive[0] as IToken;
    // Strip leading ":" and trim — e.g. ":import "foo"" → "import "foo""
    return { kind: "pragma", text: tok.image.slice(1).trim(), offset: tok.startOffset };
  }

  printStmt(ctx: any): RawPrint | RawEmpty {
    const kwTok = (ctx.Pi?.[0] ?? ctx.CmdPrint?.[0]) as IToken | undefined;
    if (!kwTok || !ctx.term) return { kind: "empty" };
    const term = this.visit(ctx.term[0]) as Term;
    const bindings = ctx.comprehensionSpec ? this.visit(ctx.comprehensionSpec[0]) as RawBinding[] : null;
    return { kind: "print", term, bindings, offset: kwTok.startOffset };
  }

  equivStmt(ctx: any): RawEquiv | RawEmpty {
    const kwTok = (ctx.Equiv?.[0] ?? ctx.CmdAssert?.[0]) as IToken | undefined;
    if (!kwTok || !ctx.atom || ctx.atom.length < 2) return { kind: "empty" };
    const atom1 = this.visit(ctx.atom[0]) as Term;
    const atom2 = this.visit(ctx.atom[1]) as Term;
    const bindings = ctx.comprehensionSpec ? this.visit(ctx.comprehensionSpec[0]) as RawBinding[] : null;
    return { kind: "equiv", atom1, atom2, bindings, negated: false, offset: kwTok.startOffset };
  }

  nequivStmt(ctx: any): RawEquiv | RawEmpty {
    const kwTok = (ctx.NEquiv?.[0] ?? ctx.CmdAssertNot?.[0]) as IToken | undefined;
    if (!kwTok || !ctx.atom || ctx.atom.length < 2) return { kind: "empty" };
    const atom1 = this.visit(ctx.atom[0]) as Term;
    const atom2 = this.visit(ctx.atom[1]) as Term;
    const bindings = ctx.comprehensionSpec ? this.visit(ctx.comprehensionSpec[0]) as RawBinding[] : null;
    return { kind: "equiv", atom1, atom2, bindings, negated: true, offset: kwTok.startOffset };
  }

  evalStmt(ctx: any): RawEval | RawEmpty {
    if (!ctx.CmdEval || !ctx.term) return { kind: "empty" };
    const tok = ctx.CmdEval[0] as IToken;
    const term = this.visit(ctx.term[0]) as Term;
    return { kind: "eval", term, offset: tok.startOffset };
  }

  definition(ctx: any): RawDef | RawEmpty {
    if (!ctx.Identifier || !ctx.term) return { kind: "empty" };
    const nameTok = (ctx.Identifier as IToken[])[0];
    const params  = (ctx.binder ?? []).map((b: CstNode) => this.visit(b) as IToken);
    const bodyTerm = this.visit(ctx.term[0]) as Term;
    let rawBody: Term = bodyTerm;
    for (let i = params.length - 1; i >= 0; i--) {
      const tok = params[i];
      const abs = Abs(tokenName(tok), rawBody, isStrictBinder(tok));
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
    if (ctx.abstraction) return this.visit(ctx.abstraction[0]);
    return this.visit(ctx.application[0]);
  }

  application(ctx: any): Term {
    // Chevrotain groups CST children by name, so atoms and abstractions arrive
    // in two separate arrays. Re-interleave by source offset to recover
    // left-associative juxtaposition order.
    const items: CstNode[] = [...(ctx.atom ?? []), ...(ctx.abstraction ?? [])];
    items.sort((a, b) => (a.location?.startOffset ?? 0) - (b.location?.startOffset ?? 0));
    const terms = items.map(n => this.visit(n) as Term);
    return terms.reduce((func, arg) => App(func, arg));
  }

  atom(ctx: any): Term {
    let base: Term;
    if (ctx.Identifier) {
      const tok = ctx.Identifier[0] as IToken;
      const v = Var(tokenName(tok));
      this.positions.vars.set(v, this.pos(tok));
      base = v;
    } else {
      base = this.visit(ctx.term[0]);
    }
    for (const s of (ctx.subst ?? [])) {
      const { param, paramTok, arg, strict } = this.visit(s) as { param: string; paramTok: IToken; arg: Term; strict: boolean };
      const abs = Abs(param, base, strict);
      this.positions.params.set(abs, this.pos(paramTok));
      base = App(abs, arg);
    }
    return base;
  }

  subst(ctx: any): { param: string; paramTok: IToken; arg: Term; strict: boolean } {
    const tok = this.visit(ctx.binder[0]) as IToken;
    return { param: tokenName(tok), paramTok: tok, arg: this.visit(ctx.term), strict: isStrictBinder(tok) };
  }

  abstraction(ctx: any): Term {
    const toks: IToken[] = (ctx.binder as CstNode[]).map(b => this.visit(b) as IToken);
    const body: Term = this.visit(ctx.term);
    let result = body;
    for (let i = toks.length - 1; i >= 0; i--) {
      const abs = Abs(tokenName(toks[i]), result, isStrictBinder(toks[i]));
      this.positions.params.set(abs, this.pos(toks[i]));
      result = abs;
    }
    return result;
  }

  binder(ctx: any): IToken {
    // ctx will have either Identifier or StrictBinder, never both — return the one present.
    return (ctx.Identifier ?? ctx.StrictBinder)[0] as IToken;
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
