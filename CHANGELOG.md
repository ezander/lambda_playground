# Changelog

All notable changes to the λ playground are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Performance
- Substitution into a non-trivial term (Y combinator, Church numerals, etc.) is now linear in the term size instead of effectively quadratic. Heavy reductions are ~10–15× faster.
- Term size is now cached on every AST node at construction. The size-limit check inside the eval loop is O(1) instead of O(term-size) per step, removing a hidden quadratic factor on long reductions.

### Added
- Changelog tab in the help modal.
- `max history size` setting (default 200000): caps the *total* AST nodes summed across all retained history entries. Oldest entries are dropped when the sum exceeds the limit. Complements `max history` (entry count).
- Reset button in the settings modal: repopulates all fields with the current defaults (still requires ok to apply). Useful after default-value changes like the limit bumps below.

### Changed
- Default limits raised to take advantage of the substitution and size-check speedups: `max steps (print)` 1000 → 10000, `max steps (ident)` 1000 → 10000, `max term size` 3000 → 30000. `max steps (run)` stays at 1000 (the eval-panel "continue" button is the natural escape valve).

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
