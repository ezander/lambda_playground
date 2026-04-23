import { tokenMatcher } from "chevrotain";
import { LambdaLexer, NewLine } from "./lexer";
import { Term, App, Abs } from "./ast";
import { parser, astBuilder, tokenName, RawStmt, RawBinding } from "./grammar";
import {
  LambdaError, errLocation,
  PositionMap,
  DefEntry,
  DefInfo,
  PragmaConfig, KNOWN_PRAGMAS, BOOLEAN_PRAGMAS,
  ComprehensionBinding,
  PrintComprehensionRow, PrintComprehensionInfo,
  EquivComprehensionRow, EquivComprehensionInfo,
  EquivInfo,
  ProgramResult, ProgramRunConfig, IncludeResolver,
} from "./types";
import { normalize, alphaEq, buildNormDefs, findMatch } from "../evaluator/eval";
import { prettyPrint } from "./pretty";

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

// ── Infix swap ───────────────────────────────────────────────────────────────
// For each App(a, op) where op is a Var marked infix and a is not infix,
// rewrite to App(op, a). Left-associative fold handles chaining naturally.

function swapInfix(term: Term, infixNames: Set<string>): Term {
  switch (term.kind) {
    case "Var":   return term;
    case "Abs":   return Abs(term.param, swapInfix(term.body, infixNames));
    case "Subst": return term;
    case "App": {
      const func = swapInfix(term.func, infixNames);
      const arg  = swapInfix(term.arg,  infixNames);
      if (arg.kind === "Var" && infixNames.has(arg.name) &&
          !(func.kind === "Var" && infixNames.has(func.name)))
        return App(arg, func);
      return App(func, arg);
    }
  }
}

function getInfixNames(defEntries: Map<string, DefEntry>): Set<string> {
  const s = new Set<string>();
  for (const [name, entry] of defEntries)
    if (entry.infix) s.add(name);
  return s;
}

// ── Include / mixin caches ────────────────────────────────────────────────────

const includeCache = new Map<string, { content: string; configKey: string; result: ProgramResult }>();

function configKey(cfg: ProgramRunConfig): string {
  return JSON.stringify(cfg, Object.keys(cfg).sort());
}

function cachedParseInclude(
  path: string,
  content: string,
  defaultConfig: ProgramRunConfig,
  resolver: IncludeResolver,
  includeStack: string[],
): ProgramResult {
  const ck = configKey(defaultConfig);
  const cached = includeCache.get(path);
  if (cached && cached.content === content && cached.configKey === ck) return cached.result;
  const result = parseProgram(content, defaultConfig, resolver, includeStack);
  includeCache.set(path, { content, configKey: ck, result });
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

// ── Comprehension helpers ─────────────────────────────────────────────────────

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

// ── Pragma processing ─────────────────────────────────────────────────────────

function processPragma(
  text: string,
  offset: number,
  pragmaConfig: PragmaConfig,
  errors: LambdaError[],
  defaultConfig: ProgramRunConfig,
  resolver: IncludeResolver,
  defs: Map<string, Term>,
  defEntries: Map<string, DefEntry>,
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
    for (const e of mixed.errors) {
      const effectiveSource = e.source ?? path;
      errors.push({ ...e, source: effectiveSource, location: e.location ?? (e.offset !== undefined ? errLocation(content, e.offset) : undefined), via: effectiveSource !== path ? path : undefined, offset });
    }
    if (!mixed.ok) {
      equivFailed.value = true;
      const hasRealErrors = mixed.errors.some(e => e.kind !== "warning");
      if (!hasRealErrors)
        errors.push({ message: `Assertion failed in mixin "${path}"`, offset });
    }
    for (const [name, entry] of mixed.defs) {
      if (name.startsWith("_")) continue; // private — does not cross mixin boundary
      if (defs.has(name)) {
        const oldNorm = normalize(defs.get(name)!).term;
        const newNorm = normalize(entry.term).term;
        if (!alphaEq(oldNorm, newNorm))
          errors.push({ message: `Warning: '${name}' redefined with a different normal form (from mixin "${path}")`, offset, kind: "warning" });
      }
      defs.set(name, entry.term);
      // Propagate quiet flags from mixin; offset = this pragma line
      const existing = defEntries.get(name);
      defEntries.set(name, { term: entry.term, offset: existing?.offset ?? offset, quiet: entry.quiet, infix: entry.infix });
    }
    return;
  }

  const incMatch = text.match(/^import\s+"([^"]+)"(.*)$/);
  if (incMatch) {
    const path = incMatch[1];
    const modifiers = incMatch[2].trim();
    const quiet = modifiers === "quiet";
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
    for (const e of included.errors) {
      const effectiveSource = e.source ?? path;
      errors.push({ ...e, source: effectiveSource, location: e.location ?? (e.offset !== undefined ? errLocation(content, e.offset) : undefined), via: effectiveSource !== path ? path : undefined, offset });
    }
    if (!included.ok) {
      equivFailed.value = true;
      const hasRealErrors = included.errors.some(e => e.kind !== "warning");
      if (!hasRealErrors)
        errors.push({ message: `Assertion failed in included file "${path}"`, offset });
    }
    for (const [name, entry] of included.defs) {
      if (name.startsWith("_")) continue; // private — does not cross include boundary
      if (defs.has(name)) {
        const oldNorm = normalize(defs.get(name)!).term;
        const newNorm = normalize(entry.term).term;
        if (!alphaEq(oldNorm, newNorm))
          errors.push({ message: `Warning: '${name}' redefined with a different normal form (from include "${path}")`, offset, kind: "warning" });
      }
      defs.set(name, entry.term);
      // Propagate quiet flags: include-quiet forces all names quiet;
      // normal include preserves quiet status from the included file.
      // Offset = first time this name became available (keep existing if already known).
      const existing = defEntries.get(name);
      const isQuiet = quiet || entry.quiet;
      defEntries.set(name, { term: entry.term, offset: existing?.offset ?? offset, quiet: isQuiet, infix: entry.infix });
    }
    return;
  }

  const infixMatch = text.match(/^infix\s+(.+)$/);
  if (infixMatch) {
    const names = infixMatch[1].trim().split(/\s+/);
    for (const name of names) {
      const entry = defEntries.get(name);
      if (!entry) {
        errors.push({ message: `Warning: '${name}' is not defined, cannot mark as infix`, offset, kind: "warning" });
      } else {
        entry.infix = true;
      }
    }
    return;
  }

  const setMatch = text.match(/^set\s+/);
  const settingText = setMatch ? text.slice(setMatch[0].length) : text;
  const m = settingText.match(/^(no-)?([a-z][a-z0-9-]*)(?:(?:\s*=\s*|\s+)(true|false|\d+))?\s*$/);
  if (!m) {
    errors.push({ message: `Invalid directive: "${text}"`, offset, kind: "warning" });
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

// ── Main program parser ───────────────────────────────────────────────────────

export function parseProgram(
  input: string,
  defaultConfig: ProgramRunConfig = {},
  resolver: IncludeResolver = () => null,
  _includeStack: string[] = [],
  initialDefs: Map<string, Term> = new Map(),
): ProgramResult {
  const defs = new Map(initialDefs);
  const defEntries = new Map<string, DefEntry>();
  let expr: Term | null = null;
  let rawExpr: Term | null = null;
  let hasEval = false;  // once :eval is seen, bare expressions no longer override
  const errors: LambdaError[] = [];
  const defInfos:   DefInfo[] = [];
  const exprInfos:  ProgramResult["exprInfos"] = [];
  const printInfos: ProgramResult["printInfos"] = [];
  const equivInfos: EquivInfo[] = [];
  const printComprehensionInfos: PrintComprehensionInfo[] = [];
  const equivComprehensionInfos: EquivComprehensionInfo[] = [];
  const pragmaConfig: PragmaConfig = {};
  const equivFailed = { value: false };

  if (!input.endsWith("\n")) input += "\n";

  // ── Lex ────────────────────────────────────────────────────────────────────
  const lexResult = LambdaLexer.tokenize(input);
  if (lexResult.errors.length > 0) {
    for (const e of lexResult.errors)
      errors.push({ message: `Lex error: ${e.message}`, offset: e.offset });
  }

  // ── Parse ──────────────────────────────────────────────────────────────────
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

  // Fallback: re-parse only tokens before the first error for partial highlighting
  if (stmts.length === 0 && parser.errors.length > 0) {
    const firstErrOffset = parser.errors[0].token.startOffset ?? Infinity;
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

  const globalPositions = astBuilder.positions;

  const compBindingHighlight = (bindings: RawBinding[] | null) => bindings ? {
    boundNames:     new Set(bindings.map(b => b.name)),
    paramPositions: bindings.map(b => ({ from: b.nameTok.startOffset, to: (b.nameTok.endOffset ?? b.nameTok.startOffset) + 1 })),
  } : {};

  // ── Semantic analysis ──────────────────────────────────────────────────────
  for (const stmt of stmts) {
    if (equivFailed.value) {
      switch (stmt.kind) {
        case "def":
          defInfos.push({ name: stmt.name, namePos: { from: stmt.nameTok.startOffset, to: (stmt.nameTok.endOffset ?? stmt.nameTok.startOffset) + 1 }, body: stmt.rawBody, positions: globalPositions });
          break;
        case "print":
          exprInfos.push({ term: stmt.term, positions: globalPositions, ...compBindingHighlight(stmt.bindings), offset: stmt.offset });
          for (const b of stmt.bindings ?? []) for (const v of b.termValues) exprInfos.push({ term: v, positions: globalPositions, offset: stmt.offset });
          break;
        case "equiv":
          exprInfos.push({ term: App(stmt.atom1, stmt.atom2), positions: globalPositions, ...compBindingHighlight(stmt.bindings), offset: stmt.offset });
          for (const b of stmt.bindings ?? []) for (const v of b.termValues) exprInfos.push({ term: v, positions: globalPositions, offset: stmt.offset });
          break;
        case "eval":
        case "expr":
          exprInfos.push({ term: stmt.term, positions: globalPositions, offset: stmt.offset });
          break;
      }
      continue;
    }

    switch (stmt.kind) {
      case "empty":
        break;

      case "pragma": {
        processPragma(stmt.text, stmt.offset, pragmaConfig, errors, defaultConfig, resolver, defs, defEntries, _includeStack, equivFailed);
        break;
      }

      case "def": {
        const { name, nameTok, params, rawBody, bodyTerm, offset } = stmt;
        const merged = { ...defaultConfig, ...pragmaConfig };

        const innerDefs = new Map(defs);
        for (const p of params.map(tokenName)) innerDefs.delete(p);
        const infx = getInfixNames(defEntries);
        let body = expandDefs(swapInfix(bodyTerm, infx), innerDefs);

        if (params.length > 0)
          body = params.map(tokenName).reduceRight((acc, p) => Abs(p, acc), body);

        if (pragmaConfig.normalizeDefs ?? true) {
          const { term: normalized, kind } = normalize(body, { maxSteps: merged.maxStepsIdent, maxSize: merged.maxSize, allowEta: merged.allowEta });
          if (kind === "stepLimit")
            errors.push({ message: `Warning: definition '${name}' did not normalize within step limit — storing as-is`, offset, kind: "warning" });
          else if (kind === "sizeLimit")
            errors.push({ message: `Warning: definition '${name}' exceeded size limit during normalization — storing as-is`, offset, kind: "warning" });
          else
            body = normalized;
        }

        if (stmt.redef) {
          if (!defs.has(name))
            errors.push({ message: `Warning: '${name}' is not defined before ::=`, offset, kind: "warning" });
        } else {
          if (defs.has(name)) {
            const oldNorm = normalize(defs.get(name)!).term;
            const newNorm = normalize(body).term;
            if (!alphaEq(oldNorm, newNorm))
              errors.push({ message: `Warning: '${name}' redefined with a different normal form`, offset, kind: "warning" });
          }
        }
        defs.set(name, body);
        const existingEntry = defEntries.get(name);
        defEntries.set(name, { term: body, offset: existingEntry?.offset ?? stmt.nameTok.startOffset, quiet: false, infix: false });

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
        const infx = getInfixNames(defEntries);

        if (stmt.bindings) {
          const bindingNames = new Set(stmt.bindings.map(b => b.name));
          const defsFiltered = new Map([...defs].filter(([k]) => !bindingNames.has(k)));
          const expandedBase = expandDefs(swapInfix(stmt.term, infx), defsFiltered);
          const baseSrc = prettyPrint(stmt.term);
          const visibleDefs = new Map([...defs].filter(([k]) => !defEntries.get(k)?.quiet));
          const nd = buildNormDefs(visibleDefs, { maxSteps: merged.maxStepsIdent, maxSize: merged.maxSize, allowEta: merged.allowEta });

          const expandedBindings = stmt.bindings.map(b => ({
            name: b.name,
            expandedValues: b.termValues.map(v => expandDefs(swapInfix(v, infx), defsFiltered)),
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
          exprInfos.push({ term: stmt.term, positions: globalPositions, ...compBindingHighlight(stmt.bindings), offset: stmt.offset });
          for (const b of stmt.bindings) for (const v of b.termValues) exprInfos.push({ term: v, positions: globalPositions, offset: stmt.offset });
        } else {
          const expanded = expandDefs(swapInfix(stmt.term, infx), defs);
          const runResult = normalize(expanded, cfg);
          const { term: normalizedTerm, kind, steps } = runResult;
          const visibleDefs = new Map([...defs].filter(([k]) => !defEntries.get(k)?.quiet));
          const nd = buildNormDefs(visibleDefs, { maxSteps: merged.maxStepsIdent, maxSize: merged.maxSize, allowEta: merged.allowEta });
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
          exprInfos.push({ term: stmt.term, positions: globalPositions, offset: stmt.offset });
        }
        break;
      }

      case "equiv": {
        const merged = { ...defaultConfig, ...pragmaConfig };
        const cfg = { maxSteps: merged.maxStepsIdent, maxSize: merged.maxSize, allowEta: merged.allowEta };
        const currentLine = input.slice(0, stmt.offset).split("\n").length;
        const infx = getInfixNames(defEntries);

        if (stmt.bindings) {
          const bindingNames = new Set(stmt.bindings.map(b => b.name));
          const defsFiltered = new Map([...defs].filter(([k]) => !bindingNames.has(k)));
          const baseT1 = expandDefs(swapInfix(stmt.atom1, infx), defsFiltered);
          const baseT2 = expandDefs(swapInfix(stmt.atom2, infx), defsFiltered);
          const src1 = prettyPrint(stmt.atom1);
          const src2 = prettyPrint(stmt.atom2);

          const expandedBindings = stmt.bindings.map(b => ({
            name: b.name,
            expandedValues: b.termValues.map(v => expandDefs(swapInfix(v, infx), defsFiltered)),
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
          if (!allPassed) {
            equivFailed.value = true;
            const sym = stmt.negated ? "≢" : "≡";
            errors.push({ message: `${sym} assertion failed (some cases failed)`, offset: stmt.offset, kind: "assert-fail" });
          }
          exprInfos.push({ term: App(stmt.atom1, stmt.atom2), positions: globalPositions, ...compBindingHighlight(stmt.bindings), offset: stmt.offset });
          for (const b of stmt.bindings) for (const v of b.termValues) exprInfos.push({ term: v, positions: globalPositions, offset: stmt.offset });
        } else {
          const t1 = expandDefs(swapInfix(stmt.atom1, infx), defs);
          const t2 = expandDefs(swapInfix(stmt.atom2, infx), defs);
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
          if (!passed) {
            equivFailed.value = true;
            const sym = stmt.negated ? "≢" : "≡";
            const detail = !terminated ? "(did not terminate)"
              : `${prettyPrint(r1.term)} ${stmt.negated ? "=" : "≠"} ${prettyPrint(r2.term)}`;
            errors.push({ message: `${sym} assertion failed: ${detail}`, offset: stmt.offset, kind: "assert-fail" });
          }
          exprInfos.push({ term: App(stmt.atom1, stmt.atom2), positions: globalPositions, offset: stmt.offset });
        }
        break;
      }

      case "eval": {
        const infx = getInfixNames(defEntries);
        rawExpr = stmt.term;
        expr    = expandDefs(swapInfix(stmt.term, infx), defs);
        hasEval = true;
        exprInfos.push({ term: stmt.term, positions: globalPositions, offset: stmt.offset });
        break;
      }

      case "expr": {
        if (!hasEval) {
          const infx = getInfixNames(defEntries);
          rawExpr = stmt.term;
          expr    = expandDefs(swapInfix(stmt.term, infx), defs);
        }
        exprInfos.push({ term: stmt.term, positions: globalPositions, offset: stmt.offset });
        break;
      }
    }
  }

  return {
    ok: !equivFailed.value && errors.filter(e => e.kind !== "warning").length === 0,
    errors,
    defs: defEntries,
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
