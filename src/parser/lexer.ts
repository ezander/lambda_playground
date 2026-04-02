import { createToken, Lexer } from "chevrotain";

// Category token for any identifier-like token (plain or backtick-quoted)
export const IdentifierLike = createToken({ name: "IdentifierLike", pattern: Lexer.NA });

// Tokens — order matters: more specific / longer patterns first
export const Backslash  = createToken({ name: "Backslash",  pattern: /\\|λ/ });
export const Pi         = createToken({ name: "Pi",         pattern: /π/ });
export const DefAssign  = createToken({ name: "DefAssign",  pattern: /:=/ }); // definition and substitution separator
export const Dot        = createToken({ name: "Dot",        pattern: /\./ }); // lambda body separator
export const LParen     = createToken({ name: "LParen",     pattern: /\(/ });
export const RParen     = createToken({ name: "RParen",     pattern: /\)/ });
export const LBracket   = createToken({ name: "LBracket",   pattern: /\[/ });
export const RBracket   = createToken({ name: "RBracket",   pattern: /\]/ });

// Reserved Greek letters — not valid as standalone identifiers.
// Put before Identifier so that bare α/β/η lex as these tokens (same-length tie goes to first
// in allTokens). Longer sequences like αx still lex as Identifier (longer match always wins).
export const Alpha = createToken({ name: "Alpha", pattern: /α/ });
export const Beta  = createToken({ name: "Beta",  pattern: /β/ });
export const Eta   = createToken({ name: "Eta",   pattern: /η/ });

// Backtick-quoted identifier: `anything except backtick and newline`
export const BacktickIdent = createToken({
  name: "BacktickIdent",
  pattern: /`[^`\n]+`/,
  categories: [IdentifierLike],
});

// Mixed charset: alphanumeric/Greek + operator chars (used as suffix in both token types below)
// An identifier is either alphanumeric-starting or operator-starting, but both may freely mix
// alphanumeric and operator chars after the first character — so +3, 3+3, a+b are all one token.
// Note: : is excluded so := is never consumed as part of an identifier.
const MIXED = /[a-zA-Z0-9_\u0370-\u03BA\u03BC-\u03BF\u03C1-\u03FF+\-*\/^~&|<>!?=]/.source;

export const OperatorIdent = createToken({
  name: "OperatorIdent",
  pattern: new RegExp(`[+\\-*\\/^~&|<>!?=]${MIXED}*`),
  categories: [IdentifierLike],
});

// Identifier: starts with alphanumeric/Greek; may contain operator chars after the first char.
// Excludes λ=\u03BB and π=\u03C0 so those always lex as Backslash/Pi.
export const Identifier = createToken({
  name: "Identifier",
  pattern: new RegExp(`[a-zA-Z0-9_\\u0370-\\u03BA\\u03BC-\\u03BF\\u03C1-\\u03FF]${MIXED}*`),
  categories: [IdentifierLike],
});

// Whitespace: skipped
export const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

// Line comment: # until end of line, skipped
export const LineComment = createToken({
  name: "LineComment",
  pattern: /#[^\n]*/,
  group: Lexer.SKIPPED,
});

export const allTokens = [
  LineComment,      // before WhiteSpace so # is matched first
  WhiteSpace,
  DefAssign,        // := before Dot so := isn't split into : + .  (: isn't a token but safer)
  Dot,
  Backslash,
  Pi,
  Alpha, Beta, Eta, // reserved Greek — before Identifier (same-length tie → first wins)
  LParen,
  RParen,
  LBracket,
  RBracket,
  BacktickIdent,    // before Identifier so backtick pattern takes priority
  OperatorIdent,    // before Identifier (disjoint charsets, but explicit ordering)
  Identifier,
  IdentifierLike,   // category — Lexer.NA, no actual matching; must be in list for parser
];

export const LambdaLexer = new Lexer(allTokens);
