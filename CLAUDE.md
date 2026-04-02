# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Vite dev server with hot reload
npm run build    # TypeScript compile + production bundle to /dist
npm test         # Run Vitest unit tests
tsc --noEmit     # Type-check without emitting
```

## Architecture

A React + TypeScript single-page app for interactively parsing and evaluating lambda calculus expressions. Built with Vite; uses Chevrotain for lexing/parsing.

### Pipeline

```
user input → lexer.ts → CST parser → AST visitor → ast.ts nodes → eval.ts → App.tsx display
```

### Key modules

- **`src/parser/ast.ts`** — Three node types: `Var`, `Abs` (lambda abstraction, always single-param), `App` (application). Factory functions for construction.
- **`src/parser/lexer.ts`** — Chevrotain tokenizer for the custom syntax.
- **`src/parser/parser.ts`** — Two-phase: Chevrotain CST parser + AST visitor. Desugars multi-param lambdas (`\x y := body` → nested `Abs`) and folds left-associative application.
- **`src/parser/pretty.ts`** — Serializes AST back to surface syntax.
- **`src/evaluator/eval.ts`** — Normal-order beta reduction; `EvalConfig = { maxSteps?: number }` controls the step limit (default 1000).
- **`src/App.tsx`** — Main UI. `Config = { maxSteps, maxHistory }` persisted in localStorage. `Loaded` state carries `effectiveConfig` (merged from `Config` + pragma overrides). `buildEntry` is a module-level helper for constructing history entries.
- **`src/SettingsModal.tsx`** — Settings dialog (⚙): draft state, OK/Cancel, click-outside = accept.
- **`src/parser/parser.ts`** — `PragmaConfig = { maxSteps?, maxHistory? }` parsed from `#!` lines before tokenisation; included in `ProgramResult`.

### Grammar

```
program     ::= statement (('\n' | ';') statement)*
statement   ::= definition | print | term
definition  ::= identLike+ ':=' term
print       ::= 'π' term
term        ::= application
application ::= atom+
atom        ::= primary ('[' identLike ':=' term ']')*
primary     ::= identLike | '(' term ')' | function
function    ::= ('\' | 'λ') identLike+ '.' term
identLike   ::= identifier | '`' [^`\n]+ '`'
identifier  ::= [a-zA-Z0-9_\u0370-\u03FF]+  (excluding λ, π; α/β/η reserved)
```
