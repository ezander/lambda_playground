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
- **`src/parser/semantics.ts`** — Walks the statement list: resolves definitions, evaluates π/≡/≢, handles `#! include`/`mixin` pragmas with caching.
- **`src/parser/types.ts`** — Shared types: `ProgramResult`, `LambdaError`, `PragmaConfig`, `ProgramRunConfig`, `PositionMap`, etc.
- **`src/parser/parser.ts`** — Barrel re-export; `parseProgram(source, config, resolver)` entry point.
- **`src/parser/pretty.ts`** — Serializes AST back to surface syntax.
- **`src/evaluator/eval.ts`** — Normal-order beta reduction. `EvalConfig = { maxSteps?, maxSize? }`. `RunResult` has kinds `normalForm | stepLimit | sizeLimit`. Also exports `termSize`, `buildNormDefs`, `findMatch` (skips `_`-prefixed names).
- **`src/highlight.ts`** — `computeHighlightRanges(text, parsed)` pure function; CM6 `ViewPlugin` + `StateField` (`parsedField`) wiring; hover tooltips for errors/warnings.
- **`src/links.ts`** — CM6 decorations for `[type/name]` comment links and `#! include/mixin` pragma paths. Pragma paths require Ctrl-click (underline/cursor only visible while Ctrl held via `CtrlTrackerPlugin`).
- **`src/editor.ts`** — CM6 base theme, custom keymap (Alt-L/P/E/N, bracket wrapping, `\name`+Space expansion), line numbers.
- **`src/autocomplete.ts`** — Alt-Space autocomplete: def names, pragma keys, include paths. Scroll wheel moves selection via global wheel listener.
- **`src/rewrap.ts`** — Ctrl-R paragraph reflow for block comments; ruler line; wrap width from config.
- **`src/storage.ts`** — `SAVE_PREFIX`, `getSavedSlots`, `resolveContent`, `contentExists`; all localStorage key constants.
- **`src/config.ts`** — `Config = { maxStepsPrint, maxStepsRun, maxStepsIdent, maxHistory, maxSize, showPassingEquiv, wrapWidth }`, `DEFAULT_CONFIG`.
- **`src/comment.ts`** — `findCommentRanges`, `inComment` utilities.
- **`src/useFocusTrap.ts`** — `useFocusTrap(ref, active)` hook: auto-focuses first element, traps Tab/Shift-Tab.
- **`src/App.tsx`** — Main UI. `Loaded` state carries `effectiveConfig` (merged `Config` + pragma overrides). `programResult` is a `useMemo`; dispatched to CM6 via `setParsed` effect on change and immediately after `resetEditorContent` (via `programResultRef`).
- **`src/SettingsModal.tsx`** — Settings dialog; Enter = apply, Escape = cancel, click-outside = apply.
- **`src/HelpModal.tsx`** — Tabbed help: Language / UI & editing / Grammar / Credits.
- **`src/AstView.tsx`** — Expandable AST tree display.

### Grammar (surface syntax)

```
program     ::= statement (('\n' | ';') statement)*
statement   ::= definition | redef | print | print-comp | equiv | equiv-comp | nequiv | term | pragma
definition  ::= identLike+ ':=' term
redef       ::= identLike+ '::=' term
print       ::= 'π' term
print-comp  ::= 'π' '[' bindings ']' term
equiv       ::= '≡' atom atom
equiv-comp  ::= '≡' '[' bindings ']' atom atom
nequiv      ::= '≢' atom atom
term        ::= application
application ::= atom+
atom        ::= primary ('[' identLike ':=' term ']')*
primary     ::= identLike | '(' term ')' | function
function    ::= ('\' | 'λ') identLike+ '.' term
bindings    ::= identLike ':=' '{' term (',' term)* '}' (',' …)*
identLike   ::= plainIdent | '`' [^`\n]+ '`'
plainIdent  ::= (alnum | '_' | "'" | greek | op-sym)+   -- excluding λ π; α β η ∀ ∃ ⊢ reserved
pragma      ::= '#!' pragma-body    -- #! include/mixin "path", #! max-steps=N, etc.
```

### Private symbols

Definition names starting with `_` are private: they work locally but are not exported across `#! include`/`mixin` boundaries and are excluded from ≡ match display.
