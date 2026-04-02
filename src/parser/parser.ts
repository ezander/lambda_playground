import { CstParser, CstNode, IToken, tokenMatcher, EOF } from "chevrotain";
import {
  allTokens,
  LambdaLexer,
  Backslash,
  Pi,
  DefAssign,
  Dot,
  LParen,
  RParen,
  LBracket,
  RBracket,
  Identifier,
  IdentifierLike,
  BacktickIdent,
} from "./lexer";

// Strip backtick quotes from a BacktickIdent token; leave plain identifiers unchanged.
function tokenName(tok: IToken): string {
  return tok.tokenType === BacktickIdent ? tok.image.slice(1, -1) : tok.image;
}
import { Term, Var, Abs, App, Pos } from "./ast";
import { normalize, alphaEq, buildNormDefs, findMatch } from "../evaluator/eval";
import { prettyPrint } from "./pretty";

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

  nextToken() { return this.LA(1); }

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
      { ALT: () => this.CONSUME(IdentifierLike) },
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
    this.CONSUME(IdentifierLike);
    this.CONSUME(DefAssign);
    this.SUBRULE(this.term);
    this.CONSUME(RBracket);
  });

  func = this.RULE("func", () => {
    this.CONSUME(Backslash);
    this.AT_LEAST_ONE(() => {
      this.CONSUME(IdentifierLike);
    });
    this.CONSUME(Dot);
    this.SUBRULE(this.term);
  });
}

export const parser = new LambdaParser();

// ── 2. CST → AST visitor ──────────────────────────────────────────────────────

// ── Position map ──────────────────────────────────────────────────────────────
// Positions are stored outside the Term objects so the term structure stays
// plain and all existing equality checks / tests continue to work unchanged.

export type PositionMap = {
  vars:   WeakMap<Var,  Pos>; // source range of each Var's identifier token
  params: WeakMap<Abs,  Pos>; // source range of each Abs's param identifier
};

function emptyPositionMap(): PositionMap {
  return { vars: new WeakMap(), params: new WeakMap() };
}

const BaseCstVisitor = parser.getBaseCstVisitorConstructor();

class AstBuilder extends BaseCstVisitor {
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
    if (ctx.IdentifierLike) {
      const tok = ctx.IdentifierLike[0] as IToken;
      const v = Var(tokenName(tok));
      this.positions.vars.set(v, this.pos(tok));
      return v;
    }
    return this.visit(ctx.term);
  }

  subst(ctx: any): { param: string; paramTok: IToken; arg: Term } {
    const tok = ctx.IdentifierLike[0] as IToken;
    return {
      param:    tokenName(tok),
      paramTok: tok,
      arg:      this.visit(ctx.term),
    };
  }

  func(ctx: any): Term {
    const toks: IToken[] = ctx.IdentifierLike;
    const body: Term = this.visit(ctx.term);
    // Desugar \x y z := body  →  Abs(x, Abs(y, Abs(z, body)))
    let result = body;
    for (let i = toks.length - 1; i >= 0; i--) {
      const abs = Abs(tokenName(toks[i]), result);
      this.positions.params.set(abs, this.pos(toks[i]));
      result = abs;
    }
    return result;
  }
}

const astBuilder = new AstBuilder();

// ── 3. Public parse function ───────────────────────────────────────────────────

export type LambdaError = { message: string; offset?: number; kind?: "error" | "warning" };

export type ParseResult =
  | { ok: true;  term: Term; positions: PositionMap }
  | { ok: false; errors: LambdaError[] };

export function parse(input: string, offset = 0): ParseResult {
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

  const next = parser.nextToken();
  if (next.tokenType !== EOF) {
    return { ok: false, errors: [{ message: `Unexpected '${next.image}'`, offset: offset + next.startOffset }] };
  }

  astBuilder.reset(offset);
  const term = astBuilder.visit(cst);
  return { ok: true, term, positions: astBuilder.positions };
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
// A program is a sequence of newline- or semicolon-separated statements, each either:
//   definition:  name param* ::= term
//   expression:  term
// Definitions are expanded eagerly into subsequent statements.
// The last expression is the term to evaluate.

// Per-definition info needed for accurate syntax highlighting
export type DefInfo = {
  name:      string;      // the defined identifier
  namePos:   Pos;         // source position of the defined name
  body:      Term;        // raw body (pre-expansion), Abs-wrapped for LHS params
  positions: PositionMap; // positions for identifiers within body
};

export type PragmaConfig = {
  maxStepsPrint?: number;
  maxStepsIdent?: number;
  maxHistory?:    number;
};

// max-steps is a shorthand that sets both maxStepsPrint and maxStepsIdent
export const KNOWN_PRAGMAS: Record<string, (keyof PragmaConfig)[]> = {
  "max-steps":       ["maxStepsPrint", "maxStepsIdent"],
  "max-steps-print": ["maxStepsPrint"],
  "max-steps-ident": ["maxStepsIdent"],
  "max-history":     ["maxHistory"],
};

export type ProgramResult = {
  ok: boolean;
  errors: LambdaError[];
  defs: Map<string, Term>;
  expr: Term | null;    // last expression, with defs expanded
  rawExpr: Term | null; // last expression, before expansion
  // For syntax highlighting:
  defInfos:   DefInfo[];
  exprInfos:  { term: Term; positions: PositionMap }[];
  // π-marked print statements (expanded, ready to evaluate):
  printInfos: { src: string; result: string; normal: boolean; steps: number; match?: string; offset: number; line: number }[];
  pragmaConfig: PragmaConfig;
};

export type ProgramRunConfig = { maxStepsPrint?: number; maxStepsIdent?: number };

export function parseProgram(input: string, defaultConfig: ProgramRunConfig = {}): ProgramResult {
  const defs = new Map<string, Term>();
  let expr: Term | null = null;
  let rawExpr: Term | null = null;
  const errors: LambdaError[] = [];
  const defInfos:   DefInfo[] = [];
  const exprInfos:  { term: Term; positions: PositionMap }[] = [];
  const printInfos: ProgramResult["printInfos"] = [];
  const pragmaConfig: PragmaConfig = {};
  let lineOffset = 0;

  for (const rawLine of input.split(/[;\n]/)) {
    // ── #! pragma directive ────────────────────────────────────────────────────
    if (rawLine.trimStart().startsWith("#!")) {
      const text = rawLine.trimStart().slice(2).trim();
      const m = text.match(/^(no-)?([a-z][a-z0-9-]*)(?:=(true|false|\d+))?$/);
      if (!m) {
        errors.push({ message: `Invalid pragma: "${text}"`, offset: lineOffset, kind: "warning" });
      } else {
        const [, negate, key, val] = m;
        const props = KNOWN_PRAGMAS[key];
        if (!props) {
          errors.push({ message: `Unknown pragma option: "${key}"`, offset: lineOffset, kind: "warning" });
        } else {
          if (negate) errors.push({ message: `Pragma "${key}" is numeric, cannot negate`, offset: lineOffset, kind: "warning" });
          else if (!val || !/^\d+$/.test(val)) errors.push({ message: `Pragma "${key}" requires a numeric value`, offset: lineOffset, kind: "warning" });
          else for (const prop of props) pragmaConfig[prop] = parseInt(val);
        }
      }
      lineOffset += rawLine.length + 1;
      continue;
    }
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

    // ── π print statement ──────────────────────────────────────────────────────
    if (tokens[0]?.tokenType === Pi) {
      const rest = rawLine.slice(tokens[0].endOffset! + 1);
      const result = parse(rest, lineOffset + tokens[0].endOffset! + 1);
      if (!result.ok) {
        errors.push(...result.errors);
      } else {
        const expanded = expandDefs(result.term, defs);
        const merged = { ...defaultConfig, ...pragmaConfig };
        const { term: normalizedTerm, kind, steps } = normalize(expanded, { maxSteps: merged.maxStepsPrint });
        const nd = buildNormDefs(defs, { maxSteps: merged.maxStepsIdent });
        printInfos.push({
          src:    prettyPrint(result.term),
          result: prettyPrint(normalizedTerm),
          normal: kind === "normalForm",
          steps,
          match:  kind === "normalForm" ? findMatch(normalizedTerm, nd) : undefined,
          offset: lineOffset,
          line:   input.slice(0, lineOffset).split("\n").length,
        });
        exprInfos.push({ term: result.term, positions: result.positions });
      }
      lineOffset += rawLine.length + 1;
      continue;
    }

    const defIdx = tokens.findIndex((t) => t.tokenType === DefAssign);

    if (defIdx >= 0) {
      // ── Definition ────────────────────────────────────────────────────────
      const lhs = tokens.slice(0, defIdx);
      if (lhs.length === 0 || lhs.some((t) => !tokenMatcher(t, IdentifierLike))) {
        errors.push({ message: `Definition left-hand side must be identifiers only`, offset: lineOffset });
        lineOffset += rawLine.length + 1;
        continue;
      }
      const [nameToken, ...paramTokens] = lhs;
      const name   = tokenName(nameToken);
      const params = paramTokens.map(tokenName);

      const rhsStart = tokens[defIdx].startOffset + 2; // := is 2 chars
      const rhs = rawLine.slice(rhsStart);
      const bodyResult = parse(rhs, lineOffset + rhsStart);
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

      // Build raw body for highlighting: wrap in Abs nodes with param positions
      const positions = bodyResult.positions;
      let rawBody: Term = bodyResult.term;
      for (let i = paramTokens.length - 1; i >= 0; i--) {
        const tok = paramTokens[i];
        const abs = Abs(tokenName(tok), rawBody);
        positions.params.set(abs, { from: lineOffset + tok.startOffset, to: lineOffset + (tok.endOffset ?? tok.startOffset) + 1 });
        rawBody = abs;
      }
      defInfos.push({
        name,
        namePos: { from: lineOffset + nameToken.startOffset, to: lineOffset + (nameToken.endOffset ?? nameToken.startOffset) + 1 },
        body: rawBody,
        positions,
      });

    } else {
      // ── Expression ────────────────────────────────────────────────────────
      const result = parse(rawLine, lineOffset);
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
      exprInfos.push({ term: result.term, positions: result.positions });
    }

    lineOffset += rawLine.length + 1;
  }

  return { ok: errors.filter(e => e.kind !== "warning").length === 0, errors, defs, expr, rawExpr, defInfos, exprInfos, printInfos, pragmaConfig };
}
