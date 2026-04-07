import { createToken, Lexer } from "chevrotain";

// Category token for any identifier-like token (plain or backtick-quoted)
export const IdentifierLike = createToken({ name: "IdentifierLike", pattern: Lexer.NA });

// Block comments: #* ... *# (terminated) and #* ... EOF (unterminated).
// Must come before PragmaLine and LineComment so #* wins over #! and #.
export const BlockComment = createToken({
  name: "BlockComment",
  pattern: /#\*[\s\S]*?\*#/,
  line_breaks: true,
  group: "comment",
});

export const UnterminatedBlockComment = createToken({
  name: "UnterminatedBlockComment",
  pattern: /#\*[\s\S]*/,
  line_breaks: true,
  group: "comment",
});

// Pragma directive (#! ...) — before LineComment so #! wins over #.
// No group: pragmas are language constructs that appear in the main token stream.
export const PragmaLine = createToken({
  name: "PragmaLine",
  pattern: /#![^\n]*/,
});

// Line comment: # until end of line — after PragmaLine so #! does not fall here.
// group: "comment" keeps comments accessible for syntax highlighting but out of the parser stream.
export const LineComment = createToken({
  name: "LineComment",
  pattern: /#[^\n]*/,
  group: "comment",
});

// Whitespace: spaces and tabs only — newlines are significant statement separators.
export const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /[^\S\n]+/,
  group: Lexer.SKIPPED,
});

// Statement separators
export const NewLine = createToken({ name: "NewLine", pattern: /\r?\n/ });
export const Semi    = createToken({ name: "Semi",    pattern: /;/    });

// Tokens — order matters: more specific / longer patterns first
export const Backslash  = createToken({ name: "Backslash",  pattern: /\\|λ/ });
export const Pi         = createToken({ name: "Pi",         pattern: /π/ });
export const DefAssign  = createToken({ name: "DefAssign",  pattern: /:=/ }); // definition and substitution separator
export const Dot        = createToken({ name: "Dot",        pattern: /\./ }); // lambda body separator
export const LParen     = createToken({ name: "LParen",     pattern: /\(/ });
export const RParen     = createToken({ name: "RParen",     pattern: /\)/ });
export const LBracket   = createToken({ name: "LBracket",   pattern: /\[/ });
export const RBracket   = createToken({ name: "RBracket",   pattern: /\]/ });
export const LBrace     = createToken({ name: "LBrace",     pattern: /\{/ });
export const RBrace     = createToken({ name: "RBrace",     pattern: /\}/ });
export const Comma      = createToken({ name: "Comma",      pattern: /,/  });

// Reserved Greek letters — not valid as standalone identifiers.
export const Alpha = createToken({ name: "Alpha", pattern: /α/ });
export const Beta  = createToken({ name: "Beta",  pattern: /β/ });
export const Eta   = createToken({ name: "Eta",   pattern: /η/ });

// Reserved logic symbols — not valid as identifiers (future syntax: types, assertions, proofs).
export const ForAll    = createToken({ name: "ForAll",    pattern: /∀/ });
export const Exists    = createToken({ name: "Exists",    pattern: /∃/ });
export const Equiv     = createToken({ name: "Equiv",     pattern: /≡/ });
export const Turnstile = createToken({ name: "Turnstile", pattern: /⊢/ });

// Backtick-quoted identifier: `anything except backtick and newline`
export const BacktickIdent = createToken({
  name: "BacktickIdent",
  pattern: /`[^`\n]+`/,
  categories: [IdentifierLike],
});

// Free logic/math symbols usable as identifier characters.
const LOGIC_FREE = /[\u00AC\u2190-\u21FF\u2205\u2218\u2227-\u2228\u2260\u2295\u2297\u22A4-\u22A5]/.source;

// Mixed charset: alphanumeric/Greek + operator chars + free logic symbols.
const MIXED = /[a-zA-Z0-9_'\u0370-\u03BA\u03BC-\u03BF\u03C1-\u03FF+\-*\/^~&|<>!?=\u00AC\u2190-\u21FF\u2205\u2218\u2227-\u2228\u2260\u2295\u2297\u22A4-\u22A5]/.source;

export const OperatorIdent = createToken({
  name: "OperatorIdent",
  pattern: new RegExp(`(?:[+\\-*\\/^~&|<>!?=']|${LOGIC_FREE})${MIXED}*`),
  categories: [IdentifierLike],
});

// Identifier: starts with alphanumeric/Greek; may contain operator chars after the first char.
// Excludes λ=\u03BB and π=\u03C0 so those always lex as Backslash/Pi.
export const Identifier = createToken({
  name: "Identifier",
  pattern: new RegExp(`[a-zA-Z0-9_\\u0370-\\u03BA\\u03BC-\\u03BF\\u03C1-\\u03FF]${MIXED}*`),
  categories: [IdentifierLike],
});

export const allTokens = [
  BlockComment,             // before PragmaLine, LineComment (so #* wins over #! and #)
  UnterminatedBlockComment, // before LineComment (so unterminated #* wins over #)
  PragmaLine,               // before LineComment (#! wins over #)
  LineComment,              // after pragma
  WhiteSpace,               // skip spaces/tabs (not newlines)
  NewLine,                  // significant statement separator
  Semi,                     // significant statement separator
  DefAssign,                // := before Dot so := isn't split into : + =
  Dot,
  Backslash,
  Pi,
  Alpha, Beta, Eta,                       // reserved Greek — before Identifier (same-length tie → first wins)
  ForAll, Exists, Equiv, Turnstile,       // reserved logic — same strategy
  LParen,
  RParen,
  LBracket,
  RBracket,
  LBrace,
  RBrace,
  Comma,
  BacktickIdent,    // before Identifier so backtick pattern takes priority
  OperatorIdent,    // before Identifier (disjoint charsets, but explicit ordering)
  Identifier,
  IdentifierLike,   // category — Lexer.NA, no actual matching; must be in list for parser
];

export const LambdaLexer = new Lexer(allTokens);
