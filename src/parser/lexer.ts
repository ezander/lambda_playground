import { createToken, Lexer } from "chevrotain";

// Tokens - order matters: more specific patterns first
export const Backslash  = createToken({ name: "Backslash",  pattern: /\\|λ/ });
export const Pi         = createToken({ name: "Pi",         pattern: /π/ });
export const Assign     = createToken({ name: "Assign",     pattern: /:=|\./ }); // before Equals so := isn't split
export const Equals     = createToken({ name: "Equals",     pattern: /=/ });
export const LParen     = createToken({ name: "LParen",     pattern: /\(/ });
export const RParen     = createToken({ name: "RParen",     pattern: /\)/ });
export const LBracket   = createToken({ name: "LBracket",   pattern: /\[/ });
export const RBracket   = createToken({ name: "RBracket",   pattern: /\]/ });

// Identifier: any non-empty sequence of letters, digits, underscores
export const Identifier = createToken({
  name: "Identifier",
  pattern: /[a-zA-Z0-9_]+/,
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
  Assign,      // := and . before Equals so := isn't split into : + =
  Equals,
  Backslash,
  Pi,
  LParen,
  RParen,
  LBracket,
  RBracket,
  Identifier,
];

export const LambdaLexer = new Lexer(allTokens);
