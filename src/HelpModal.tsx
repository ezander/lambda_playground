import { useEffect } from "react";

const INSPIRATION_URL = "https://hbr.github.io/Lambda-Calculus/lambda2/lambda.html";

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
          An interactive playground for a small lambda calculus dialect, inspired
          by <a href={INSPIRATION_URL} target="_blank" rel="noreferrer">hbr's Lambda Calculus evaluator</a>.
          Expressions are evaluated using <strong>normal-order</strong> (leftmost-outermost)
          beta reduction with capture-avoiding substitution.
        </p>

        <h3>syntax</h3>
        <table className="help-table">
          <tbody>
            <tr><td><code>\x := body</code></td><td>lambda abstraction</td></tr>
            <tr><td><code>\x y := body</code></td><td>multi-param (desugars to nested lambdas)</td></tr>
            <tr><td><code>\x . body</code></td><td><code>.</code> is an alias for <code>:=</code></td></tr>
            <tr><td><code>f x y</code></td><td>application (left-associative)</td></tr>
            <tr><td><code>e[x:=a]</code></td><td>substitution: desugars to <code>(\x. e) a</code></td></tr>
            <tr><td><code># comment</code></td><td>line comment</td></tr>
            <tr><td><code>x</code>, <code>x1</code>, <code>0</code>, <code>42</code></td><td>identifiers: any non-empty sequence of letters, digits, underscores</td></tr>
          </tbody>
        </table>

        <h3>definitions</h3>
        <p>Each line is either a definition or an expression. Definitions are expanded into subsequent lines.</p>
        <table className="help-table">
          <tbody>
            <tr><td><code>name ::= expr</code></td><td>define a name</td></tr>
            <tr><td><code>f x y ::= expr</code></td><td>shorthand for <code>f ::= \x y := expr</code></td></tr>
          </tbody>
        </table>
        <p>The <em>last expression line</em> is what gets loaded and evaluated. Redefining a name with a different normal form produces a warning.</p>

        <h3>controls</h3>
        <table className="help-table">
          <tbody>
            <tr><td><strong>load</strong></td><td>parse and load the current expression into the history</td></tr>
            <tr><td><strong>step</strong></td><td>perform one beta-reduction step</td></tr>
            <tr><td><strong>run</strong></td><td>reduce up to 1000 steps; continue by pressing run again</td></tr>
            <tr><td><strong>load &amp; run</strong></td><td>load and immediately run to normal form</td></tr>
            <tr><td><strong>clear</strong></td><td>clear the editor</td></tr>
          </tbody>
        </table>

        <h3>keyboard shortcuts</h3>
        <table className="help-table">
          <tbody>
            <tr><td><code>F5</code></td><td>load &amp; run</td></tr>
            <tr><td><code>F6</code></td><td>load</td></tr>
            <tr><td><code>F9</code></td><td>run</td></tr>
            <tr><td><code>F10</code></td><td>step</td></tr>
            <tr><td><code>( [ &#123; &lt;</code> with selection</td><td>wrap selected text in the chosen brackets</td></tr>
            <tr><td><code>Alt-L</code></td><td>insert λ at cursor</td></tr>
            <tr><td><code>Alt-M</code></td><td>insert μ at cursor</td></tr>
          </tbody>
        </table>

        <h3>history</h3>
        <p>
          Each reduction step is shown numbered and newest-first, up to 10 entries.
          If a term is alpha-equivalent to a definition's normal form, the definition name is shown on the right.
        </p>

        <h3>grammar</h3>
        <pre>{`term        ::= application
application ::= atom+
atom        ::= primary ('[' identifier ':=' term ']')*
primary     ::= identifier | '(' term ')' | function
function    ::= '\\' identifier+ (':=' | '.') term`}</pre>
      </div>
    </div>
  );
}
