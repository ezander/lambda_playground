import { createToken, Lexer } from "chevrotain";

// Category token for any identifier-like token (plain or backtick-quoted)
export const IdentifierLike = createToken({ name: "IdentifierLike", pattern: Lexer.NA });

// Tokens — order matters: more specific / longer patterns first
export const Backslash  = createToken({ name: "Backslash",  pattern: /\\|λ/ });
export const Pi         = createToken({ name: "Pi",         pattern: /π/ });
export const Assign     = createToken({ name: "Assign",     pattern: /:=|\./ }); // before Equals so := isn't split
export const Equals     = createToken({ name: "Equals",     pattern: /=/ });
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

// Identifier: letters, digits, underscores, and Greek letters (excluding λ=\u03BB and π=\u03C0
// so that those chars always lex as Backslash/Pi regardless of context).
export const Identifier = createToken({
  name: "Identifier",
  pattern: /[a-zA-Z0-9_\u0370-\u03BA\u03BC-\u03BF\u03C1-\u03FF]+/,
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
  LineComment,     // before WhiteSpace so # is matched first
  WhiteSpace,
  Assign,          // := and . before Equals so := isn't split into : + =
  Equals,
  Backslash,
  Pi,
  Alpha, Beta, Eta, // reserved Greek — before Identifier (same-length tie → first wins)
  LParen,
  RParen,
  LBracket,
  RBracket,
  BacktickIdent,   // before Identifier so backtick pattern takes priority
  Identifier,
  IdentifierLike,  // category — Lexer.NA, no actual matching; must be in list for parser
];

export const LambdaLexer = new Lexer(allTokens);
