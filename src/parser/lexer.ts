import { createToken, Lexer } from "chevrotain";

// Tokens - order matters: more specific patterns first
export const Backslash  = createToken({ name: "Backslash",  pattern: /\\/ });
export const DefAssign  = createToken({ name: "DefAssign",  pattern: /::=/ }); // before Assign
export const Assign     = createToken({ name: "Assign",     pattern: /:=|\./ });
export const LParen    = createToken({ name: "LParen",    pattern: /\(/ });
export const RParen    = createToken({ name: "RParen",    pattern: /\)/ });
export const LBracket  = createToken({ name: "LBracket",  pattern: /\[/ });
export const RBracket  = createToken({ name: "RBracket",  pattern: /\]/ });

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
  DefAssign,   // ::= before := so ::= isn't tokenized as : then :=
  Assign,      // must come before Identifier (`:=` is not an identifier but be safe)
  Backslash,
  LParen,
  RParen,
  LBracket,
  RBracket,
  Identifier,
];

export const LambdaLexer = new Lexer(allTokens);
