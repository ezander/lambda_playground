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

// Directive — captures the entire line content for :import, :mixin, :set, :infix.
export const Directive = createToken({
  name: "Directive",
  pattern: colonCmd(/:(?:import|mixin|set|infix)\b[^\n]*/y),
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
// A newline followed by an indented (non-empty) line is a continuation — the
// newline is skipped so the parser sees one long statement.  Whitespace-only
// lines between continuations are absorbed.

// Continuation newline: matched when the next non-empty line starts with whitespace.
// Placed in SKIPPED group so the parser never sees it.
export const ContNewLine = createToken({
  name: "ContNewLine",
  pattern: (text, startOffset) => {
    if (text[startOffset] !== "\n" && !(text[startOffset] === "\r" && text[startOffset + 1] === "\n"))
      return null;
    let pos = startOffset;
    if (text[pos] === "\r") pos++;
    pos++; // skip \n
    // Skip whitespace-only lines (but NOT empty lines — those break continuation)
    while (pos < text.length) {
      // Empty line (immediate newline) → stop, this breaks continuation
      if (text[pos] === "\n" || (text[pos] === "\r" && text[pos + 1] === "\n")) break;
      // Non-newline char — check if this line is whitespace-only
      let lineEnd = pos;
      while (lineEnd < text.length && text[lineEnd] !== "\n" && text[lineEnd] !== "\r") lineEnd++;
      if (text.slice(pos, lineEnd).trim() === "") { pos = lineEnd === text.length ? lineEnd : lineEnd + 1; continue; }
      break;
    }
    // Next non-empty line starts with whitespace → continuation
    if (pos < text.length && (text[pos] === " " || text[pos] === "\t")) {
      const result = [""] as unknown as RegExpExecArray;
      result.index = startOffset;
      result[0] = text.slice(startOffset, startOffset + (text[startOffset] === "\r" ? 2 : 1));
      return result;
    }
    return null;
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
// Excludes the reserved Greek letters λ (\u03BB), π (\u03C0), α (\u03B1), β (\u03B2),
// η (\u03B7) so those are always standalone tokens, never absorbed into a
// PlainIdent (or an eagerBinder's name suffix) regardless of position.
const MIXED = /[a-zA-Z0-9_'\u0370-\u03B0\u03B3-\u03B6\u03B8-\u03BA\u03BC-\u03BF\u03C1-\u03FF+\-*\/^~&|<>!?=\u00AC\u2190-\u21FF\u2205\u2218\u2227-\u2228\u2260\u2295\u2297\u22A4-\u22A5]/.source;

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
  ContNewLine,              // continuation newline (skipped) — before NewLine
  NewLine,                  // significant statement separator
  Semi,                     // significant statement separator
  RedefAssign,              // ::= before := so longer match wins
  DefAssign,                // := before Dot so := isn't split into : + =
  Dot,
  Lambda,
  Pi,
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
