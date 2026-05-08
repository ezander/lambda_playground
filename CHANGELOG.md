# Changelog

All notable changes to the λ playground are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-05-09

### Added
- `:print-list[head:=h, tail:=t, nil:=z, max:=N] listExpr` — unfold a list and print one row per element; selectors default to top-level defs of the same name, terminates on `tail≡nil`, fixpoint, or `max` (default 100).

### Changed
- Parens around an infix var (`(+)`, `f (+)`, `map (+)`) now suppress the infix swap — the var is treated as expression-context, so it stays in arg/func position untouched. Backticks still don't escape (they're only an alternate identifier syntax).

## [1.1.0] - 2026-05-07

### Added
- `:import[prefix="…"] "path"` — prepend a string to every imported public name, letting two libraries coexist (`:import[prefix="C"] "Church Numerals"` and `:import[prefix="S"] "Scott Numerals"` give `C0`/`S0`, …). The idiom `:import[prefix="_"] "lib"` makes an import private locally.
- Output panel: each print / ≡ / bare expression now shows a muted runtime-stats badge — β-reductions, time, and peak term size during evaluation. Equiv assertions show the aggregate, with the lhs/rhs breakdown in the tooltip.

### Changed
- `:import` / `:mixin` options moved into a bracketed prefix (`:import[quiet] "path"`); the old trailing `quiet` keyword is parsed but warns.
- `F5` now only reduces the current expression in the eval panel. `Ctrl-F5` runs the print / ≡ statements in the output panel. `Ctrl-Shift-F5` toggles auto-run.
- Output panel rows: row-wide click replaced by explicit hover buttons — a goto-source button on each source line, a copy-result button on each result line. Status text reads flush-right.
- Dialect importer (toolbar `import`): unindents the whole input by default.

### Fixed
- `F5` no longer resets the eval panel after running.
- Dialect importer (toolbar `import`): accepts identifiers that start with a digit.
- Aliased imports (e.g. `+ := plus` in `Numeric Symbols`) now identify in the match list under `:set no-normalize-defs` and through `:mixin` boundaries.

## [1.0.4] - 2026-05-04

### Added
- Dialect importer (toolbar `import`): lexical converter for files in other LC dialects.

### Changed
- Renamed the zip export/import feature to backup/restore (button labels, modal, tooltips).

### Fixed
- Output panel no longer silently re-evaluates after a Run when the source round-trips (undo) or a cosmetic config field changes; repeat Run clicks now always re-fire.
- Run button is always enabled while auto-run is off.

## [1.0.3] - 2026-05-04

### Performance
- Substitution into large terms is now linear, not quadratic; heavy reductions ~10–15× faster.
- Term size cached on AST nodes; eval-loop size check is O(1).

### Added
- Changelog tab in the help modal.
- `max history size` setting (default 200000): caps total AST nodes across history entries.
- Reset button in the settings modal: repopulates fields with current defaults.

### Changed
- Default limits raised: `max steps (print)` and `max steps (ident)` 1000 → 10000, `max term size` 3000 → 30000.

## [1.0.2] - 2026-04-30

### Added
- Copy-to-clipboard buttons in the output panel.
- Sanity asserts in the Numeric Symbols stdlib.
- *lambster* in the Literature page.

### Changed
- Import-path completion now does substring filtering.

## [1.0.1] - 2026-04-29

### Added
- Warning when a line starts with whitespace but is not a continuation.

### Changed
- Whitespace-only lines now also break statement continuation.

## [1.0.0] - 2026-04-29

First stable release.

### Added
- Highlight the matching output cell as the cursor moves through the editor.

### Changed
- Renamed *pragma* → *directive* / *option*; friendlier unknown-directive errors.
- Reworked docs (Normalization, Identification, Import, Directives, Printing, User Interface).
- Generalized Boolean operators to any if/true/false implementation.
