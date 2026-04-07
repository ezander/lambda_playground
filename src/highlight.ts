import { ViewPlugin, ViewUpdate, Decoration, DecorationSet } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
import { RangeSetBuilder, StateField, StateEffect } from "@codemirror/state";
import { IToken, tokenMatcher } from "chevrotain";
import { ProgramResult, PositionMap } from "./parser/parser";
import { Term, Var, Abs } from "./parser/ast";
import {
  LambdaLexer,
  Pragma,
  LineComment,
  BlockComment,
  UnterminatedBlockComment,
  Backslash,
  Pi,
  Equiv,
  DefAssign,
  Dot,
} from "./parser/lexer";

// ── Decoration marks ──────────────────────────────────────────────────────────

const mComment  = Decoration.mark({ class: "cml-comment" });
const mPragma   = Decoration.mark({ class: "cml-pragma" });
const mOp       = Decoration.mark({ class: "cml-op" });
const mLambda   = Decoration.mark({ class: "cml-lambda" });
const mPi       = Decoration.mark({ class: "cml-pi" });
const mDefName  = Decoration.mark({ class: "cml-def-name" });
const mDefUse   = Decoration.mark({ class: "cml-def-use" });
const mBound    = Decoration.mark({ class: "cml-bound" });
const mParam    = Decoration.mark({ class: "cml-param" });
const mFree     = Decoration.mark({ class: "cml-free" });

type Tk = { from: number; to: number; m: Decoration };

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

// ── Token-based structural highlighting ───────────────────────────────────────
// Re-tokenises the document and applies decorations for comments, operators, λ, π, ≡.
// All structural tokens are now proper lexer tokens — no regex scanning needed.

function applyTokenDecorations(
  lexResult: { tokens: IToken[]; groups: Record<string, IToken[]> },
  tks: Tk[],
): void {
  // Comments are in the "comment" group (LineComment, BlockComment, UnterminatedBlockComment)
  for (const tok of lexResult.groups["comment"] ?? []) {
    const from = tok.startOffset;
    const to = (tok.endOffset ?? tok.startOffset) + 1;
    tks.push({ from, to, m: mComment });
  }

  // Structural tokens from the main token stream
  for (const tok of lexResult.tokens) {
    const from = tok.startOffset;
    const to = (tok.endOffset ?? tok.startOffset) + 1;
    if (tok.tokenType === Pragma)
      tks.push({ from, to, m: mPragma });
    else if (tokenMatcher(tok, DefAssign) || tokenMatcher(tok, Dot))
      tks.push({ from, to, m: mOp });
    else if (tokenMatcher(tok, Backslash))
      tks.push({ from, to, m: mLambda });
    else if (tok.tokenType === Pi || tok.tokenType === Equiv)
      tks.push({ from, to, m: mPi });
  }
}

// ── AST walk — identifier classification ─────────────────────────────────────

function walkTerm(
  term: Term,
  positions: PositionMap,
  defs: Set<string>,
  bound: Set<string>,
  tks: Tk[],
): void {
  switch (term.kind) {
    case "Var": {
      const pos = positions.vars.get(term as Var);
      if (pos) {
        const m = bound.has(term.name) ? mBound
                : defs.has(term.name)  ? mDefUse
                :                        mFree;
        tks.push({ from: pos.from, to: pos.to, m });
      }
      break;
    }
    case "Abs": {
      const paramPos = positions.params.get(term as Abs);
      if (paramPos) tks.push({ from: paramPos.from, to: paramPos.to, m: mParam });
      walkTerm(term.body, positions, defs, new Set([...bound, term.param]), tks);
      break;
    }
    case "App": {
      walkTerm(term.func, positions, defs, bound, tks);
      walkTerm(term.arg,  positions, defs, bound, tks);
      break;
    }
    case "Subst":
      break; // only produced during evaluation, never appears in parsed programs
  }
}

// ── ViewPlugin ────────────────────────────────────────────────────────────────

function buildDecorations(view: EditorView): DecorationSet {
  const { doc } = view.state;
  const parsed = view.state.field(parsedField);
  const tks: Tk[] = [];

  const fullText = doc.toString();
  const lexResult = LambdaLexer.tokenize(fullText);
  applyTokenDecorations(lexResult, tks);

  // AST-based identifier highlighting
  if (parsed) {
    const allDefNames = new Set([...parsed.defs.keys(), ...parsed.defInfos.map(d => d.name)]);

    for (const { name, namePos, body, positions } of parsed.defInfos) {
      tks.push({ from: namePos.from, to: namePos.to, m: mDefName });
      walkTerm(body, positions, allDefNames, new Set(), tks);
    }

    for (const { term, positions, boundNames, paramPositions } of parsed.exprInfos) {
      for (const pos of paramPositions ?? [])
        tks.push({ from: pos.from, to: pos.to, m: mParam });
      walkTerm(term, positions, allDefNames, boundNames ?? new Set(), tks);
    }
  }

  tks.sort((a, b) => a.from - b.from || a.to - b.to);

  const docLen = doc.length;
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to, m } of tks)
    if (from >= 0 && to <= docLen && from < to)
      builder.add(from, to, m);

  return builder.finish();
}

export const lambdaHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildDecorations(view); }
    update(update: ViewUpdate) {
      if (update.docChanged || update.state.field(parsedField) !== update.startState.field(parsedField))
        this.decorations = buildDecorations(update.view);
    }
  },
  { decorations: (v) => v.decorations },
);
