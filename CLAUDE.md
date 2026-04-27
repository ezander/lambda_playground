# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Vite dev server with hot reload
npm run build    # TypeScript compile + production bundle to /dist
npm test         # Run Vitest unit tests
npx tsc --noEmit # Type-check without emitting
```

## Architecture

A React + TypeScript single-page app for interactively parsing and evaluating lambda calculus expressions. Built with Vite; uses Chevrotain for lexing/parsing.

### Pipeline

```
user input → lexer.ts → grammar.ts (CST) → semantics.ts (AST + eval) → App.tsx display
```

### Key modules

- **`src/parser/ast.ts`** — Three node types: `Var`, `Abs` (single-param), `App`. Factory functions.
- **`src/parser/lexer.ts`** — Chevrotain tokenizer.
- **`src/parser/grammar.ts`** — Chevrotain CST parser + AST visitor. Desugars multi-param lambdas, folds left-associative application.
- **`src/parser/semantics.ts`** — Walks the statement list: resolves definitions, evaluates π/≡/≢, handles `:import`/`:mixin` directives with caching.
- **`src/parser/types.ts`** — Shared types: `ProgramResult`, `LambdaError`, `PragmaConfig`, `ProgramRunConfig`, `PositionMap`, etc.
- **`src/parser/parser.ts`** — Barrel re-export; `parseProgram(source, config, resolver)` entry point.
- **`src/parser/pretty.ts`** — Serializes AST back to surface syntax.
- **`src/evaluator/eval.ts`** — Normal-order beta reduction. `EvalConfig = { maxSteps?, maxSize? }`. `RunResult` has kinds `normalForm | stepLimit | sizeLimit`. Also exports `termSize`, `buildNormDefs`, `findMatch` (skips `_`-prefixed names).
- **`src/highlight.ts`** — `computeHighlightRanges(text, parsed)` pure function; CM6 `ViewPlugin` + `StateField` (`parsedField`) wiring; hover tooltips for errors/warnings.
- **`src/links.ts`** — CM6 decorations for `[type/name]` comment links and `:import`/`:mixin` directive paths. Directive paths require Ctrl-click (underline/cursor only visible while Ctrl held via `CtrlTrackerPlugin`).
- **`src/editor.ts`** — CM6 base theme, custom keymap (Alt-L/P/E/N, bracket wrapping, `\name`+Space expansion), line numbers.
- **`src/autocomplete.ts`** — Alt-Space autocomplete: def names, directive commands, import paths. Scroll wheel moves selection via global wheel listener.
- **`src/rewrap.ts`** — Ctrl-R paragraph reflow for block comments; ruler line; wrap width from config.
- **`src/storage.ts`** — `SAVE_PREFIX`, `getSavedSlots`, `resolveContent`, `contentExists`; all localStorage key constants.
- **`src/config.ts`** — `Config = { maxStepsPrint, maxStepsRun, maxStepsIdent, maxHistory, maxSize, showPassingEquiv, wrapWidth }`, `DEFAULT_CONFIG`.
- **`src/comment.ts`** — `findCommentRanges`, `inComment` utilities.
- **`src/useFocusTrap.ts`** — `useFocusTrap(ref, active)` hook: auto-focuses first element, traps Tab/Shift-Tab.
- **`src/App.tsx`** — Main UI. `Loaded` state carries `effectiveConfig` (merged `Config` + pragma overrides). `programResult` is a `useMemo`; dispatched to CM6 via `setParsed` effect on change and immediately after `resetEditorContent` (via `programResultRef`).
- **`src/SettingsModal.tsx`** — Settings dialog; Enter = apply, Escape = cancel, click-outside = apply.
- **`src/HelpModal.tsx`** — Tabbed help: Language / UI & editing / Grammar / Credits.

### Grammar (surface syntax)

Top-level surface forms:

- **Lambdas**: `λx. body`, `λx y z. body` (multi-param), `λβx. body` (eager / call-by-value binder).
- **Application**: juxtaposition, left-associative (`f x y` = `(f x) y`).
- **Substitution sugar**: `e[x:=a]` desugars to `(λx. e) a`. Eager variant: `e[βx:=a]`.
- **Definitions**: `name params := body` (`::=` for redefinition). The name slot rejects β; param slots accept it.
- **Statements**: `π expr` / `:print` (evaluate and show), `≡ a b` / `:assert`, `≢ a b` / `:assert-not`, `:eval expr`. Each accepts a comprehension prefix `[x := {a,b,c}]`.
- **Directives** (line-start): `:import`, `:mixin`, `:set`, `:infix`. Pragmas `#! key value` inside line comments overlap with `:set`.
- **Reserved letters**: λ, π, α, β, η, ∀, ∃, ⊢ — never absorbed into identifiers regardless of position.

For the full EBNF, see [`docs/grammar.md`](docs/grammar.md) (regenerate with `npm run gen:grammar`) or open the Grammar tab in the running app's Help modal — both are produced from the live Chevrotain parser via `src/parser/ebnf.ts`.

### Private symbols

Definition names starting with `_` are private: they work locally but are not exported across `:import`/`:mixin` boundaries and are excluded from ≡ match display.

### Quiet imports

`:import "path" quiet` imports all non-private names but marks them as *quiet*: hidden from the ≡ match list and autocomplete. Quiet status propagates through import chains (if B quietly imports C, and A imports B normally, C's names stay quiet in A). Local redefinition resets a name to visible. When the same name is imported multiple times, the latter import wins. Useful for tutorial utilities that provide infrastructure without cluttering the user's namespace.
