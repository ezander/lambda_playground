import { Term, Var, Abs, Pos } from "./ast";
import { RunStats } from "../evaluator/eval";

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

export type DefEntry = {
  term:   Term;       // normalized/expanded body
  offset: number;     // source offset where name becomes available (def line or :import line)
  quiet:  boolean;    // hidden from autocomplete and match list
  infix:  boolean;    // marked as infix operator via :infix directive
  canon?: string;     // alpha-canonical form, set only when the def's body reaches normal form
};

export type DefInfo = {
  name:      string;
  namePos:   Pos;
  body:      Term;
  positions: PositionMap;
};

export type OptionsConfig = {
  maxStepsPrint?:  number;
  maxStepsIdent?:  number;
  maxHistory?:     number;
  maxHistorySize?: number;
  normalizeDefs?:  boolean;
  maxSize?:        number;
  allowEta?:       boolean;
};

// Option keys are split by value type so the parser can assign without casts.
type NumericOptionKey = "maxStepsPrint" | "maxStepsIdent" | "maxHistory" | "maxHistorySize" | "maxSize";
type BooleanOptionKey = "normalizeDefs" | "allowEta";

export const NUMERIC_OPTIONS: Record<string, NumericOptionKey[]> = {
  "max-steps":        ["maxStepsPrint", "maxStepsIdent"],
  "max-steps-print":  ["maxStepsPrint"],
  "max-steps-ident":  ["maxStepsIdent"],
  "max-history":      ["maxHistory"],
  "max-history-size": ["maxHistorySize"],
  "max-size":         ["maxSize"],
};

export const BOOLEAN_OPTIONS: Record<string, BooleanOptionKey[]> = {
  "normalize-defs":  ["normalizeDefs"],
  "allow-eta":       ["allowEta"],
};

export type EquivInfo = {
  src1: string; src2: string;
  norm1: string; norm2: string;
  equivalent: boolean;
  terminated: boolean;
  negated:    boolean;
  offset:     number;
  line:       number;
  endOffset:  number;
  notRun?:    boolean;  // auto-run was off when this statement was parsed
  stats1?:    RunStats; // lhs normalize stats
  stats2?:    RunStats; // rhs normalize stats
};

export type ComprehensionBinding = { name: string; values: string[] };

export type RunKind = "normalForm" | "stepLimit" | "sizeLimit";

export type PrintComprehensionRow = {
  substExpr: string;
  result:    string;
  runKind:   RunKind;
  match?:    string;
  stats?:    RunStats;
};

export type PrintComprehensionInfo = {
  src:      string;
  bindings: ComprehensionBinding[];
  rows:     PrintComprehensionRow[];
  offset:   number;
  line:     number;
  endOffset: number;
  notRun?:  boolean;
};

export type EquivComprehensionRow = {
  substExpr1:  string;
  substExpr2:  string;
  norm1:       string;
  norm2:       string;
  equivalent:  boolean;
  terminated:  boolean;
  stats1?:     RunStats;
  stats2?:     RunStats;
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
  endOffset: number;
  notRun?:   boolean;
};

export type ProgramResult = {
  ok:          boolean;
  errors:      LambdaError[];
  defs:        Map<string, DefEntry>;
  expr:        Term | null;
  rawExpr:     Term | null;
  defInfos:    DefInfo[];
  exprInfos:   { term: Term; positions: PositionMap; boundNames?: Set<string>; paramPositions?: Pos[]; offset: number }[];
  printInfos:  { src: string; result: string; runKind?: RunKind; match?: string; offset: number; line: number; endOffset: number; notRun?: boolean; stats?: RunStats }[];
  equivInfos:  EquivInfo[];
  printComprehensionInfos: PrintComprehensionInfo[];
  equivComprehensionInfos: EquivComprehensionInfo[];
  options:      OptionsConfig;
  timing?: {
    parse:        number;  // ms — lex + parse + visit
    evalTotal:    number;  // ms — sum of normalize() calls
    prettyTotal:  number;  // ms — sum of prettyPrint() calls
    matchTotal:   number;  // ms — sum of findMatch() calls
  };
};

export type ProgramRunConfig = {
  maxStepsPrint?: number;
  maxStepsIdent?: number;
  maxSize?:       number;
  allowEta?:      boolean;
  runEval?:       boolean;  // when false, skip all normalize calls (auto-run off)
};

export type IncludeResolver = (path: string) => string | null;
