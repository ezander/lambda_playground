import { useState } from "react";
import { createSyntaxDiagramsCode } from "chevrotain";
import { parser } from "./parser/parser";

// ── EBNF formatter ─────────────────────────────────────────────────────────────

type Gast = { type: string; name?: string; definition?: Gast[] };

const TOKEN_LABELS: Record<string, string> = {
  Pragma:       "'#!…'",
  NewLine:      "'\\n'",
  Semi:         "';'",
  Pi:           "'π'",
  Equiv:        "'≡'",
  DefAssign:    "':='",
  Dot:          "'.'",
  Backslash:    "'λ'|'\\\\'",
  LParen:       "'('",
  RParen:       "')'",
  LBracket:     "'['",
  RBracket:     "']'",
  LBrace:       "'{'",
  RBrace:       "'}'",
  Comma:        "','",
  Identifier:     "identifier",
  PlainIdent:     "plainIdent",
  BacktickIdent:  "backtickIdent",
};

function fmtAtom(g: Gast): string {
  switch (g.type) {
    case "Terminal":    return TOKEN_LABELS[g.name!] ?? g.name!;
    case "NonTerminal": return g.name!;
    case "Alternation": return `(${fmtGroup(g)})`;
    default:            return fmtGroup(g);
  }
}

function needsParens(defs: Gast[]): boolean {
  return defs.length > 1 || (defs.length === 1 && defs[0].type === "Alternation");
}

function wrap(defs: Gast[], suffix: string): string {
  const inner = fmtSeq(defs);
  return needsParens(defs) ? `(${inner})${suffix}` : `${inner}${suffix}`;
}

function fmtGroup(g: Gast): string {
  const d = g.definition ?? [];
  switch (g.type) {
    case "Option":                return wrap(d, "?");
    case "Repetition":            return wrap(d, "*");
    case "RepetitionMandatory":   return wrap(d, "+");
    case "Alternation":
      return d.map(alt => fmtSeq(alt.definition ?? []) || "EOF").join(" | ");
    case "Alternative":           return fmtSeq(d);
    default:                      return `[${g.type}]`;
  }
}

function fmtSeq(defs: Gast[]): string {
  return defs.map(fmtAtom).join(" ");
}

function generateEBNF(): string {
  const rules = parser.getSerializedGastProductions() as Gast[];
  const maxLen = Math.max(...rules.map(r => r.name!.length), "backtickIdent".length);
  const pad = (s: string) => s.padEnd(maxLen);
  const body = rules
    .map(r => `${pad(r.name!)}  ::=  ${fmtSeq(r.definition ?? [])}`)
    .join("\n");
  return body
    + `\n${pad("identifier")}  ::=  plainIdent | backtickIdent`
    + `\n${pad("plainIdent")}  ::=  (alnum | '_' | "'" | greek | op-sym)+`
    + `\n${pad("backtickIdent")}  ::=  '\`' [^\`\\n]+ '\`'`;
}

// ── Component ──────────────────────────────────────────────────────────────────

type Tab = "language" | "editing" | "grammar";

export function HelpModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("language");
  const [diagramHtml, setDiagramHtml] = useState<string | null>(null);

  const handleShowDiagrams = () => {
    if (!diagramHtml) {
      const html = createSyntaxDiagramsCode(
        parser.getSerializedGastProductions() as any
      );
      setDiagramHtml(html);
    }
  };

  // close on Escape
  const onKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Escape") onClose(); };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal help-modal" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <button className="modal-close" onClick={onClose}>✕</button>

        <h2>λ playground</h2>

        {/* ── Tabs ── */}
        <div className="help-tabs">
          <button className={`help-tab-btn${tab === "language" ? " active" : ""}`} onClick={() => setTab("language")}>Language</button>
          <button className={`help-tab-btn${tab === "editing"  ? " active" : ""}`} onClick={() => setTab("editing")}>UI &amp; editing</button>
          <button className={`help-tab-btn${tab === "grammar"  ? " active" : ""}`} onClick={() => setTab("grammar")}>Grammar</button>
        </div>

        {/* ── Language tab ── */}
        {tab === "language" && <>
          <p>
            An interactive playground for an untyped lambda dialect.
            Expressions are evaluated using <strong>normal-order</strong> (leftmost-outermost)
            beta reduction with capture-avoiding substitution.
          </p>

          <h3>syntax</h3>
          <table className="help-table"><tbody>
            <tr><td><code>λx. body</code></td><td>lambda abstraction (<code>\</code> also accepted)</td></tr>
            <tr><td><code>λx y. body</code></td><td>multi-param (desugars to nested lambdas)</td></tr>
            <tr><td><code>f x y</code></td><td>application (left-associative)</td></tr>
            <tr><td><code>e[x:=a]</code></td><td>substitution: desugars to <code>(\x. e) a</code></td></tr>
            <tr><td><code># comment</code></td><td>line comment; <code>#* … *#</code> for block comments</td></tr>
            <tr><td><code>;</code></td><td>statement separator (same as newline)</td></tr>
          </tbody></table>

          <h3>identifiers</h3>
          <table className="help-table"><tbody>
            <tr><td><code>x</code>, <code>x_1</code>, <code>42</code>, <code>ω</code></td><td>alphanumeric + Greek (except λ, π); may start with a digit; α/β/η/∀/∃/≡/⊢ reserved</td></tr>
            <tr><td><code>+</code>, <code>∧</code>, <code>∧x</code></td><td>operator: starts with <code>+ - * / ^ ~ &amp; | &lt; &gt; ! ? =</code> or a free logic symbol; chars may freely mix</td></tr>
            <tr><td><code>`any name`</code></td><td>backtick-quoted — allows spaces and special chars</td></tr>
          </tbody></table>

          <h3>definitions &amp; assertions</h3>
          <table className="help-table"><tbody>
            <tr><td><code>name := expr</code></td><td>define a name; expanded into later statements</td></tr>
            <tr><td><code>f x y := expr</code></td><td>shorthand for <code>f := \x y. expr</code></td></tr>
            <tr><td><code>π expr</code></td><td>evaluate to normal form, show in output panel</td></tr>
            <tr><td><code>π[a:=&#123;T,F&#125;] expr</code></td><td>comprehension: evaluate for each combination of substitutions</td></tr>
            <tr><td><code>≡ atom1 atom2</code></td><td>assert alpha-beta equivalence; halts script on failure</td></tr>
            <tr><td><code>≡[a:=&#123;T,F&#125;] atom1 atom2</code></td><td>equivalence comprehension over substitution combinations</td></tr>
          </tbody></table>

          <h3>in-source config (<code>#!</code> pragma)</h3>
          <table className="help-table"><tbody>
            <tr><td><code>#! max-steps=500</code></td><td>set both max-steps-print and max-steps-ident</td></tr>
            <tr><td><code>#! max-steps-print=500</code></td><td>beta step limit for π statements</td></tr>
            <tr><td><code>#! max-steps-ident=500</code></td><td>beta step limit for definition matching / normalization</td></tr>
            <tr><td><code>#! max-history=20</code></td><td>max history entries stored</td></tr>
            <tr><td><code>#! max-size=5000</code></td><td>max AST nodes before reduction halts</td></tr>
            <tr><td><code>#! normalize-defs</code></td><td>normalize defs at load time (default on); <code>no-normalize-defs</code> to disable</td></tr>
            <tr><td><code>#! include "sys/…"</code></td><td>import definitions from a built-in library</td></tr>
          </tbody></table>
        </>}

        {/* ── Editing tab ── */}
        {tab === "editing" && <>
          <h3>examples &amp; inserts</h3>
          <p>
            <em>Examples</em> loads a complete program into the editor (replacing content).
            <em>Insert</em> inserts a block of definitions at the cursor — booleans, numerals, combinators, pairs, lists.
            <em>Sym</em> opens the Greek/logic symbol picker; hover for shorthand.
            Type <code>\name</code> + <kbd>space</kbd> to insert a symbol by name (e.g. <code>\omega </code> → <code>ω</code>).
          </p>

          <h3>controls</h3>
          <table className="help-table"><tbody>
            <tr><td><strong>load &amp; run</strong></td><td>load and immediately reduce to normal form</td></tr>
            <tr><td><strong>load</strong></td><td>parse and load the current expression</td></tr>
            <tr><td><strong>β-step</strong></td><td>one beta-reduction step</td></tr>
            <tr><td><strong>η-step</strong></td><td>one eta step (λx. f x → f when x ∉ fv(f))</td></tr>
            <tr><td><strong>run</strong></td><td>reduce up to step limit; press again to continue</td></tr>
            <tr><td><strong>show substitution</strong></td><td>show <code>e[x:=a]</code> as intermediate step before beta</td></tr>
            <tr><td><strong>⚙</strong></td><td>settings: max steps (print/run/ident), history, term size</td></tr>
            <tr><td><strong>clear</strong></td><td>clear the editor</td></tr>
          </tbody></table>

          <h3>keyboard shortcuts</h3>
          <table className="help-table"><tbody>
            <tr><td><code>F5</code></td><td>load &amp; run</td></tr>
            <tr><td><code>F6</code></td><td>load</td></tr>
            <tr><td><code>F9</code></td><td>run</td></tr>
            <tr><td><code>F10</code></td><td>β-step</td></tr>
            <tr><td><code>F11</code></td><td>η-step</td></tr>
            <tr><td><code>Ctrl-/</code></td><td>toggle <code>#</code> comment on current / selected lines</td></tr>
            <tr><td><code>( [ &#123; &lt;</code> with selection</td><td>wrap selected text in brackets</td></tr>
            <tr><td><code>Alt-L</code></td><td>insert λ at cursor</td></tr>
            <tr><td><code>Alt-P</code></td><td>insert π at start of line</td></tr>
            <tr><td><code>Alt-E</code></td><td>insert ≡ at start of line</td></tr>
            <tr><td><code>\name</code> + <kbd>space</kbd></td><td>insert symbol (e.g. <code>\omega</code> → ω)</td></tr>
          </tbody></table>

          <h3>storage</h3>
          <table className="help-table"><tbody>
            <tr><td><strong>name field</strong></td><td>type a name; Enter to save</td></tr>
            <tr><td><strong>▾</strong></td><td>dropdown of saved names</td></tr>
            <tr><td><strong>load / save / delete</strong></td><td>manage named slots in browser local storage</td></tr>
            <tr><td><strong>download</strong></td><td>download editor content as <em>name</em>.txt</td></tr>
          </tbody></table>

          <h3>history panel</h3>
          <p>
            Each reduction step is shown newest-first, up to the configured limit (default 200).
            When a term matches a definition's normal form, the name is shown on the right.
          </p>
        </>}

        {/* ── Grammar tab ── */}
        {tab === "grammar" && <>
          <p>Complete grammar as defined in the Chevrotain parser:</p>

          <h3>EBNF</h3>
          <pre className="help-ebnf">{generateEBNF()}</pre>

          <h3>railroad diagrams</h3>
          <p style={{ marginBottom: "0.5rem" }}>
            Interactive diagrams (rendered via{" "}
            <a href="https://chevrotain.io" target="_blank" rel="noopener noreferrer">chevrotain.io</a>;
            requires internet access to load styles):
          </p>
          {!diagramHtml && (
            <button className="help-diagrams-btn" onClick={handleShowDiagrams}>
              Load railroad diagrams
            </button>
          )}
          {diagramHtml && (
            <iframe
              srcDoc={diagramHtml}
              className="help-diagrams-frame"
              title="Grammar railroad diagrams"
            />
          )}
        </>}
      </div>
    </div>
  );
}
