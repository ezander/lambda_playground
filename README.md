# Lambda Playground

An interactive browser-based lambda calculus interpreter with step-by-step beta reduction, built with React and TypeScript.

## Features

- Live parsing on every keystroke with inline error display
- Step-by-step or full evaluation to normal form
- Normal-order (leftmost-outermost) beta reduction with capture-avoiding substitution
- Toggle between pretty-printed syntax and raw AST view
- Built-in examples: identity, K/S combinators, Church booleans
- 1000-step limit to guard against non-terminating terms

## Syntax

```
\x := body           # lambda abstraction (single param)
\x y z := body       # multi-param (desugars to nested abstractions)
f x y                # application (left-associative)
(f x) y              # explicit grouping
```

## Development

```bash
npm run dev      # start Vite dev server with hot reload
npm run build    # TypeScript compile + production bundle to /dist
tsc --noEmit     # type-check without emitting
```

## Architecture

```
user input → lexer.ts → CST parser → AST visitor → ast.ts nodes → eval.ts → App.tsx
```

Key modules in `src/`:

| File | Role |
|------|------|
| `parser/ast.ts` | `Var`, `Abs`, `App` node types and factory functions |
| `parser/lexer.ts` | Chevrotain tokenizer |
| `parser/parser.ts` | CST parser + AST visitor; desugars multi-param lambdas |
| `parser/pretty.ts` | Serializes AST back to surface syntax |
| `evaluator/eval.ts` | Normal-order beta reduction with alpha-renaming |
| `App.tsx` | UI state machine: `idle → parsed → stepping → done` |
