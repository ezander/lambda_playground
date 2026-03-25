# Lambda Playground

An interactive browser-based lambda calculus playground with step-by-step beta reduction, definitions, and a collapsible AST view. Inspired by [hbr's Lambda Calculus evaluator](https://hbr.github.io/Lambda-Calculus/lambda2/lambda.html).

## Features

- Multi-line input: definitions and expressions, one per line
- Named definitions with eager expansion into subsequent lines
- Live parsing on every keystroke with clickable error locations
- Step-by-step or batch evaluation; continue after pausing
- Normal-order (leftmost-outermost) beta reduction with capture-avoiding substitution
- Alpha-equivalence matching: history entries show the definition name when a result matches
- Toggle between pretty-printed syntax and interactive collapsible AST view
- Step history (newest-first, last 10) cleared on load
- Select text and press `(`, `[`, `{`, or `<` to wrap in brackets

## Syntax

```
\x := body           # lambda abstraction
\x y z := body       # multi-param (desugars to nested abstractions)
\x . body            # . is an alias for :=
f x y                # application (left-associative)
e[x:=a]              # substitution: desugars to (\x. e) a
# comment            # rest of line ignored
```

### Definitions

```
true  ::= \x y. x          # define a name
false ::= \x y. y
and p q ::= p q false       # shorthand: f x y ::= e  means  f ::= \x y := e

and true false              # last expression line is what gets evaluated
```

Definitions are expanded eagerly. The last non-definition line is loaded and evaluated.

## Controls

| Button | Action |
|--------|--------|
| load | Parse and load the current expression |
| step | One beta-reduction step |
| run | Up to 1000 steps; press again to continue |
| load & run | Load and immediately run to normal form |

## Development

```bash
npm run dev      # start Vite dev server with hot reload
npm run build    # TypeScript compile + production bundle to /dist
tsc --noEmit     # type-check without emitting
```

## Architecture

```
user input → lexer.ts → parser.ts (CST + visitor) → ast.ts → eval.ts → App.tsx
```

Key modules in `src/`:

| File | Role |
|------|------|
| `parser/ast.ts` | `Var`, `Abs`, `App` node types and factory functions |
| `parser/lexer.ts` | Chevrotain tokenizer |
| `parser/parser.ts` | CST parser + AST visitor; `parseProgram` handles multi-line input and definitions |
| `parser/pretty.ts` | Serializes AST back to surface syntax; `assertRoundTrip` sanity check |
| `evaluator/eval.ts` | Normal-order beta reduction, `alphaEq` for definition matching |
| `AstView.tsx` | Collapsible AST tree component |
| `HelpModal.tsx` | In-app help/reference dialog |
| `App.tsx` | UI: editor, live parse output, controls, step history |
