# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                    # Start Vite dev server with hot reload
npm run build                  # TypeScript compile + production bundle to /dist
npm test                       # Run Vitest unit tests
npm run bench                  # parseProgram benchmark (3 workloads, JSON snapshot to bench/results/; --baseline <file> for delta)
npm run bench:freeze <ref> <name>  # Capture a named baseline at <ref> via temporary git worktree → bench/baselines/<name>.json
npm run bench:vs <name>        # Run current bench vs bench/baselines/<name>.json
npx tsc --noEmit               # Type-check without emitting
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
- **`src/parser/semantics.ts`** — Walks the statement list: resolves definitions, evaluates print/≡/≢ statements (bare expressions are equivalent to `:print`), handles `:import`/`:mixin` directives with caching.
- **`src/parser/types.ts`** — Shared types: `ProgramResult`, `LambdaError`, `OptionsConfig`, `ProgramRunConfig`, `PositionMap`, etc.
- **`src/parser/parser.ts`** — Barrel re-export; `parseProgram(source, config, resolver)` entry point.
- **`src/parser/pretty.ts`** — Serializes AST back to surface syntax.
- **`src/evaluator/eval.ts`** — Normal-order beta reduction. `EvalConfig = { maxSteps?, maxSize? }`. `RunResult` has kinds `normalForm | stepLimit | sizeLimit`. Also exports `termSize`, `buildNormDefs`, `findMatch` (skips `_`-prefixed names).
- **`src/highlight.ts`** — `computeHighlightRanges(text, parsed)` pure function; CM6 `ViewPlugin` + `StateField` (`parsedField`) wiring; hover tooltips for errors/warnings.
- **`src/links.ts`** — CM6 decorations for `[type/name]` comment links and `:import`/`:mixin` directive paths. Directive paths require Ctrl-click (underline/cursor only visible while Ctrl held via `CtrlTrackerPlugin`).
- **`src/editor.ts`** — CM6 base theme, custom keymap (Alt-L/B/E/N, bracket wrapping, `\name`+Space expansion), line numbers.
- **`src/autocomplete.ts`** — Alt-Space autocomplete: def names, directive commands, import paths. Scroll wheel moves selection via global wheel listener.
- **`src/rewrap.ts`** — Ctrl-R paragraph reflow for block comments; ruler line; wrap width from config.
- **`src/storage.ts`** — `SAVE_PREFIX`, `getSavedSlots`, `resolveContent`, `contentExists`; all localStorage key constants.
- **`src/config.ts`** — `Config = { maxStepsPrint, maxStepsRun, maxStepsIdent, maxHistory, maxSize, showPassingEquiv, wrapWidth }`, `DEFAULT_CONFIG`.
- **`src/comment.ts`** — `findCommentRanges`, `inComment` utilities.
- **`src/useFocusTrap.ts`** — `useFocusTrap(ref, active)` hook: auto-focuses first element, traps Tab/Shift-Tab.
- **`src/App.tsx`** — Main UI. `Loaded` state carries `effectiveConfig` (merged `Config` + per-program option overrides). `programResult` is a `useMemo`; dispatched to CM6 via `setParsed` effect on change and immediately after `resetEditorContent` (via `programResultRef`).
- **`src/SettingsModal.tsx`** — Settings dialog; Enter = apply, Escape = cancel, click-outside = apply.
- **`src/HelpModal.tsx`** — Tabbed help: Language / UI & editing / Grammar / Credits.

### Grammar (surface syntax)

Top-level surface forms:

- **Lambdas**: `λx. body`, `λx y z. body` (multi-param), `λβx. body` (eager / call-by-value binder).
- **Application**: juxtaposition, left-associative (`f x y` = `(f x) y`).
- **Substitution sugar**: `e[x:=a]` desugars to `(λx. e) a`. Eager variant: `e[βx:=a]`.
- **Definitions**: `name params := body` (`::=` for redefinition). The name slot rejects β; param slots accept it.
- **Statements**: bare `expr` (or `:print expr`) — evaluate and show in the output panel; the last bare expression is also loaded into the eval panel. `:assert lhs ≡ rhs` and `:assert lhs ≢ rhs` (alpha-beta equivalence assertions). `:eval expr` (explicit eval-panel override). `:print` and `:assert` each accept a comprehension prefix `[x := {a,b,c}]`.
- **Directives** (line-start): `:import`, `:mixin`, `:set`, `:infix`.
- **Reserved letters**: λ, α, β, η, ∀, ∃, ⊢ — never absorbed into identifiers regardless of position. (π is a regular identifier character.)

For the full EBNF, see [`docs/grammar.md`](docs/grammar.md) (regenerate with `npm run gen:grammar`) or open the Grammar tab in the running app's Help modal — both are produced from the live Chevrotain parser via `src/parser/ebnf.ts`.

### Private symbols

Definition names starting with `_` are private: they work locally but are not exported across `:import`/`:mixin` boundaries and are excluded from ≡ match display.

### Import options

`:import` and `:mixin` accept a bracketed, comma-separated, order-independent options block before the path: `:import[<opts>] "path"`. Recognized options:

- **`quiet`** — imported names are *quiet*: hidden from the ≡ match list and autocomplete. Quiet status propagates through import chains (if B quietly imports C, and A imports B normally, C's names stay quiet in A). Local redefinition resets a name to visible. When the same name is imported multiple times, the latter import wins. Useful for tutorial utilities that provide infrastructure without cluttering the user's namespace.
- **`prefix="<str>"`** — prepend `<str>` to every imported public name (private `_`-prefixed names are skipped first, then prefix is applied). Disambiguates competing libraries (`:import[prefix="C"] "Church Numerals"` and `:import[prefix="S"] "Scott Numerals"` coexist as `C0`/`S0`, …). The `infix` flag travels with the renamed name. The idiom `:import[prefix="_"] "lib"` rewrites every public name to start with `_`, making the import private locally and not re-exported.

## Defaults

`DEFAULT_CONFIG.autoSave` is `true` and load-bearing — Firefox tabs crash often enough that scratch/buffer loss is a real concern. Don't flip it back to `false` for "cleaner default UX"; the dirty-indicator tradeoff is accepted.

## Bench baselines

Named baselines live in `bench/baselines/` (tracked) and serve as fixed reference points for performance regressions. `bench/results/` holds ephemeral per-run snapshots (gitignored).

- **Workloads are additive-only.** New workloads can be added to `bench/run.mts`; existing ones must not be edited or removed. Old baselines remain valid because they label exactly the workloads they ran. The bench harness shows "—" for workloads missing from a baseline.
- **One canonical machine** — Elmar's laptop. Cross-machine numbers don't compare cleanly (thermal/scheduler noise), so on a machine change, regenerate every baseline with `npm run bench:freeze`.
- **When to capture a baseline**: every tagged release (`v1.0.3.json`, …), plus named milestone commits for any non-trivial perf-affecting change (`pre-perf.json` = before any perf work; `post-hoist.json` = after the freeVars hoist; …). One commit per baseline; never overwrite.
- **Caveat**: `bench:freeze` predates a commit's bench harness will fail — `b6d447e` is the earliest commit where the harness exists.

## Language design

Don't silently extend the language. Adding symbols to the picker or `\name`+Space expansion is a UI change; making them valid identifier characters or reserved tokens is a language design change that needs discussion. Reserved letters (λ α β η ∀ ∃ ⊢) are deliberate; new symbols may be reserved, freely usable, or have specific syntax rules — ask before touching `src/parser/lexer.ts` or `src/parser/grammar.ts`.

Definitions in `src/includes/std/` and `src/includes/example/` should match the *natural call shape* rather than the maximum nested arity. E.g. `K y := λx. y` (K is a one-argument constant-function builder) over `K x y := x` (advertises a two-arg call nobody uses); `succ n := λs z. …` because `succ 5` is a number, not a thing waiting for `s` and `z`. Counterexample: when callers really do saturate the function (`and p q := …`, `if c t f := …`), the flat form is fine.
