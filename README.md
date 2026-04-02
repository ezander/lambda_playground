# λ playground

An interactive browser-based playground for an untyped lambda dialect with step-by-step beta/eta reduction, definitions, and syntax highlighting. Inspired by [hbr's Lambda Calculus evaluator](https://hbr.github.io/Lambda-Calculus/lambda2/lambda.html).

> 99% vibe-coded — all implementation by [Claude Code](https://claude.ai/code).

## Features

- Multi-line input: definitions and expressions, one per line (or `;`-separated)
- Named definitions with eager expansion into subsequent lines
- Shorthand `f x y := e` desugars to `f := \x y. e`
- `π expr` print statements: evaluate an expression to normal form and show it in the output panel
- Live parsing on every keystroke with clickable error locations
- Syntax highlighting: defined names, lambda binders, bound/free variables, comments
- Greek letters in identifiers (ω, Ω, Θ, …); operator identifiers (`+`, `<=`, `==`, …); backtick-quoted identifiers for arbitrary names
- Two-phase beta reduction: optionally show `e[x:=a]` substitution as an intermediate step
- Eta reduction as a separate step
- Step-by-step or batch evaluation; continue after pausing
- Normal-order (leftmost-outermost) beta reduction with capture-avoiding substitution
- Alpha-equivalence matching: history entries show the definition name when a result matches
- Toggle between pretty-printed syntax and interactive collapsible AST view
- Named save/load slots in browser local storage; slot picker dropdown; download as plain text
- Share button: encodes editor content into a URL (LZ-compressed) and copies it to the clipboard
- Kino (fullscreen) mode for the editor
- Select text and press `(`, `[`, `{`, or `<` to wrap in brackets

## Syntax

```
λx. body             # lambda abstraction (\ also accepted)
λx y z. body         # multi-param (desugars to nested abstractions)
f x y                # application (left-associative)
e[x:=a]              # substitution: desugars to (λx. e) a
+ m n := m S n       # operator identifier as definition name
<= m n := ...        # = is also an operator char: <=, >=, ==, != all valid
# comment            # rest of line ignored
;                    # statement separator (same as newline)
```

### Identifiers

Plain identifiers are any non-empty sequence of ASCII letters, digits, underscores, and Greek letters (full block `\u0370–\u03FF`, excluding λ and π which are keywords; α, β, η are reserved). This lets you write combinators like `ω`, `Ω`, `Θ` directly.

Backtick-quoted identifiers allow arbitrary names (spaces, operators, etc.):

```
`church 0` := λf x. x
`church 0`              # evaluates the definition
```

### In-source config

Lines starting with `#!` set runtime options for that program run (override the settings dialog; reset when the run ends):

```
#! max-steps=500      # beta steps per "run" press
#! max-history=20     # max history entries shown
```

### Definitions

```
true  := λx y. x          # define a name
false := λx y. y
and p q := p q false      # shorthand: f x y := e  means  f := λx y. e

π and true false          # print to output panel (normalized)
and true false            # last expression line is what gets evaluated
```

Definitions are expanded eagerly. The last non-definition line is loaded and evaluated. `π` lines are evaluated immediately and shown in the output panel; they do not affect the loaded expression.

## Toolbar

Below the editor, a compact toolbar provides three groups:

- **examples** — dropdown; selecting an entry replaces the editor content with a complete example program
- **insert** — dropdown; selecting an entry inserts a block of definitions at the current cursor line
- **storage** — name field + `▾` slot picker + load / save / delete / download; saves named snippets to browser local storage; overwrite and delete both ask for confirmation

## Controls

| Button | Key | Action |
|--------|-----|--------|
| load & run | F5 | Load and immediately run to normal form |
| load | F6 | Parse and load the current expression into the history |
| β-step | F10 | One beta-reduction step |
| η-step | F11 | One eta-reduction step (λx. f x → f) |
| run | F9 | Up to N beta steps (default 1000); press again to continue |
| show substitution | | Show `e[x:=a]` as an intermediate step before beta-reducing |
| find | Ctrl-F | Open the editor's find/replace bar |
| ⚙ | | Settings dialog: max steps per run, max history entries |
| share | | Encode editor content as a URL and copy to clipboard |
| clear | | Clear the editor |

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Ctrl-/` | Toggle `#` comment on current line or all selected lines |
| `( [ { <` with selection | Wrap selected text in the chosen brackets |
| `Alt-L` | Insert λ at cursor |
| `Alt-P` | Insert π at cursor |
| `\name` + `Tab` | Insert Greek letter (e.g. `\omega` → ω) |

## Development

```bash
npm run dev      # start Vite dev server with hot reload
npm run build    # TypeScript compile + production bundle to /dist
npm test         # run Vitest unit tests
tsc --noEmit     # type-check without emitting
```

## Architecture

```
user input → lexer.ts → parser.ts (CST + visitor) → ast.ts → eval.ts → App.tsx
```

Key modules in `src/`:

| File | Role |
|------|------|
| `parser/ast.ts` | `Var`, `Abs`, `App`, `Subst` node types and factory functions |
| `parser/lexer.ts` | Chevrotain tokenizer |
| `parser/parser.ts` | CST parser + AST visitor; `parseProgram` handles multi-line input and definitions; attaches source positions for highlighting |
| `parser/pretty.ts` | Serializes AST back to surface syntax; `assertRoundTrip` sanity check |
| `evaluator/eval.ts` | Normal-order beta/eta reduction, `alphaEq` for definition matching |
| `highlight.ts` | CodeMirror syntax highlighting using the live parse result |
| `editor.ts` | CodeMirror theme and custom keybindings |
| `AstView.tsx` | Collapsible AST tree component |
| `HelpModal.tsx` | In-app help/reference dialog |
| `App.tsx` | UI: editor, controls, step history, parse output |
| `data/examples.ts` | Built-in example programs |
| `data/snippets.ts` | Insertable definition blocks |
