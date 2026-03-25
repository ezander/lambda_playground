import { createToken, Lexer } from "chevrotain";

// Tokens - order matters: more specific patterns first
export const Backslash = createToken({ name: "Backslash", pattern: /\\/ });
export const Assign    = createToken({ name: "Assign",    pattern: /:=|\./ });
export const LParen    = createToken({ name: "LParen",    pattern: /\(/ });
export const RParen    = createToken({ name: "RParen",    pattern: /\)/ });

// Identifier: starts with a letter, then letters/digits/underscores
export const Identifier = createToken({
  name: "Identifier",
  pattern: /[a-zA-Z][a-zA-Z0-9_]*/,
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
  LineComment, // before WhiteSpace so # is matched first
  WhiteSpace,
  Assign,      // must come before Identifier (`:=` is not an identifier but be safe)
  Backslash,
  LParen,
  RParen,
  Identifier,
];

export const LambdaLexer = new Lexer(allTokens);
