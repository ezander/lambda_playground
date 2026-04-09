import { createToken, Lexer } from "chevrotain";

// Category token for any identifier (plain or backtick-quoted)
export const Identifier = createToken({ name: "Identifier", pattern: Lexer.NA });

// Block comments: #* ... *# (terminated) and #* ... EOF (unterminated).
// Must come before Pragma and LineComment so #* wins over #! and #.
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
export const Pragma = createToken({
  name: "Pragma",
  pattern: /#![^\n]*/,
});

// Line comment: # until end of line — after Pragma so #! does not fall here.
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
export const RedefAssign = createToken({ name: "RedefAssign", pattern: /::=/ }); // intentional redefinition
export const DefAssign   = createToken({ name: "DefAssign",  pattern: /:=/  }); // definition and substitution separator
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
export const NEquiv    = createToken({ name: "NEquiv",    pattern: /≢/ });
export const Turnstile = createToken({ name: "Turnstile", pattern: /⊢/ });

// Backtick-quoted identifier: `anything except backtick and newline`
export const BacktickIdent = createToken({
  name: "BacktickIdent",
  pattern: /`[^`\n]+`/,
  categories: [Identifier],
});

// Mixed charset: alphanumeric/Greek + operator chars + free logic symbols.
// Excludes λ (\u03BB) and π (\u03C0) so those always lex as Backslash/Pi.
const MIXED = /[a-zA-Z0-9_'\u0370-\u03BA\u03BC-\u03BF\u03C1-\u03FF+\-*\/^~&|<>!?=\u00AC\u2190-\u21FF\u2205\u2218\u2227-\u2228\u2260\u2295\u2297\u22A4-\u22A5]/.source;

// Plain identifier: one or more characters from the mixed charset.
// Operator and alphanumeric chars may be freely mixed (e.g. "+3", "5-", "x+y" are all valid).
// Reserved tokens (α, β, η, π, λ, ≡, ≢, ∀, ∃, ⊢) take priority via allTokens ordering.
export const PlainIdent = createToken({
  name: "PlainIdent",
  pattern: new RegExp(`${MIXED}+`),
  categories: [Identifier],
});

export const allTokens = [
  BlockComment,             // before Pragma, LineComment (so #* wins over #! and #)
  UnterminatedBlockComment, // before LineComment (so unterminated #* wins over #)
  Pragma,                   // before LineComment (#! wins over #)
  LineComment,              // after Pragma
  WhiteSpace,               // skip spaces/tabs (not newlines)
  NewLine,                  // significant statement separator
  Semi,                     // significant statement separator
  RedefAssign,              // ::= before := so longer match wins
  DefAssign,                // := before Dot so := isn't split into : + =
  Dot,
  Backslash,
  Pi,
  Alpha, Beta, Eta,                       // reserved Greek — before PlainIdent (same-length tie → first wins)
  ForAll, Exists, Equiv, NEquiv, Turnstile, // reserved logic — same strategy
  LParen,
  RParen,
  LBracket,
  RBracket,
  LBrace,
  RBrace,
  Comma,
  BacktickIdent,    // before PlainIdent so backtick pattern takes priority
  PlainIdent,
  Identifier,       // category — Lexer.NA, no actual matching; must be in list for parser
];

export const LambdaLexer = new Lexer(allTokens);
