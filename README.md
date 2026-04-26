# λ playground

An interactive browser-based environment for the untyped lambda calculus with step-by-step beta/eta reduction, definitions, an include system, and syntax highlighting.

> 99% vibe-coded — all implementation by [Claude Code](https://claude.ai/code).

## Features

- Multi-line input: definitions and expressions, one per line (or `;`-separated)
- Named definitions with eager expansion; shorthand `f x y := e` desugars to `f := λx y. e`
- `π expr` / `:print expr` — evaluate to normal form and show in output panel
- `≡ expr1 expr2` / `:assert` — equivalence assertion (alpha-beta equivalence)
- `≢ expr1 expr2` / `:assert-not` — non-equivalence assertion
- Comprehension bindings: `≡[p:={true,false}] (not (not p)) p`
- Normal-order (leftmost-outermost) beta reduction with capture-avoiding substitution
- Step-by-step or batch evaluation; optional substitution display; eta reduction
- Import system: `:import "std/Church Booleans"`, `:mixin`, quiet imports
- Bundled libraries (booleans, numerals, pairs, lists, combinators) with symbolic alias mixins
- Live syntax highlighting: defined names, lambda binders, bound/free variables, comments
- Greek letters and logic symbols in identifiers; backtick-quoted identifiers for arbitrary names
- Issues panel showing errors and warnings with click-to-jump
- Named buffers with auto-save; export/import as zip; share via URL
- Docs, tutorials, and examples accessible from toolbar dropdowns
- CodeMirror 6 editor with custom keybindings, autocomplete, block comment auto-close, paragraph reflow

## Syntax

```
λx. body             # lambda abstraction
λx y z. body         # multi-param (desugars to nested abstractions)
λβx. body            # strict binder: argument reduced before substitution (call-by-value)
f x y                # application (left-associative)
e[x:=a]              # explicit substitution: desugars to (λx. e) a
+ m n := m S n       # operator identifier as definition name
# comment            # rest of line ignored
#* block comment *#  # multi-line comment
;                    # statement separator (same as newline)
f :=                 # line continuation: indented lines
  λx. x              #   continue the previous statement
```

### Identifiers

Plain identifiers are any non-empty sequence of ASCII letters, digits, underscores, apostrophes, Greek letters (`\u0370–\u03FF`, excluding λ and π; α, η, ∀, ∃, ⊢ are reserved; β is reserved unless fused to a binder name as in `λβx. body`), and operator characters (`+ - * / ^ ~ & | < > ! ? =`). Logic symbols (∧ ∨ ¬ → ↔ ⊤ ⊥ ⊕ ⊗ ∘ ≠ ∅) are also valid in identifiers.

Backtick-quoted identifiers allow arbitrary names:

```
`church 0` := λf x. x
`church 0`              # evaluates the definition
```

Names starting with `_` are private: they work locally but are not exported across `:import`/`:mixin` boundaries.

### Directives

Lines starting with `:` are directives:

```
:import "std/Church Booleans"   # import definitions from a module
:import "user/my-buffer"        # import from a named user buffer
:import "std/Pairs" quiet       # import without polluting autocomplete/match list
:mixin "std/Boolean Tests"      # import that can see existing defs
:print expr                     # alternative to π
:assert atom1 atom2             # alternative to ≡
:assert-not atom1 atom2         # alternative to ≢
:set max-steps 500              # set both max-steps-print and max-steps-ident
:set max-steps-print 500        # beta step limit for π statements
:set max-steps-ident 500        # beta step limit for definition matching
:set max-history 20             # max history entries stored
:set max-size 5000              # max AST nodes before reduction halts
:set no-normalize-defs          # disable definition body normalization
:set allow-eta                  # enable η-reduction during normalization
:eval expr                      # load expression into eval panel (last wins)
:infix + * ^^                   # mark defs as infix: a + b is read as + a b
```

### Definitions

```
true  := λx y. x          # define a name
false := λx y. y
and p q := p q false       # shorthand: f x y := e  means  f := λx y. e

π and true false           # print to output panel (normalized)
≡ (and true false) false   # assert equivalence
≢ true false               # assert non-equivalence
and true false             # last expression is loaded into the eval panel
```

Definitions are expanded eagerly. Redefinition with `::=` suppresses the warning when the normal form changes. `π`, `≡`, and `≢` results appear in the output panel; a failing assertion halts further evaluation.

## Controls

| Button | Key | Action |
|--------|-----|--------|
| run | F5 | Load and beta-reduce to normal form |
| reset | F6 | Reset to step 0 |
| β-step | F10 | One beta-reduction step |
| η-step | F11 | One eta-reduction step (λx. f x → f) |
| continue | F9 | Continue beta-reducing up to N steps |

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Ctrl-/` | Toggle `#` comment on current line or selection |
| `Ctrl-R` | Reflow paragraph in block comment |
| `( [ {` with selection | Wrap in brackets |
| `` ` `` | Wrap in backticks, or insert paired backticks |
| `#*` | Auto-insert closing `*#` |
| `Alt-L` | Insert λ at cursor |
| `Alt-P` | Insert π at start of line |
| `Alt-E` | Insert ≡ at start of line |
| `Alt-N` | Insert ≢ at start of line |
| `Alt-Space` | Autocomplete (def names, directives, import paths) |
| `\name` + `Space` | Insert symbol (e.g. `\omega` → ω, `\and` → ∧) |

## Development

```bash
npm run dev      # start Vite dev server with hot reload
npm run build    # TypeScript compile + production bundle to /dist
npm test         # run Vitest unit tests
npx tsc --noEmit # type-check without emitting
```

## Architecture

```
user input → lexer.ts → grammar.ts (CST + visitor) → semantics.ts (AST + eval) → App.tsx
```

Key modules in `src/`:

| File | Role |
|------|------|
| `parser/lexer.ts` | Chevrotain tokenizer |
| `parser/grammar.ts` | CST parser + AST visitor |
| `parser/semantics.ts` | Statement processing: definitions, directives, print/equiv |
| `parser/ast.ts` | `Var`, `Abs`, `App`, `Subst` node types |
| `parser/types.ts` | Shared types: `ProgramResult`, `PragmaConfig`, `DefEntry`, etc. |
| `parser/pretty.ts` | AST → surface syntax serializer |
| `evaluator/eval.ts` | Normal-order beta/eta reduction, `alphaEq`, `termSize` |
| `highlight.ts` | CodeMirror syntax highlighting from live parse result |
| `links.ts` | Clickable `[type/name]` links in comments; `:import`/`:mixin` path links |
| `autocomplete.ts` | Alt-Space autocomplete for defs, directives, import paths |
| `editor.ts` | CodeMirror theme, keybindings, symbol expansion |
| `rewrap.ts` | Ctrl-R paragraph reflow for block comments |
| `storage.ts` | localStorage key constants, buffer helpers, content resolution |
| `config.ts` | `Config` type and `DEFAULT_CONFIG` |
| `data/content.ts` | Bundled `.txt` content loader; ordered display lists |
| `App.tsx` | Main UI: editor, eval panel, output panel, issues panel |
| `HelpModal.tsx` | In-app help/reference dialog |
| `SettingsModal.tsx` | Settings dialog |
