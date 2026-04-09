import { CstParser, CstNode, IToken, tokenMatcher, EOF } from "chevrotain";
import {
  allTokens,
  LambdaLexer,
  Pragma,
  Backslash,
  Pi,
  Equiv,
  NEquiv,
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

  // Look ahead: skip Identifier* and check if the next token is DefAssign.
  // If so, we're looking at a definition. This disambiguates `f x := body` from `f x y`.
  private isDefinition(): boolean {
    let i = 1;
    while (tokenMatcher(this.LA(i), Identifier)) i++;
    return tokenMatcher(this.LA(i), DefAssign);
  }



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

  nequivStmt = this.RULE("nequivStmt", () => {
    this.CONSUME(NEquiv);
    this.OPTION(() => this.SUBRULE(this.comprehensionSpec));
    this.SUBRULE(this.atom);    // first operand
    this.SUBRULE2(this.atom);   // second operand
  });

  definition = this.RULE("definition", () => {
    // Consume Identifier tokens until DefAssign — stops naturally when next is not Identifier
    this.AT_LEAST_ONE(() => this.CONSUME(Identifier));
    this.CONSUME(DefAssign);
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
    this.CONSUME(Backslash);
    this.AT_LEAST_ONE(() => {
      this.CONSUME(Identifier);
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

type RawBinding  = { name: string; nameTok: IToken; termValues: Term[] };
type RawEmpty    = { kind: "empty" };
type RawPragma   = { kind: "pragma"; text: string; offset: number };
type RawDef      = { kind: "def"; name: string; nameTok: IToken; params: IToken[]; rawBody: Term; bodyTerm: Term; offset: number };
type RawPrint    = { kind: "print"; term: Term; bindings: RawBinding[] | null; offset: number };
type RawEquiv    = { kind: "equiv"; atom1: Term; atom2: Term; bindings: RawBinding[] | null; negated: boolean; offset: number };
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
    return (ctx.programItem ?? []).flatMap((item: CstNode) => {
      try {
        const stmt = this.visit(item) as RawStmt;
        return stmt ? [stmt] : [];
      } catch { return []; }
    });
  }

  programItem(ctx: any): RawStmt {
    if (ctx.pragmaLine)  return this.visit(ctx.pragmaLine[0]) as RawStmt;
    if (ctx.statement)   return this.visit(ctx.statement[0])  as RawStmt;
    return { kind: "empty" };
  }

  statementSep(_ctx: any): void { /* separator only — no AST contribution */ }

  statement(ctx: any): RawStmt {
    if (ctx.printStmt)      return this.visit(ctx.printStmt[0])      as RawStmt;
    if (ctx.equivStmt)      return this.visit(ctx.equivStmt[0])      as RawStmt;
    if (ctx.nequivStmt)     return this.visit(ctx.nequivStmt[0])     as RawStmt;
    if (ctx.definition)     return this.visit(ctx.definition[0])     as RawStmt;
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
    return {
      param:    tokenName(tok),
      paramTok: tok,
      arg:      this.visit(ctx.term),
    };
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
  allowEta?:       boolean;
};

export const KNOWN_PRAGMAS: Record<string, (keyof PragmaConfig)[]> = {
  "max-steps":       ["maxStepsPrint", "maxStepsIdent"],
  "max-steps-print": ["maxStepsPrint"],
  "max-steps-ident": ["maxStepsIdent"],
  "max-history":     ["maxHistory"],
  "normalize-defs":  ["normalizeDefs"],
  "max-size":        ["maxSize"],
  "allow-eta":       ["allowEta"],
};

export const BOOLEAN_PRAGMAS = new Set<string>(["normalize-defs", "allow-eta"]);

export type EquivInfo = {
  src1: string; src2: string;
  norm1: string; norm2: string;
  equivalent: boolean;
  terminated: boolean;
  negated: boolean;
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
  negated: boolean;
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
  exprInfos:  { term: Term; positions: PositionMap; boundNames?: Set<string>; paramPositions?: Pos[] }[];
  printInfos: { src: string; result: string; normal: boolean; steps: number; size?: number; match?: string; offset: number; line: number }[];
  equivInfos: EquivInfo[];
  printComprehensionInfos: PrintComprehensionInfo[];
  equivComprehensionInfos: EquivComprehensionInfo[];
  pragmaConfig: PragmaConfig;
};

export type ProgramRunConfig = { maxStepsPrint?: number; maxStepsIdent?: number; maxSize?: number; allowEta?: boolean };

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

const mixinCache = new Map<string, ProgramResult>();

function defsKey(defs: Map<string, Term>): string {
  return [...defs.entries()].sort(([a], [b]) => a < b ? -1 : 1)
    .map(([k, v]) => `${k}:${prettyPrint(v)}`).join("|");
}

function cachedParseMixin(
  path: string,
  content: string,
  defaultConfig: ProgramRunConfig,
  resolver: IncludeResolver,
  includeStack: string[],
  initialDefs: Map<string, Term>,
): ProgramResult {
  const key = path + "\0" + content + "\0" + defsKey(initialDefs);
  const cached = mixinCache.get(key);
  if (cached) return cached;
  const result = parseProgram(content, defaultConfig, resolver, includeStack, initialDefs);
  mixinCache.set(key, result);
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
  return `(${src})${substs.map(s => `[${s.name}:=${s.value}]`).join("")}`;
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
  const mixinMatch = text.match(/^mixin\s+"([^"]+)"\s*$/);
  if (mixinMatch) {
    const path = mixinMatch[1];
    if (includeStack.includes(path)) {
      errors.push({ message: `Circular mixin: "${path}"`, offset });
      return;
    }
    const content = resolver(path);
    if (content === null) {
      errors.push({ message: `Mixin not found: "${path}"`, offset });
      return;
    }
    const mixed = cachedParseMixin(path, content, defaultConfig, resolver, [...includeStack, path], defs);
    for (const e of mixed.errors)
      errors.push({ ...e, source: e.source ?? path });
    if (!mixed.ok) {
      equivFailed.value = true;
      const hasRealErrors = mixed.errors.some(e => e.kind !== "warning");
      if (!hasRealErrors)
        errors.push({ message: `Assertion failed in mixin "${path}"`, offset });
    }
    for (const [name, term] of mixed.defs) {
      if (defs.has(name)) {
        const oldNorm = normalize(defs.get(name)!).term;
        const newNorm = normalize(term).term;
        if (!alphaEq(oldNorm, newNorm))
          errors.push({ message: `Warning: '${name}' redefined with a different normal form (from mixin "${path}")`, offset, kind: "warning" });
      }
      defs.set(name, term);
    }
    return;
  }

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
    if (!included.ok) {
      equivFailed.value = true;
      const hasRealErrors = included.errors.some(e => e.kind !== "warning");
      if (!hasRealErrors)
        errors.push({ message: `Assertion failed in included file "${path}"`, offset });
    }
    for (const [name, term] of included.defs) {
      if (defs.has(name)) {
        const oldNorm = normalize(defs.get(name)!).term;
        const newNorm = normalize(term).term;
        if (!alphaEq(oldNorm, newNorm))
          errors.push({ message: `Warning: '${name}' redefined with a different normal form (from include "${path}")`, offset, kind: "warning" });
      }
      defs.set(name, term);
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
  initialDefs: Map<string, Term> = new Map(),
): ProgramResult {
  const defs = new Map(initialDefs);
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

  // Ensure input ends with a newline so the last statement always has a terminator.
  // This fixes syntax highlighting when the last line is incomplete (e.g. a bare ≡).
  if (!input.endsWith("\n")) input += "\n";

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
  let stmts: RawStmt[] = [];
  try {
    const visited = astBuilder.visit(cst);
    if (Array.isArray(visited)) stmts = visited as RawStmt[];
  } catch {
    // partial CST from error recovery — handled below
  }

  // Chevrotain's error recovery can corrupt the whole program CST.
  // Fall back: re-parse only the tokens before the first error token.
  if (stmts.length === 0 && parser.errors.length > 0) {
    const firstErrOffset = parser.errors[0].token.startOffset ?? Infinity;
    // Cut at the last newline before the error so we only include complete statements
    const newlinesBefore = lexResult.tokens.filter(
      t => tokenMatcher(t, NewLine) && (t.startOffset ?? 0) < firstErrOffset
    );
    const cutoff = newlinesBefore.length > 0
      ? (newlinesBefore[newlinesBefore.length - 1].endOffset ?? newlinesBefore[newlinesBefore.length - 1].startOffset)
      : -1;
    const prefixTokens = lexResult.tokens.filter(t => (t.startOffset ?? 0) <= cutoff);
    if (prefixTokens.length > 0) {
      parser.input = prefixTokens;
      const prefixCst = parser.program();
      if (parser.errors.length === 0) {
        astBuilder.reset(0);
        try {
          const visited = astBuilder.visit(prefixCst);
          if (Array.isArray(visited)) stmts = visited as RawStmt[];
        } catch {}
      }
    }
  }

  // Shared positions map (accumulated across all statements during the visitor pass above)
  const globalPositions = astBuilder.positions;

  // Helper: extract bound names and declaration positions from comprehension bindings.
  const compBindingHighlight = (bindings: RawBinding[] | null) => bindings ? {
    boundNames:     new Set(bindings.map(b => b.name)),
    paramPositions: bindings.map(b => ({ from: b.nameTok.startOffset, to: (b.nameTok.endOffset ?? b.nameTok.startOffset) + 1 })),
  } : {};

  // ── Semantic analysis ──────────────────────────────────────────────────────
  for (const stmt of stmts) {
    if (equivFailed.value) {
      // Execution stopped, but still collect terms for syntax highlighting.
      switch (stmt.kind) {
        case "def":
          defInfos.push({ name: stmt.name, namePos: { from: stmt.nameTok.startOffset, to: (stmt.nameTok.endOffset ?? stmt.nameTok.startOffset) + 1 }, body: stmt.rawBody, positions: globalPositions });
          break;
        case "print":
          exprInfos.push({ term: stmt.term, positions: globalPositions, ...compBindingHighlight(stmt.bindings) });
          for (const b of stmt.bindings ?? []) for (const v of b.termValues) exprInfos.push({ term: v, positions: globalPositions });
          break;
        case "equiv":
          exprInfos.push({ term: App(stmt.atom1, stmt.atom2), positions: globalPositions, ...compBindingHighlight(stmt.bindings) });
          for (const b of stmt.bindings ?? []) for (const v of b.termValues) exprInfos.push({ term: v, positions: globalPositions });
          break;
        case "expr":
          exprInfos.push({ term: stmt.term, positions: globalPositions });
          break;
      }
      continue;
    }

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
          const { term: normalized, kind } = normalize(body, { maxSteps: merged.maxStepsIdent, maxSize: merged.maxSize, allowEta: merged.allowEta });
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
        const cfg = { maxSteps: merged.maxStepsPrint, maxSize: merged.maxSize, allowEta: merged.allowEta };
        const currentLine = input.slice(0, stmt.offset).split("\n").length;

        if (stmt.bindings) {
          // ── π comprehension ──────────────────────────────────────────────
          const bindingNames = new Set(stmt.bindings.map(b => b.name));
          const defsFiltered = new Map([...defs].filter(([k]) => !bindingNames.has(k)));
          const expandedBase = expandDefs(stmt.term, defsFiltered);
          const baseSrc = prettyPrint(stmt.term);
          const nd = buildNormDefs(defs, { maxSteps: merged.maxStepsIdent, maxSize: merged.maxSize, allowEta: merged.allowEta });

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
          exprInfos.push({ term: stmt.term, positions: globalPositions, ...compBindingHighlight(stmt.bindings) });
          for (const b of stmt.bindings) for (const v of b.termValues) exprInfos.push({ term: v, positions: globalPositions });
        } else {
          // ── regular π ────────────────────────────────────────────────────
          const expanded = expandDefs(stmt.term, defs);
          const runResult = normalize(expanded, cfg);
          const { term: normalizedTerm, kind, steps } = runResult;
          const nd = buildNormDefs(defs, { maxSteps: merged.maxStepsIdent, maxSize: merged.maxSize, allowEta: merged.allowEta });
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
        const cfg = { maxSteps: merged.maxStepsIdent, maxSize: merged.maxSize, allowEta: merged.allowEta };
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
            const passed = stmt.negated ? !equivalent : equivalent;
            if (!passed) allPassed = false;
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
          equivComprehensionInfos.push({ src1, src2, bindings: compBindings, rows, allPassed, negated: stmt.negated, offset: stmt.offset, line: currentLine });
          if (!allPassed) equivFailed.value = true;
          exprInfos.push({ term: App(stmt.atom1, stmt.atom2), positions: globalPositions, ...compBindingHighlight(stmt.bindings) });
          for (const b of stmt.bindings) for (const v of b.termValues) exprInfos.push({ term: v, positions: globalPositions });
        } else {
          // ── regular ≡ ─────────────────────────────────────────────────────
          const t1 = expandDefs(stmt.atom1, defs);
          const t2 = expandDefs(stmt.atom2, defs);
          const r1 = normalize(t1, cfg);
          const r2 = normalize(t2, cfg);
          const terminated = r1.kind === "normalForm" && r2.kind === "normalForm";
          const equivalent = terminated && alphaEq(r1.term, r2.term);
          const passed = stmt.negated ? !equivalent : equivalent;
          equivInfos.push({
            src1: prettyPrint(stmt.atom1),
            src2: prettyPrint(stmt.atom2),
            norm1: prettyPrint(r1.term),
            norm2: prettyPrint(r2.term),
            equivalent,
            terminated,
            negated: stmt.negated,
            offset: stmt.offset,
            line: currentLine,
          });
          if (!passed) equivFailed.value = true;
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
