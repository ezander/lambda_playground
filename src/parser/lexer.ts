import { createToken, Lexer } from "chevrotain";

// Category token for any identifier (plain or backtick-quoted)
export const Identifier = createToken({ name: "Identifier", pattern: Lexer.NA });

// Block comments: #* ... *# (terminated) and #* ... EOF (unterminated).
// Must come before Directive and LineComment so #* wins over #.
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

// ── Colon-commands (:import, :mixin, :set, :print, :assert, :assert-not) ─────
// Custom matchers ensure these only match at the start of a line (offset 0 or
// preceded by \n), preventing false matches mid-line.

function colonCmd(re: RegExp): (text: string, startOffset: number) => RegExpExecArray | null {
  return (text, startOffset) => {
    if (startOffset > 0 && text[startOffset - 1] !== "\n") return null;
    re.lastIndex = startOffset;
    return re.exec(text);
  };
}

// Directive — captures the entire line content for :import, :mixin, :set.
export const Directive = createToken({
  name: "Directive",
  pattern: colonCmd(/:(?:import|mixin|set)\b[^\n]*/y),
  line_breaks: false,
  start_chars_hint: [":"],
});

// Command keywords — alternatives to π / ≡ / ≢ symbols.
export const CmdPrint     = createToken({ name: "CmdPrint",     pattern: colonCmd(/:print\b/y),      start_chars_hint: [":"] });
export const CmdAssert    = createToken({ name: "CmdAssert",    pattern: colonCmd(/:assert(?!-)\b/y), start_chars_hint: [":"] });
export const CmdAssertNot = createToken({ name: "CmdAssertNot", pattern: colonCmd(/:assert-not\b/y),  start_chars_hint: [":"] });
export const CmdEval      = createToken({ name: "CmdEval",      pattern: colonCmd(/:eval\b/y),        start_chars_hint: [":"] });

// Line comment: # until end of line.
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
export const Lambda  = createToken({ name: "Lambda",  pattern: /λ/ });
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
// Excludes λ (\u03BB) and π (\u03C0) so those always lex as Lambda / Pi.
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
  BlockComment,             // before Directive, LineComment (so #* wins over #)
  UnterminatedBlockComment, // before LineComment (so unterminated #* wins over #)
  Directive,                // before RedefAssign/DefAssign (: at line start wins over :=)
  CmdAssertNot,             // before CmdAssert (longer match wins)
  CmdAssert,                // before RedefAssign/DefAssign
  CmdPrint,                 // before RedefAssign/DefAssign
  CmdEval,                  // before RedefAssign/DefAssign
  LineComment,              // after block comment
  WhiteSpace,               // skip spaces/tabs (not newlines)
  NewLine,                  // significant statement separator
  Semi,                     // significant statement separator
  RedefAssign,              // ::= before := so longer match wins
  DefAssign,                // := before Dot so := isn't split into : + =
  Dot,
  Lambda,
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
