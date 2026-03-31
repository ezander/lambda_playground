import { ViewPlugin, ViewUpdate, Decoration, DecorationSet } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
import { RangeSetBuilder, StateField, StateEffect } from "@codemirror/state";
import { ProgramResult, PositionMap } from "./parser/parser";
import { Term, Var, Abs } from "./parser/ast";

// ── Decoration marks ──────────────────────────────────────────────────────────

const mComment  = Decoration.mark({ class: "cml-comment" });
const mOp       = Decoration.mark({ class: "cml-op" });
const mLambda   = Decoration.mark({ class: "cml-lambda" });
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

// ── Structural scan (regex) — comments, ::=, λ, and . / := separators ────────
// These tokens are skipped by the Chevrotain lexer and absent from the AST.

function scanStructural(text: string, lineFrom: number, tks: Tk[]): void {
  const ci = text.indexOf("#");
  if (ci >= 0)
    tks.push({ from: lineFrom + ci, to: lineFrom + text.length, m: mComment });

  const code = ci >= 0 ? text.slice(0, ci) : text;

  // ::= definition operator
  let p = code.indexOf("::=");
  while (p >= 0) {
    tks.push({ from: lineFrom + p, to: lineFrom + p + 3, m: mOp });
    p = code.indexOf("::=", p + 3);
  }

  // λ/\ keyword + scan ahead for . or := body separator
  for (let i = 0; i < code.length; i++) {
    if (code[i] === "λ" || code[i] === "\\") {
      tks.push({ from: lineFrom + i, to: lineFrom + i + 1, m: mLambda });
      let j = i + 1;
      while (j < code.length && /[\w\s]/.test(code[j])) j++;
      if (code[j] === ".") {
        tks.push({ from: lineFrom + j, to: lineFrom + j + 1, m: mOp });
      } else if (code[j] === ":" && code[j + 1] === "=") {
        tks.push({ from: lineFrom + j, to: lineFrom + j + 2, m: mOp });
      }
    }
  }

  // := inside substitution [x:=a]
  p = code.indexOf(":=");
  while (p >= 0) {
    if (p === 0 || code[p - 1] !== ":")   // exclude ::=
      tks.push({ from: lineFrom + p, to: lineFrom + p + 2, m: mOp });
    p = code.indexOf(":=", p + 2);
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

  // Structural tokens (comments, operators, λ) — scan visible lines only
  for (const { from, to } of view.visibleRanges) {
    const first = doc.lineAt(from).number;
    const last  = doc.lineAt(to).number;
    for (let n = first; n <= last; n++) {
      const line = doc.line(n);
      scanStructural(line.text, line.from, tks);
    }
  }

  // AST-based identifier highlighting
  if (parsed) {
    const defNames = new Set(parsed.defs.keys());

    for (const { namePos, body, positions } of parsed.defInfos) {
      tks.push({ from: namePos.from, to: namePos.to, m: mDefName });
      walkTerm(body, positions, defNames, new Set(), tks);
    }

    for (const { term, positions } of parsed.exprInfos)
      walkTerm(term, positions, defNames, new Set(), tks);
  }

  tks.sort((a, b) => a.from - b.from || a.to - b.to);

  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to, m } of tks)
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
