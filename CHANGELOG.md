# Changelog

All notable changes to the λ playground are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Performance
- Substitution into a non-trivial term (Y combinator, Church numerals, etc.) is now linear in the term size instead of effectively quadratic. Heavy reductions are ~10–15× faster.

### Added
- Changelog tab in the help modal.

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
