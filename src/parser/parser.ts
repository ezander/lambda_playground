import { CstParser, CstNode, IToken, tokenMatcher, EOF } from "chevrotain";
import {
  allTokens,
  LambdaLexer,
  PragmaLine,
  Backslash,
  Pi,
  Equiv,
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
// Program grammar:
//   program            ::= programItem*
//   programItem        ::= NewLine | Semi | nonEmpty (NewLine | Semi)?
//   nonEmpty           ::= pragmaStmt | printStmt | equivStmt | definition | expressionStmt
//   pragmaStmt         ::= PragmaLine
//   printStmt          ::= π comprehensionSpec? term
//   equivStmt          ::= ≡ comprehensionSpec? atom atom
//   definition         ::= identLike+ ':=' term          (gated: next := after identLike+)
//   expressionStmt     ::= term
//   comprehensionSpec  ::= '[' comprehensionBinding (',' comprehensionBinding)* ']'
//   comprehensionBinding ::= identLike ':=' '{' term (',' term)* '}'
//
// Term grammar:
//   term        ::= application
//   application ::= atom+                  (left-associative fold)
//   atom        ::= primary subst*
//   primary     ::= identLike | '(' term ')' | function
//   function    ::= '\' identLike+ '.' term
//   subst       ::= '[' identLike ':=' term ']'
//   identLike   ::= Identifier | BacktickIdent | OperatorIdent

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
      { ALT: () => this.CONSUME(NewLine) },
      { ALT: () => this.CONSUME(Semi) },
      {
        ALT: () => {
          this.SUBRULE(this.nonEmpty);
          this.OPTION(() => {
            this.OR2([
              { ALT: () => this.CONSUME2(NewLine) },
              { ALT: () => this.CONSUME2(Semi) },
            ]);
          });
        },
      },
    ]);
  });

  nonEmpty = this.RULE("nonEmpty", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.pragmaStmt) },
      { ALT: () => this.SUBRULE(this.printStmt) },
      { ALT: () => this.SUBRULE(this.equivStmt) },
      { GATE: () => this.isDefinition(), ALT: () => this.SUBRULE(this.definition) },
      { ALT: () => this.SUBRULE(this.expressionStmt) },
    ]);
  });

  // Look ahead: skip IdentifierLike* and check if the next token is DefAssign.
  // If so, we're looking at a definition. This disambiguates `f x := body` from `f x y`.
  private isDefinition(): boolean {
    let i = 1;
    while (tokenMatcher(this.LA(i), IdentifierLike)) i++;
    return tokenMatcher(this.LA(i), DefAssign);
  }

  pragmaStmt = this.RULE("pragmaStmt", () => {
    this.CONSUME(PragmaLine);
  });

  printStmt = this.RULE("printStmt", () => {
    this.CONSUME(Pi);
    // comprehensionSpec only if next token is '[' (terms cannot start with '[')
    this.OPTION(() => this.SUBRULE(this.comprehensionSpec));
    this.SUBRULE(this.term);
  });

  equivStmt = this.RULE("equivStmt", () => {
    this.CONSUME(Equiv);
    this.OPTION(() => this.SUBRULE(this.comprehensionSpec));
    this.SUBRULE(this.atom);    // first operand
    this.SUBRULE2(this.atom);   // second operand
  });

  definition = this.RULE("definition", () => {
    // Consume IdentifierLike tokens until DefAssign — stops naturally when next is not IdentifierLike
    this.AT_LEAST_ONE(() => this.CONSUME(IdentifierLike));
    this.CONSUME(DefAssign);
    this.SUBRULE(this.term);
  });

  expressionStmt = this.RULE("expressionStmt", () => {
    this.SUBRULE(this.term);
  });

  comprehensionSpec = this.RULE("comprehensionSpec", () => {
    this.CONSUME(LBracket);
    this.SUBRULE(this.comprehensionBinding);
    this.MANY(() => {
      this.CONSUME(Comma);
      this.SUBRULE2(this.comprehensionBinding);
    });
    this.CONSUME(RBracket);
  });

  comprehensionBinding = this.RULE("comprehensionBinding", () => {
    this.CONSUME(IdentifierLike);
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
export type PositionMap = {
  vars:   WeakMap<Var,  Pos>; // source range of each Var's identifier token
  params: WeakMap<Abs,  Pos>; // source range of each Abs's param identifier
};

function emptyPositionMap(): PositionMap {
  return { vars: new WeakMap(), params: new WeakMap() };
}

const BaseCstVisitor = parser.getBaseCstVisitorConstructor();

// ── Internal raw statement types ──────────────────────────────────────────────
// Returned by the AST visitor for the program-level rules.
// Semantic analysis (in parseProgram) converts these to ProgramResult.

type RawBinding  = { name: string; termValues: Term[] };
type RawEmpty    = { kind: "empty" };
type RawPragma   = { kind: "pragma"; text: string; offset: number };
type RawDef      = { kind: "def"; name: string; nameTok: IToken; params: IToken[]; rawBody: Term; bodyTerm: Term; offset: number };
type RawPrint    = { kind: "print"; term: Term; bindings: RawBinding[] | null; offset: number };
type RawEquiv    = { kind: "equiv"; atom1: Term; atom2: Term; bindings: RawBinding[] | null; offset: number };
type RawExpr     = { kind: "expr"; term: Term; offset: number };
type RawStmt     = RawEmpty | RawPragma | RawDef | RawPrint | RawEquiv | RawExpr;

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

  // ── Program-level visitors ─────────────────────────────────────────────────

  program(ctx: any): RawStmt[] {
    return (ctx.programItem ?? []).map((item: CstNode) => this.visit(item) as RawStmt);
  }

  programItem(ctx: any): RawStmt {
    // ctx.NewLine/Semi may be set from the optional terminator even when nonEmpty is present
    if (!ctx.nonEmpty) return { kind: "empty" };
    return this.visit(ctx.nonEmpty[0]) as RawStmt;
  }

  nonEmpty(ctx: any): RawStmt {
    if (ctx.pragmaStmt)     return this.visit(ctx.pragmaStmt[0])     as RawStmt;
    if (ctx.printStmt)      return this.visit(ctx.printStmt[0])      as RawStmt;
    if (ctx.equivStmt)      return this.visit(ctx.equivStmt[0])      as RawStmt;
    if (ctx.definition)     return this.visit(ctx.definition[0])     as RawStmt;
    if (ctx.expressionStmt) return this.visit(ctx.expressionStmt[0]) as RawStmt;
    return { kind: "empty" };
  }

  pragmaStmt(ctx: any): RawPragma {
    const tok = ctx.PragmaLine[0] as IToken;
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
    return { kind: "equiv", atom1, atom2, bindings, offset: equivTok.startOffset };
  }

  definition(ctx: any): RawDef | RawEmpty {
    if (!ctx.IdentifierLike || !ctx.term) return { kind: "empty" };
    const toks = ctx.IdentifierLike as IToken[];
    const nameTok = toks[0];
    const params = toks.slice(1);
    const bodyTerm = this.visit(ctx.term[0]) as Term;
    // Build rawBody: wrap bodyTerm in Abs nodes for params (for position tracking / highlighting)
    let rawBody: Term = bodyTerm;
    for (let i = params.length - 1; i >= 0; i--) {
      const tok = params[i];
      const abs = Abs(tokenName(tok), rawBody);
      this.positions.params.set(abs, this.pos(tok));
      rawBody = abs;
    }
    return { kind: "def", name: tokenName(nameTok), nameTok, params, rawBody, bodyTerm, offset: nameTok.startOffset };
  }

  expressionStmt(ctx: any): RawExpr | RawEmpty {
    if (!ctx.term) return { kind: "empty" };
    const term = this.visit(ctx.term[0]) as Term;
    return { kind: "expr", term, offset: 0 };
  }

  comprehensionSpec(ctx: any): RawBinding[] {
    return (ctx.comprehensionBinding ?? []).map((bn: CstNode) => this.visit(bn) as RawBinding);
  }

  comprehensionBinding(ctx: any): RawBinding {
    const nameTok = (ctx.IdentifierLike as IToken[])[0];
    const termValues = (ctx.term ?? []).map((t: CstNode) => this.visit(t) as Term);
    return { name: tokenName(nameTok), termValues };
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
// Parses a single expression. Used for the eval panel and single-term evaluation.

export type LambdaError = { message: string; offset?: number; kind?: "error" | "warning"; source?: string };

export type ParseResult =
  | { ok: true;  term: Term; positions: PositionMap }
  | { ok: false; errors: LambdaError[] };

export function parse(input: string, offset = 0): ParseResult {
  // Trim trailing whitespace so single-expression parsing is lenient about trailing newlines.
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

// ── Definition expansion ───────────────────────────────────────────────────────
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
      return term;
  }
}

// ── Program parser ─────────────────────────────────────────────────────────────

export type DefInfo = {
  name:      string;
  namePos:   Pos;
  body:      Term;
  positions: PositionMap;
};

export type PragmaConfig = {
  maxStepsPrint?:  number;
  maxStepsIdent?:  number;
  maxHistory?:     number;
  normalizeDefs?:  boolean;
  maxSize?:        number;
};

export const KNOWN_PRAGMAS: Record<string, (keyof PragmaConfig)[]> = {
  "max-steps":       ["maxStepsPrint", "maxStepsIdent"],
  "max-steps-print": ["maxStepsPrint"],
  "max-steps-ident": ["maxStepsIdent"],
  "max-history":     ["maxHistory"],
  "normalize-defs":  ["normalizeDefs"],
  "max-size":        ["maxSize"],
};

export const BOOLEAN_PRAGMAS = new Set<string>(["normalize-defs"]);

export type EquivInfo = {
  src1: string; src2: string;
  norm1: string; norm2: string;
  equivalent: boolean;
  terminated: boolean;
  offset: number; line: number;
};

export type ComprehensionBinding = { name: string; values: string[] };

export type PrintComprehensionRow = {
  substExpr: string;
  result: string;
  normal: boolean;
  steps: number;
  size?: number;
  match?: string;
};

export type PrintComprehensionInfo = {
  src: string;
  bindings: ComprehensionBinding[];
  rows: PrintComprehensionRow[];
  offset: number;
  line: number;
};

export type EquivComprehensionRow = {
  substExpr1: string;
  substExpr2: string;
  norm1: string;
  norm2: string;
  equivalent: boolean;
  terminated: boolean;
};

export type EquivComprehensionInfo = {
  src1: string;
  src2: string;
  bindings: ComprehensionBinding[];
  rows: EquivComprehensionRow[];
  allPassed: boolean;
  offset: number;
  line: number;
};

export type ProgramResult = {
  ok: boolean;
  errors: LambdaError[];
  defs: Map<string, Term>;
  expr: Term | null;
  rawExpr: Term | null;
  defInfos:   DefInfo[];
  exprInfos:  { term: Term; positions: PositionMap }[];
  printInfos: { src: string; result: string; normal: boolean; steps: number; size?: number; match?: string; offset: number; line: number }[];
  equivInfos: EquivInfo[];
  printComprehensionInfos: PrintComprehensionInfo[];
  equivComprehensionInfos: EquivComprehensionInfo[];
  pragmaConfig: PragmaConfig;
};

export type ProgramRunConfig = { maxStepsPrint?: number; maxStepsIdent?: number; maxSize?: number };

export type IncludeResolver = (path: string) => string | null;

const includeCache = new Map<string, { content: string; result: ProgramResult }>();

function cachedParseInclude(
  path: string,
  content: string,
  defaultConfig: ProgramRunConfig,
  resolver: IncludeResolver,
  includeStack: string[],
): ProgramResult {
  const cached = includeCache.get(path);
  if (cached && cached.content === content) return cached.result;
  const result = parseProgram(content, defaultConfig, resolver, includeStack);
  includeCache.set(path, { content, result });
  return result;
}

// ── Comprehension helpers ──────────────────────────────────────────────────────

function cartesian<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, arr) => acc.flatMap(prev => arr.map(val => [...prev, val])),
    [[]]
  );
}

function applySubsts(term: Term, substs: { name: string; value: Term }[]): Term {
  return substs.reduce((inner, { name, value }) => App(Abs(name, inner), value), term);
}

function formatSubstExpr(src: string, substs: { name: string; value: string }[]): string {
  return `(${src})[${substs.map(s => `${s.name}:=${s.value}`).join(", ")}]`;
}

// ── Pragma processing ──────────────────────────────────────────────────────────

function processPragma(
  text: string,
  offset: number,
  pragmaConfig: PragmaConfig,
  errors: LambdaError[],
  defaultConfig: ProgramRunConfig,
  resolver: IncludeResolver,
  defs: Map<string, Term>,
  includeStack: string[],
  equivFailed: { value: boolean },
): void {
  const incMatch = text.match(/^include\s+"([^"]+)"\s*$/);
  if (incMatch) {
    const path = incMatch[1];
    if (includeStack.includes(path)) {
      errors.push({ message: `Circular include: "${path}"`, offset });
      return;
    }
    const content = resolver(path);
    if (content === null) {
      errors.push({ message: `Include not found: "${path}"`, offset });
      return;
    }
    const included = cachedParseInclude(path, content, defaultConfig, resolver, [...includeStack, path]);
    for (const e of included.errors)
      errors.push({ ...e, source: e.source ?? path });
    if (!included.ok) equivFailed.value = true;
    for (const [name, term] of included.defs) {
      if (defs.has(name)) {
        const oldNorm = normalize(defs.get(name)!).term;
        const newNorm = normalize(term).term;
        if (!alphaEq(oldNorm, newNorm))
          errors.push({ message: `Warning: '${name}' redefined with a different normal form (from include "${path}")`, offset, kind: "warning" });
      } else {
        defs.set(name, term);
      }
    }
    return;
  }

  const m = text.match(/^(no-)?([a-z][a-z0-9-]*)(?:(?:\s*=\s*|\s+)(true|false|\d+))?\s*$/);
  if (!m) {
    errors.push({ message: `Invalid pragma: "${text}"`, offset, kind: "warning" });
    return;
  }
  const [, negate, key, val] = m;
  const props = KNOWN_PRAGMAS[key];
  if (!props) {
    errors.push({ message: `Unknown pragma option: "${key}"`, offset, kind: "warning" });
  } else if (BOOLEAN_PRAGMAS.has(key)) {
    if (val && val !== "true" && val !== "false")
      errors.push({ message: `Pragma "${key}" is boolean, expected no value, true, or false`, offset, kind: "warning" });
    else { const b = negate ? false : val !== "false"; for (const prop of props) (pragmaConfig as any)[prop] = b; }
  } else {
    if (negate) errors.push({ message: `Pragma "${key}" is numeric, cannot negate`, offset, kind: "warning" });
    else if (!val || !/^\d+$/.test(val)) errors.push({ message: `Pragma "${key}" requires a numeric value`, offset, kind: "warning" });
    else for (const prop of props) pragmaConfig[prop] = parseInt(val) as any;
  }
}

// ── Main program parser ────────────────────────────────────────────────────────

export function parseProgram(
  input: string,
  defaultConfig: ProgramRunConfig = {},
  resolver: IncludeResolver = () => null,
  _includeStack: string[] = [],
): ProgramResult {
  const defs = new Map<string, Term>();
  let expr: Term | null = null;
  let rawExpr: Term | null = null;
  const errors: LambdaError[] = [];
  const defInfos:   DefInfo[] = [];
  const exprInfos:  { term: Term; positions: PositionMap }[] = [];
  const printInfos: ProgramResult["printInfos"] = [];
  const equivInfos: EquivInfo[] = [];
  const printComprehensionInfos: PrintComprehensionInfo[] = [];
  const equivComprehensionInfos: EquivComprehensionInfo[] = [];
  const pragmaConfig: PragmaConfig = {};
  const equivFailed = { value: false };

  // ── Lex the full input ─────────────────────────────────────────────────────
  const lexResult = LambdaLexer.tokenize(input);
  if (lexResult.errors.length > 0) {
    for (const e of lexResult.errors)
      errors.push({ message: `Lex error: ${e.message}`, offset: e.offset });
  }

  // ── Parse with full grammar ────────────────────────────────────────────────
  parser.input = lexResult.tokens;
  const cst = parser.program();

  if (parser.errors.length > 0) {
    for (const e of parser.errors) {
      errors.push({
        message: e.token.image
          ? `Parse error at '${e.token.image}': ${e.message}`
          : `Parse error: ${e.message}`,
        offset: isFinite(e.token.startOffset ?? NaN) ? e.token.startOffset : input.length,
      });
    }
  }

  // ── Visit CST → raw statements ─────────────────────────────────────────────
  astBuilder.reset(0);
  const stmts: RawStmt[] = lexResult.errors.length === 0 && parser.errors.length === 0
    ? (astBuilder.visit(cst) as RawStmt[])
    : [];

  // Shared positions map (accumulated across all statements during the visitor pass above)
  const globalPositions = astBuilder.positions;

  // ── Semantic analysis ──────────────────────────────────────────────────────
  for (const stmt of stmts) {
    if (equivFailed.value) continue;

    switch (stmt.kind) {
      case "empty":
        break;

      case "pragma": {
        processPragma(stmt.text, stmt.offset, pragmaConfig, errors, defaultConfig, resolver, defs, _includeStack, equivFailed);
        break;
      }

      case "def": {
        const { name, nameTok, params, rawBody, bodyTerm, offset } = stmt;
        const merged = { ...defaultConfig, ...pragmaConfig };

        // Expand known defs in body, excluding params (they shadow defs)
        const innerDefs = new Map(defs);
        for (const p of params.map(tokenName)) innerDefs.delete(p);
        let body = expandDefs(bodyTerm, innerDefs);

        // Desugar: f x y := e  →  f := \x y. e
        if (params.length > 0)
          body = params.map(tokenName).reduceRight((acc, p) => Abs(p, acc), body);

        // Normalize definition body (default: on)
        if (pragmaConfig.normalizeDefs ?? true) {
          const { term: normalized, kind } = normalize(body, { maxSteps: merged.maxStepsIdent, maxSize: merged.maxSize });
          if (kind === "stepLimit")
            errors.push({ message: `Warning: definition '${name}' did not normalize within step limit — storing as-is`, offset, kind: "warning" });
          else if (kind === "sizeLimit")
            errors.push({ message: `Warning: definition '${name}' exceeded size limit during normalization — storing as-is`, offset, kind: "warning" });
          else
            body = normalized;
        }

        if (defs.has(name)) {
          const oldNorm = normalize(defs.get(name)!).term;
          const newNorm = normalize(body).term;
          if (!alphaEq(oldNorm, newNorm))
            errors.push({ message: `Warning: '${name}' redefined with a different normal form`, offset, kind: "warning" });
        }
        defs.set(name, body);

        defInfos.push({
          name,
          namePos: { from: nameTok.startOffset, to: (nameTok.endOffset ?? nameTok.startOffset) + 1 },
          body: rawBody,
          positions: globalPositions,
        });
        break;
      }

      case "print": {
        const merged = { ...defaultConfig, ...pragmaConfig };
        const cfg = { maxSteps: merged.maxStepsPrint, maxSize: merged.maxSize };
        const currentLine = input.slice(0, stmt.offset).split("\n").length;

        if (stmt.bindings) {
          // ── π comprehension ──────────────────────────────────────────────
          const bindingNames = new Set(stmt.bindings.map(b => b.name));
          const defsFiltered = new Map([...defs].filter(([k]) => !bindingNames.has(k)));
          const expandedBase = expandDefs(stmt.term, defsFiltered);
          const baseSrc = prettyPrint(stmt.term);
          const nd = buildNormDefs(defs, { maxSteps: merged.maxStepsIdent, maxSize: merged.maxSize });

          const expandedBindings = stmt.bindings.map(b => ({
            name: b.name,
            expandedValues: b.termValues.map(v => expandDefs(v, defsFiltered)),
            valueSrcs: b.termValues.map(v => prettyPrint(v)),
          }));

          const valueCombos = cartesian(expandedBindings.map(b =>
            b.expandedValues.map((ev, vi) => ({ name: b.name, valueSrc: b.valueSrcs[vi], valueTerm: ev }))
          ));

          const rows: PrintComprehensionRow[] = [];
          for (const combo of valueCombos) {
            const wrappedTerm = applySubsts(expandedBase, combo.map(c => ({ name: c.name, value: c.valueTerm })));
            const runResult = normalize(wrappedTerm, cfg);
            const { term: normalizedTerm, kind, steps } = runResult;
            rows.push({
              substExpr: formatSubstExpr(baseSrc, combo.map(c => ({ name: c.name, value: c.valueSrc }))),
              result:    prettyPrint(normalizedTerm),
              normal:    kind === "normalForm",
              steps,
              size:      kind === "sizeLimit" ? runResult.size : undefined,
              match:     kind === "normalForm" ? findMatch(normalizedTerm, nd) : undefined,
            });
          }

          const compBindings: ComprehensionBinding[] = stmt.bindings.map((b, bi) => ({
            name: b.name,
            values: expandedBindings[bi].valueSrcs,
          }));
          printComprehensionInfos.push({ src: baseSrc, bindings: compBindings, rows, offset: stmt.offset, line: currentLine });
          exprInfos.push({ term: stmt.term, positions: globalPositions });
        } else {
          // ── regular π ────────────────────────────────────────────────────
          const expanded = expandDefs(stmt.term, defs);
          const runResult = normalize(expanded, cfg);
          const { term: normalizedTerm, kind, steps } = runResult;
          const nd = buildNormDefs(defs, { maxSteps: merged.maxStepsIdent, maxSize: merged.maxSize });
          printInfos.push({
            src:    prettyPrint(stmt.term),
            result: prettyPrint(normalizedTerm),
            normal: kind === "normalForm",
            steps,
            size:   kind === "sizeLimit" ? runResult.size : undefined,
            match:  kind === "normalForm" ? findMatch(normalizedTerm, nd) : undefined,
            offset: stmt.offset,
            line:   currentLine,
          });
          exprInfos.push({ term: stmt.term, positions: globalPositions });
        }
        break;
      }

      case "equiv": {
        const merged = { ...defaultConfig, ...pragmaConfig };
        const cfg = { maxSteps: merged.maxStepsIdent, maxSize: merged.maxSize };
        const currentLine = input.slice(0, stmt.offset).split("\n").length;

        if (stmt.bindings) {
          // ── ≡ comprehension ───────────────────────────────────────────────
          const bindingNames = new Set(stmt.bindings.map(b => b.name));
          const defsFiltered = new Map([...defs].filter(([k]) => !bindingNames.has(k)));
          const baseT1 = expandDefs(stmt.atom1, defsFiltered);
          const baseT2 = expandDefs(stmt.atom2, defsFiltered);
          const src1 = prettyPrint(stmt.atom1);
          const src2 = prettyPrint(stmt.atom2);

          const expandedBindings = stmt.bindings.map(b => ({
            name: b.name,
            expandedValues: b.termValues.map(v => expandDefs(v, defsFiltered)),
            valueSrcs: b.termValues.map(v => prettyPrint(v)),
          }));

          const valueCombos = cartesian(expandedBindings.map(b =>
            b.expandedValues.map((ev, vi) => ({ name: b.name, valueSrc: b.valueSrcs[vi], valueTerm: ev }))
          ));

          const rows: EquivComprehensionRow[] = [];
          let allPassed = true;
          for (const combo of valueCombos) {
            const substs = combo.map(c => ({ name: c.name, value: c.valueTerm }));
            const w1 = applySubsts(baseT1, substs);
            const w2 = applySubsts(baseT2, substs);
            const r1 = normalize(w1, cfg);
            const r2 = normalize(w2, cfg);
            const terminated = r1.kind === "normalForm" && r2.kind === "normalForm";
            const equivalent = terminated && alphaEq(r1.term, r2.term);
            if (!equivalent) allPassed = false;
            rows.push({
              substExpr1: formatSubstExpr(src1, combo.map(c => ({ name: c.name, value: c.valueSrc }))),
              substExpr2: formatSubstExpr(src2, combo.map(c => ({ name: c.name, value: c.valueSrc }))),
              norm1: prettyPrint(r1.term),
              norm2: prettyPrint(r2.term),
              equivalent,
              terminated,
            });
          }

          const compBindings: ComprehensionBinding[] = stmt.bindings.map((b, bi) => ({
            name: b.name,
            values: expandedBindings[bi].valueSrcs,
          }));
          equivComprehensionInfos.push({ src1, src2, bindings: compBindings, rows, allPassed, offset: stmt.offset, line: currentLine });
          if (!allPassed) equivFailed.value = true;
          exprInfos.push({ term: App(stmt.atom1, stmt.atom2), positions: globalPositions });
        } else {
          // ── regular ≡ ─────────────────────────────────────────────────────
          const t1 = expandDefs(stmt.atom1, defs);
          const t2 = expandDefs(stmt.atom2, defs);
          const r1 = normalize(t1, cfg);
          const r2 = normalize(t2, cfg);
          const terminated = r1.kind === "normalForm" && r2.kind === "normalForm";
          const equivalent = terminated && alphaEq(r1.term, r2.term);
          equivInfos.push({
            src1: prettyPrint(stmt.atom1),
            src2: prettyPrint(stmt.atom2),
            norm1: prettyPrint(r1.term),
            norm2: prettyPrint(r2.term),
            equivalent,
            terminated,
            offset: stmt.offset,
            line: currentLine,
          });
          if (!equivalent) equivFailed.value = true;
          exprInfos.push({ term: App(stmt.atom1, stmt.atom2), positions: globalPositions });
        }
        break;
      }

      case "expr": {
        rawExpr = stmt.term;
        expr    = expandDefs(stmt.term, defs);
        exprInfos.push({ term: stmt.term, positions: globalPositions });
        break;
      }
    }
  }

  return {
    ok: !equivFailed.value && errors.filter(e => e.kind !== "warning").length === 0,
    errors,
    defs,
    expr,
    rawExpr,
    defInfos,
    exprInfos,
    printInfos,
    equivInfos,
    printComprehensionInfos,
    equivComprehensionInfos,
    pragmaConfig,
  };
}
