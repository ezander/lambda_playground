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

// ── Colon-commands (:import, :mixin, :set, :print, :assert, :eval) ──────────
// Custom matchers ensure these only match at the start of a line (offset 0 or
// preceded by \n), preventing false matches mid-line.

function colonCmd(re: RegExp): (text: string, startOffset: number) => RegExpExecArray | null {
  return (text, startOffset) => {
    if (startOffset > 0 && text[startOffset - 1] !== "\n") return null;
    re.lastIndex = startOffset;
    return re.exec(text);
  };
}

// Directive — captures any `:<word> …` line at start-of-line, except the
// statement commands :print / :assert / :eval (which lex as separate tokens).
// Unknown directives are reported by the semantic layer (processDirective).
export const Directive = createToken({
  name: "Directive",
  pattern: colonCmd(/:(?!print\b|assert\b|eval\b)[a-zA-Z][a-zA-Z0-9-]*\b[^\n]*/y),
  line_breaks: false,
  start_chars_hint: [":"],
});

// Find the offset of `#` that starts a trailing line comment inside a directive's
// captured text. `#` inside the path's double-quoted string doesn't count.
// Returns -1 when there's no comment. Shared between semantics (for parsing) and
// highlight (for splitting the directive token into pragma + comment ranges).
export function findDirectiveCommentStart(text: string): number {
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inQuote = !inQuote;
    else if (c === "#" && !inQuote) return i;
  }
  return -1;
}

// Command keywords — alternatives to π symbol. Assertions use `:assert <a> ≡ <b>`
// (or ≢) — no separate :assert-not keyword.
export const CmdPrint     = createToken({ name: "CmdPrint",     pattern: colonCmd(/:print\b/y),  line_breaks: false, start_chars_hint: [":"] });
export const CmdAssert    = createToken({ name: "CmdAssert",    pattern: colonCmd(/:assert\b/y), line_breaks: false, start_chars_hint: [":"] });
export const CmdEval      = createToken({ name: "CmdEval",      pattern: colonCmd(/:eval\b/y),   line_breaks: false, start_chars_hint: [":"] });

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
// A newline followed by an indented line with content is a continuation — the
// newline is skipped so the parser sees one long statement. A blank line
// (whether truly empty or whitespace-only) breaks continuation.

// Continuation newline: matched when the immediately-following line starts
// with whitespace AND contains non-whitespace content.
// Placed in SKIPPED group so the parser never sees it.
export const ContNewLine = createToken({
  name: "ContNewLine",
  pattern: (text, startOffset) => {
    if (text[startOffset] !== "\n" && !(text[startOffset] === "\r" && text[startOffset + 1] === "\n"))
      return null;
    let pos = startOffset;
    if (text[pos] === "\r") pos++;
    pos++; // skip \n
    if (text[pos] !== " " && text[pos] !== "\t") return null;
    let scan = pos;
    while (scan < text.length && (text[scan] === " " || text[scan] === "\t")) scan++;
    if (scan >= text.length) return null;
    if (text[scan] === "\n" || (text[scan] === "\r" && text[scan + 1] === "\n")) return null;
    const result = [""] as unknown as RegExpExecArray;
    result.index = startOffset;
    result[0] = text.slice(startOffset, startOffset + (text[startOffset] === "\r" ? 2 : 1));
    return result;
  },
  line_breaks: true,
  start_chars_hint: ["\n", "\r"],
  group: Lexer.SKIPPED,
});

// Regular newline: statement separator (only matches when ContNewLine didn't).
export const NewLine = createToken({ name: "NewLine", pattern: /\r?\n/, line_breaks: true });
export const Semi    = createToken({ name: "Semi",    pattern: /;/    });

// Tokens — order matters: more specific / longer patterns first
export const Lambda  = createToken({ name: "Lambda",  pattern: /λ/ });
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
// Excludes the reserved Greek letters λ (\u03BB), α (\u03B1), β (\u03B2),
// η (\u03B7) so those are always standalone tokens, never absorbed into a
// PlainIdent (or an eagerBinder's name suffix) regardless of position.
export const MIXED = /[a-zA-Z0-9_'\u0370-\u03B0\u03B3-\u03B6\u03B8-\u03BA\u03BC-\u03FF+\-*\/^~&|<>!?=\u00AC\u00B1\u00D7\u00F7\u2190-\u21FF\u2205\u2208\u2218\u221E\u2227-\u222A\u2260\u2264-\u2265\u2286\u2295\u2297\u22A4-\u22A5]/.source;

// Eager binder: β fused immediately to an identifier (plain or backtick-quoted),
// no whitespace between β and the name.
// Marks the parameter as call-by-value — the argument is reduced before substitution.
// Listed before Beta and PlainIdent: "βx" lexes as one EagerBinder; "β x" still
// lexes as Beta + PlainIdent. Deliberately NOT in the Identifier category — the
// parser allows EagerBinder only in binder positions (λ params, [x:=a] sugar),
// never as a definition name or a free variable reference.
export const EagerBinder = createToken({
  name: "EagerBinder",
  pattern: new RegExp(`β(?:${MIXED}+|\`[^\`\\n]+\`)`),
});

// Plain identifier: one or more characters from the mixed charset.
// Operator and alphanumeric chars may be freely mixed (e.g. "+3", "5-", "x+y" are all valid).
// Reserved tokens (α, β, η, λ, ≡, ≢, ∀, ∃, ⊢) take priority via allTokens ordering.
export const PlainIdent = createToken({
  name: "PlainIdent",
  pattern: new RegExp(`${MIXED}+`),
  categories: [Identifier],
});

export const allTokens = [
  BlockComment,             // before Directive, LineComment (so #* wins over #)
  UnterminatedBlockComment, // before LineComment (so unterminated #* wins over #)
  Directive,                // before RedefAssign/DefAssign (: at line start wins over :=)
  CmdAssert,                // before RedefAssign/DefAssign
  CmdPrint,                 // before RedefAssign/DefAssign
  CmdEval,                  // before RedefAssign/DefAssign
  LineComment,              // after block comment
  WhiteSpace,               // skip spaces/tabs (not newlines)
  ContNewLine,              // continuation newline (skipped) — before NewLine
  NewLine,                  // significant statement separator
  Semi,                     // significant statement separator
  RedefAssign,              // ::= before := so longer match wins
  DefAssign,                // := before Dot so := isn't split into : + =
  Dot,
  Lambda,
  EagerBinder,                            // βident must win over Beta+Ident (longest match)
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
