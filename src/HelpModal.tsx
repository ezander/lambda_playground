import { useEffect } from "react";


export function HelpModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>

        <h2>λ playground</h2>
        <p>
          An interactive playground for an untyped lambda dialect.
          Expressions are evaluated using <strong>normal-order</strong> (leftmost-outermost)
          beta reduction with capture-avoiding substitution.
        </p>

        <h3>syntax</h3>
        <table className="help-table">
          <tbody>
            <tr><td><code>λx. body</code></td><td>lambda abstraction (<code>\</code> also accepted)</td></tr>
            <tr><td><code>λx y. body</code></td><td>multi-param (desugars to nested lambdas)</td></tr>
            <tr><td><code>f x y</code></td><td>application (left-associative)</td></tr>
            <tr><td><code>e[x:=a]</code></td><td>substitution: desugars to <code>(\x. e) a</code></td></tr>
            <tr><td><code># comment</code></td><td>line comment</td></tr>
            <tr><td><code>;</code></td><td>statement separator (same as newline)</td></tr>
            <tr><td><code>x</code>, <code>x_1</code>, <code>42</code>, <code>ω</code></td><td>identifiers: letters, digits, underscores, Greek (except λ, π; α/β/η/∀/∃/≡/⊢ reserved); may start with a digit</td></tr>
            <tr><td><code>+</code>, <code>∧</code>, <code>→</code>, <code>∧x</code></td><td>operator identifiers: start with <code>+ - * / ^ ~ &amp; | &lt; &gt; ! ? =</code> or a free logic symbol (∧ ∨ ¬ → ↔ ⊤ ⊥ ⊕ ⊗ ∘ ≠ ∅); alphanumeric and operator chars may freely mix</td></tr>
            <tr><td><code>`any name`</code></td><td>backtick-quoted identifier — allows spaces and special chars</td></tr>
          </tbody>
        </table>

        <h3>definitions</h3>
        <p>Each line (or <code>;</code>-separated statement) is either a definition or an expression. Definitions are expanded into subsequent statements.</p>
        <table className="help-table">
          <tbody>
            <tr><td><code>name := expr</code></td><td>define a name</td></tr>
            <tr><td><code>f x y := expr</code></td><td>shorthand for <code>f := \x y. expr</code></td></tr>
            <tr><td><code>π expr</code></td><td>evaluate <code>expr</code> to normal form and show in the output panel</td></tr>
            <tr><td><code>≡ expr1 expr2</code></td><td>assert alpha-beta equivalence; shown in output panel; halts on failure. Left-associative: <code>≡ f x y</code> asserts <code>f x ≡ y</code></td></tr>
          </tbody>
        </table>
        <p>The <em>last expression line</em> is what gets loaded and evaluated. Redefining a name with a different normal form produces a warning.</p>

        <h3>examples &amp; inserts</h3>
        <p>
          The <em>examples</em> dropdown loads a complete standalone program into the editor (replacing its content).
          The <em>insert</em> dropdown inserts a block of definitions at the current cursor line — useful for
          building up programs incrementally from Church booleans, numerals, combinators, pairs, or lists.
          The <em>sym</em> button opens a Greek symbol picker; hovering each symbol shows its shorthand.
        </p>
        <p>
          To insert a symbol by keyboard, type a backslash followed by its name and press <kbd>space</kbd>:
          e.g. <code>\omega </code> → <code>ω </code>, <code>\and </code> → <code>∧ </code>.
          If the name is not recognised, space is inserted normally.
          Reserved symbols (∀ ∃ ≡ ⊢, and α β η) are greyed out in the picker.
        </p>

        <h3>storage</h3>
        <p>
          The <em>storage</em> controls let you save and restore named snippets in the browser's local storage,
          and download the editor content as a text file.
        </p>
        <table className="help-table">
          <tbody>
            <tr><td><strong>name field</strong></td><td>type a name for the slot; press Enter to save</td></tr>
            <tr><td><strong>▾</strong></td><td>open a dropdown of saved names; selecting one fills the name field</td></tr>
            <tr><td><strong>load</strong></td><td>load the content saved under the current name into the editor</td></tr>
            <tr><td><strong>save</strong></td><td>save the current editor content under the given name; confirms before overwriting</td></tr>
            <tr><td><strong>delete</strong></td><td>delete the named slot from local storage (asks for confirmation)</td></tr>
            <tr><td><strong>download</strong></td><td>download the editor content as <em>name</em>.txt (or lambda.txt if no name is given)</td></tr>
          </tbody>
        </table>

        <h3>controls</h3>
        <table className="help-table">
          <tbody>
            <tr><td><strong>load &amp; run</strong></td><td>load and immediately run to normal form</td></tr>
            <tr><td><strong>load</strong></td><td>parse and load the current expression into the history</td></tr>
            <tr><td><strong>β-step</strong></td><td>perform one beta-reduction step</td></tr>
            <tr><td><strong>η-step</strong></td><td>perform one eta-reduction step (λx. f x → f, when x ∉ fv(f)); disabled when none exists</td></tr>
            <tr><td><strong>run</strong></td><td>reduce up to the configured step limit; continue by pressing run again</td></tr>
            <tr><td><strong>show substitution</strong></td><td>show substitution <code>e[x:=a]</code> as an intermediate step before beta-reducing</td></tr>
            <tr><td><strong>find</strong></td><td>open the editor's find/replace bar (same as <code>Ctrl-F</code>)</td></tr>
            <tr><td><strong>⚙</strong></td><td>open settings: max steps (print/run/ident), max history, max term size; saved to local storage</td></tr>
            <tr><td><strong>clear</strong></td><td>clear the editor</td></tr>
          </tbody>
        </table>

        <h3>keyboard shortcuts</h3>
        <table className="help-table">
          <tbody>
            <tr><td><code>F5</code></td><td>load &amp; run</td></tr>
            <tr><td><code>F6</code></td><td>load</td></tr>
            <tr><td><code>F9</code></td><td>run</td></tr>
            <tr><td><code>F10</code></td><td>β-step</td></tr>
            <tr><td><code>F11</code></td><td>η-step</td></tr>
            <tr><td><code>Ctrl-/</code></td><td>toggle <code>#</code> comment on current line or all selected lines</td></tr>
            <tr><td><code>( [ &#123; &lt;</code> with selection</td><td>wrap selected text in the chosen brackets</td></tr>
            <tr><td><code>Alt-L</code></td><td>insert λ at cursor</td></tr>
            <tr><td><code>Alt-P</code></td><td>insert π at cursor</td></tr>
            <tr><td><code>Alt-E</code></td><td>insert ≡ at cursor</td></tr>
            <tr><td><code>\name</code> + <kbd>space</kbd></td><td>insert symbol (e.g. <code>\omega</code> → ω, <code>\and</code> → ∧)</td></tr>
          </tbody>
        </table>

        <h3>in-source config</h3>
        <p>
          A line beginning with <code>#!</code> sets a runtime option for that program run (overrides the settings dialog; reset when the run ends):
        </p>
        <table className="help-table">
          <tbody>
            <tr><td><code>#! max-steps=500</code></td><td>set both max-steps-print and max-steps-ident</td></tr>
            <tr><td><code>#! max-steps-print=500</code></td><td>beta step limit for π statements</td></tr>
            <tr><td><code>#! max-steps-ident=500</code></td><td>beta step limit for definition matching and normalization</td></tr>
            <tr><td><code>#! max-history=20</code></td><td>max history entries stored (panel scrolls)</td></tr>
            <tr><td><code>#! max-size=5000</code></td><td>max AST nodes before reduction halts (prevents memory overflow)</td></tr>
            <tr><td><code>#! normalize-defs</code></td><td>normalize definition bodies at load time (default: on); use <code>no-normalize-defs</code> to disable</td></tr>
          </tbody>
        </table>

        <h3>history</h3>
        <p>
          Each reduction step is shown numbered and newest-first, up to the configured limit (default 200, panel scrolls).
          If a term is alpha-equivalent to a definition's normal form, the definition name is shown on the right.
        </p>

        <h3>grammar</h3>
        <pre>{
"program     ::= statement (('\\n' | ';') statement)*\n" +
"statement   ::= definition | print | equiv | term\n" +
"definition  ::= identLike+ ':=' term\n" +
"print       ::= 'π' term\n" +
"equiv       ::= '≡' term   # term must be App: func ≡ arg\n" +
"term        ::= application\n" +
"application ::= atom+\n" +
"atom        ::= primary ('[' identLike ':=' term ']')*\n" +
"primary     ::= identLike | '(' term ')' | function\n" +
"function    ::= ('\\\\' | 'λ') identLike+ '.' term\n" +
"identLike   ::= identifier | '`' [^`\\n]+ '`'\n" +
"identChar   ::= [a-zA-Z0-9_\\u0370-\\u03FF] | [+\\-*/^~&|<>!?=] | logicSym\n" +
"logicSym    ::= ¬ | → | ↔ | ∧ | ∨ | ⊤ | ⊥ | ⊕ | ⊗ | ∘ | ≠ | ∅  (free logic symbols)\n" +
"identifier  ::= [a-zA-Z0-9_\\u0370-\\u03FF] identChar*   (excluding λ, π; α/β/η/∀/∃/≡/⊢ reserved)\n" +
"operatorId  ::= ([+\\-*/^~&|<>!?=] | logicSym) identChar*"
}</pre>
      </div>
    </div>
  );
}
