import { ViewPlugin, ViewUpdate, Decoration, DecorationSet, hoverTooltip } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
import { RangeSetBuilder, StateField, StateEffect, Extension } from "@codemirror/state";
import { IToken, tokenMatcher } from "chevrotain";
import { ProgramResult, PositionMap, DefEntry } from "./parser/parser";
import { Term, Var, Abs } from "./parser/ast";
import {
  LambdaLexer,
  Directive,
  CmdPrint,
  CmdAssert,
  CmdAssertNot,
  CmdEval,
  LineComment,
  BlockComment,
  UnterminatedBlockComment,
  Lambda,
  Pi,
  Equiv,
  RedefAssign,
  DefAssign,
  Dot,
  NEquiv,
  findDirectiveCommentStart,
} from "./parser/lexer";

// ── StateField: receives ProgramResult from React on every parse ──────────────

export const setParsed = StateEffect.define<ProgramResult | null>();

export const parsedField = StateField.define<ProgramResult | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects)
      if (e.is(setParsed)) return e.value;
    return value;
  },
});

// ── Pure highlight range computation (testable, no CM6 dependency) ────────────

export type HighlightRange = { from: number; to: number; cls: string };

function applyTokenRanges(
  lexResult: { tokens: IToken[]; groups: Record<string, IToken[]> },
  out: HighlightRange[],
): void {
  for (const tok of lexResult.groups["comment"] ?? []) {
    const from = tok.startOffset;
    const to = (tok.endOffset ?? tok.startOffset) + 1;
    out.push({ from, to, cls: "cml-comment" });
  }
  for (const tok of lexResult.tokens) {
    const from = tok.startOffset;
    const to = (tok.endOffset ?? tok.startOffset) + 1;
    if (tok.tokenType === Directive) {
      // Split off the trailing line-comment if present, so '# ...' inside a
      // directive line is highlighted as a comment rather than as part of the
      // pragma. # inside the quoted path stays part of the directive.
      const commentStart = findDirectiveCommentStart(tok.image);
      if (commentStart === -1) {
        out.push({ from, to, cls: "cml-pragma" });
      } else {
        out.push({ from, to: from + commentStart,            cls: "cml-pragma" });
        out.push({ from: from + commentStart, to,             cls: "cml-comment" });
      }
    } else if (tokenMatcher(tok, DefAssign) || tok.tokenType === RedefAssign)
      out.push({ from, to, cls: "cml-op" });
    else if (tokenMatcher(tok, Lambda) || tokenMatcher(tok, Dot))
      out.push({ from, to, cls: "cml-lambda" });
    else if (tok.tokenType === Pi || tok.tokenType === Equiv || tok.tokenType === NEquiv)
      out.push({ from, to, cls: "cml-pi" });
    else if (tok.tokenType === CmdPrint || tok.tokenType === CmdAssert || tok.tokenType === CmdAssertNot || tok.tokenType === CmdEval)
      out.push({ from, to, cls: "cml-pi" });
  }
}

function isDefAvailable(name: string, defs: Map<string, DefEntry>, beforeOffset: number): boolean {
  const entry = defs.get(name);
  return entry !== undefined && entry.offset < beforeOffset;
}

function walkTerm(
  term: Term,
  positions: PositionMap,
  defs: Map<string, DefEntry>,
  stmtOffset: number,
  bound: Set<string>,
  out: HighlightRange[],
): void {
  switch (term.kind) {
    case "Var": {
      const pos = positions.vars.get(term as Var);
      if (pos) {
        const cls = bound.has(term.name)                          ? "cml-bound"
                  : isDefAvailable(term.name, defs, stmtOffset)   ? "cml-def-use"
                  :                                                  "cml-free";
        out.push({ from: pos.from, to: pos.to, cls });
      }
      break;
    }
    case "Abs": {
      const paramPos = positions.params.get(term as Abs);
      if (paramPos) out.push({ from: paramPos.from, to: paramPos.to, cls: "cml-param" });
      walkTerm(term.body, positions, defs, stmtOffset, new Set([...bound, term.param]), out);
      break;
    }
    case "App": {
      walkTerm(term.func, positions, defs, stmtOffset, bound, out);
      walkTerm(term.arg,  positions, defs, stmtOffset, bound, out);
      break;
    }
    case "Subst":
      break; // only produced during evaluation, never appears in parsed programs
  }
}

export function computeHighlightRanges(
  fullText: string,
  parsed: ProgramResult | null,
): HighlightRange[] {
  const out: HighlightRange[] = [];

  const lexResult = LambdaLexer.tokenize(fullText);
  applyTokenRanges(lexResult, out);

  if (parsed) {
    // Process defs and expressions in source order. Variable classification
    // (def-use vs free) is determined by checking parsed.defs offset — a name
    // is def-use only if its DefEntry.offset < the current statement's offset.
    type HlDefEntry  = { kind: "def";  offset: number; name: string; namePos: { from: number; to: number }; body: import("./parser/ast").Term; positions: PositionMap };
    type HlExprEntry = { kind: "expr"; offset: number; term: import("./parser/ast").Term; positions: PositionMap; boundNames?: Set<string>; paramPositions?: { from: number; to: number }[] };

    const entries: (HlDefEntry | HlExprEntry)[] = [
      ...parsed.defInfos.map(d => ({ kind: "def" as const, offset: d.namePos.from, ...d })),
      ...parsed.exprInfos.map(e => ({ kind: "expr" as const, ...e })),
    ];
    entries.sort((a, b) => a.offset - b.offset);

    for (const entry of entries) {
      if (entry.kind === "def") {
        out.push({ from: entry.namePos.from, to: entry.namePos.to, cls: "cml-def-name" });
        walkTerm(entry.body, entry.positions, parsed.defs, entry.offset, new Set(), out);
      } else {
        for (const pos of entry.paramPositions ?? [])
          out.push({ from: pos.from, to: pos.to, cls: "cml-param" });
        walkTerm(entry.term, entry.positions, parsed.defs, entry.offset, entry.boundNames ?? new Set(), out);
      }
    }

    for (const err of parsed.errors) {
      if (err.offset == null) continue;
      const lineStart = fullText.lastIndexOf("\n", err.offset - 1) + 1;
      const lineEnd   = fullText.indexOf("\n", err.offset);
      const to = lineEnd === -1 ? fullText.length : lineEnd;
      if (lineStart < to) {
        const cls = err.kind === "warning" ? "cml-warning" : "cml-error";
        out.push({ from: lineStart, to, cls });
      }
    }
    // Dim only after a hard parse/semantic error — not after a failed assertion.
    const firstHardError = parsed.errors.find(e => e.kind !== "warning" && e.kind !== "assert-fail" && e.offset != null);
    if (firstHardError?.offset != null && firstHardError.offset < fullText.length) {
      out.push({ from: firstHardError.offset, to: fullText.length, cls: "cml-unparsed" });
    }
  }

  out.sort((a, b) => a.from - b.from || a.to - b.to);
  return out;
}

// ── CM6 ViewPlugin ────────────────────────────────────────────────────────────

const clsToMark: Record<string, Decoration> = {};
function mark(cls: string): Decoration {
  return clsToMark[cls] ?? (clsToMark[cls] = Decoration.mark({ class: cls }));
}

function buildDecorations(view: EditorView): DecorationSet {
  const fullText = view.state.doc.toString();
  const parsed   = view.state.field(parsedField);
  const ranges   = computeHighlightRanges(fullText, parsed);
  const docLen   = view.state.doc.length;
  const builder  = new RangeSetBuilder<Decoration>();
  for (const { from, to, cls } of ranges)
    if (from >= 0 && to <= docLen && from < to)
      builder.add(from, to, mark(cls));
  return builder.finish();
}

// ── Hover tooltips for errors and warnings ────────────────────────────────────

export const lambdaDiagnosticTooltip: Extension = hoverTooltip((view, pos) => {
  const parsed = view.state.field(parsedField);
  if (!parsed) return null;
  const fullText = view.state.doc.toString();

  const messages: string[] = [];
  for (const err of parsed.errors) {
    if (err.offset == null) continue;
    const lineStart = fullText.lastIndexOf("\n", err.offset - 1) + 1;
    const lineEnd   = fullText.indexOf("\n", err.offset);
    const to = lineEnd === -1 ? fullText.length : lineEnd;
    if (pos >= lineStart && pos <= to)
      messages.push(err.message);
  }
  if (messages.length === 0) return null;

  return {
    pos,
    above: true,
    create() {
      const dom = document.createElement("div");
      dom.className = "cml-tooltip";
      dom.textContent = messages.join("\n");
      return { dom };
    },
  };
});

export const lambdaHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildDecorations(view); }
    update(update: ViewUpdate) {
      if (update.state.field(parsedField) !== update.startState.field(parsedField))
        this.decorations = buildDecorations(update.view);
      else if (update.docChanged)
        this.decorations = this.decorations.map(update.changes);
    }
  },
  { decorations: (v) => v.decorations },
);
