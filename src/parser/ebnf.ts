// EBNF generator — formats the live Chevrotain grammar as plain-text BNF.
// Used at runtime by the Help modal's Grammar tab and at build time by
// scripts/gen-grammar.ts to regenerate docs/grammar.md.

import { parser } from "./parser";

type Gast = { type: string; name?: string; definition?: Gast[] };

const TOKEN_LABELS: Record<string, string> = {
  Directive:     "':…'",
  CmdPrint:      "':print'",
  CmdAssert:     "':assert'",
  CmdAssertNot:  "':assert-not'",
  CmdEval:       "':eval'",
  NewLine:       "'\\n'",
  Semi:          "';'",
  Pi:            "'π'",
  Equiv:         "'≡'",
  NEquiv:        "'≢'",
  DefAssign:     "':='",
  RedefAssign:   "'::='",
  Dot:           "'.'",
  Lambda:        "'λ'",
  LParen:        "'('",
  RParen:        "')'",
  LBracket:      "'['",
  RBracket:      "']'",
  LBrace:        "'{'",
  RBrace:        "'}'",
  Comma:         "','",
  Identifier:    "identifier",
  PlainIdent:    "plainIdent",
  BacktickIdent: "backtickIdent",
  EagerBinder:   "eagerBinder",
};

function fmtAtom(g: Gast): string {
  switch (g.type) {
    case "Terminal":    return TOKEN_LABELS[g.name!] ?? g.name!;
    case "NonTerminal": return g.name!;
    case "Alternation": return `(${fmtGroup(g)})`;
    default:            return fmtGroup(g);
  }
}

function needsParens(defs: Gast[]): boolean {
  return defs.length > 1 || (defs.length === 1 && defs[0].type === "Alternation");
}

function wrap(defs: Gast[], suffix: string): string {
  // Special case: a single Alternation. fmtSeq → fmtAtom would add parens, and
  // we'd add them again here — call fmtGroup directly to keep it to one pair.
  if (defs.length === 1 && defs[0].type === "Alternation") {
    return `(${fmtGroup(defs[0])})${suffix}`;
  }
  const inner = fmtSeq(defs);
  return needsParens(defs) ? `(${inner})${suffix}` : `${inner}${suffix}`;
}

function fmtGroup(g: Gast): string {
  const d = g.definition ?? [];
  switch (g.type) {
    case "Option":              return wrap(d, "?");
    case "Repetition":          return wrap(d, "*");
    case "RepetitionMandatory": return wrap(d, "+");
    case "Alternation":         return d.map(alt => fmtSeq(alt.definition ?? []) || "EOF").join(" | ");
    case "Alternative":         return fmtSeq(d);
    default:                    return `[${g.type}]`;
  }
}

function fmtSeq(defs: Gast[]): string {
  return defs.map(fmtAtom).join(" ");
}

// Format a rule body. A bare top-level alternation prints without surrounding
// parens (parens only matter when an alternation is nested inside a sequence).
function fmtRuleBody(defs: Gast[]): string {
  if (defs.length === 1 && defs[0].type === "Alternation") return fmtGroup(defs[0]);
  return fmtSeq(defs);
}

export function generateEBNF(): string {
  const rules = parser.getSerializedGastProductions() as Gast[];
  const maxLen = Math.max(...rules.map(r => r.name!.length), "backtickIdent".length);
  const pad = (s: string) => s.padEnd(maxLen);
  const body = rules
    .map(r => `${pad(r.name!)}  ::=  ${fmtRuleBody(r.definition ?? [])}`)
    .join("\n");
  return body
    + `\n${pad("identifier")}  ::=  plainIdent | backtickIdent`
    + `\n${pad("plainIdent")}  ::=  (alnum | '_' | "'" | greek | op-sym)+`
    + `\n${pad("backtickIdent")}  ::=  '\`' [^\`\\n]+ '\`'`
    + `\n${pad("eagerBinder")}  ::=  'β' identifier    -- β fused to name, no whitespace (call-by-value binder)`;
}
