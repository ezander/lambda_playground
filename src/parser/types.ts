import { Term, Var, Abs, Pos } from "./ast";

// ── Error type ────────────────────────────────────────────────────────────────

export type LambdaError = {
  message:   string;
  offset?:   number;
  kind?:     "error" | "warning" | "assert-fail";
  source?:   string;
  location?: string;  // pre-computed "line:col" for errors from included files
  via?:      string;  // direct include path when error is transitive
};

export function errLocation(content: string, offset: number): string {
  const line = (content.slice(0, offset).match(/\n/g)?.length ?? 0) + 1;
  const col  = offset - content.lastIndexOf("\n", offset - 1);
  return `${line}:${col}`;
}

// ── Position map ──────────────────────────────────────────────────────────────

export type PositionMap = {
  vars:   WeakMap<Var, Pos>;
  params: WeakMap<Abs, Pos>;
};

// ── Parse result (single expression) ─────────────────────────────────────────

export type ParseResult =
  | { ok: true;  term: Term; positions: PositionMap }
  | { ok: false; errors: LambdaError[] };

// ── Program result types ──────────────────────────────────────────────────────

export type DefInfo = {
  name:      string;
  namePos:   Pos;
  body:      Term;
  positions: PositionMap;
};

export type PragmaConfig = {
  maxStepsPrint?: number;
  maxStepsIdent?: number;
  maxHistory?:    number;
  normalizeDefs?: boolean;
  maxSize?:       number;
  allowEta?:      boolean;
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
  negated:    boolean;
  offset:     number;
  line:       number;
};

export type ComprehensionBinding = { name: string; values: string[] };

export type PrintComprehensionRow = {
  substExpr: string;
  result:    string;
  normal:    boolean;
  steps:     number;
  size?:     number;
  match?:    string;
};

export type PrintComprehensionInfo = {
  src:      string;
  bindings: ComprehensionBinding[];
  rows:     PrintComprehensionRow[];
  offset:   number;
  line:     number;
};

export type EquivComprehensionRow = {
  substExpr1:  string;
  substExpr2:  string;
  norm1:       string;
  norm2:       string;
  equivalent:  boolean;
  terminated:  boolean;
};

export type EquivComprehensionInfo = {
  src1:      string;
  src2:      string;
  bindings:  ComprehensionBinding[];
  rows:      EquivComprehensionRow[];
  allPassed: boolean;
  negated:   boolean;
  offset:    number;
  line:      number;
};

export type ProgramResult = {
  ok:          boolean;
  errors:      LambdaError[];
  defs:        Map<string, Term>;
  quietDefs:   Set<string>;
  expr:        Term | null;
  rawExpr:     Term | null;
  defInfos:    DefInfo[];
  exprInfos:   { term: Term; positions: PositionMap; boundNames?: Set<string>; paramPositions?: Pos[]; offset: number }[];
  printInfos:  { src: string; result: string; normal: boolean; steps: number; size?: number; match?: string; offset: number; line: number }[];
  equivInfos:  EquivInfo[];
  printComprehensionInfos: PrintComprehensionInfo[];
  equivComprehensionInfos: EquivComprehensionInfo[];
  pragmaConfig: PragmaConfig;
};

export type ProgramRunConfig = {
  maxStepsPrint?: number;
  maxStepsIdent?: number;
  maxSize?:       number;
  allowEta?:      boolean;
};

export type IncludeResolver = (path: string) => string | null;
