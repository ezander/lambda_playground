# Changelog

All notable changes to the λ playground are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
