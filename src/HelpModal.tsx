import { useState, useRef } from "react";
import { useFocusTrap } from "./useFocusTrap";
import { createSyntaxDiagramsCode } from "chevrotain";
import { parser } from "./parser/parser";
import { generateEBNF } from "./parser/ebnf";
import changelogSrc from "../CHANGELOG.md?raw";
import { renderChangelog } from "./changelog";

// ── Component ──────────────────────────────────────────────────────────────────

type Tab = "language" | "editing" | "grammar" | "changelog" | "credits";

export function HelpModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("language");
  const [diagramHtml, setDiagramHtml] = useState<string | null>(null); // cached after first generation
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef);

  const handleShowDiagrams = () => {
    const html = diagramHtml ?? createSyntaxDiagramsCode(
      parser.getSerializedGastProductions() as any
    );
    if (!diagramHtml) setDiagramHtml(html);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
  };

  // close on Escape
  const onKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Escape") onClose(); };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal help-modal" ref={modalRef} onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <button className="modal-close" onClick={onClose}>✕</button>

        <h2>λ playground</h2>

        {/* ── Tabs ── */}
        <div className="help-tabs">
          <button className={`help-tab-btn${tab === "language" ? " active" : ""}`} onClick={() => setTab("language")}>Language</button>
          <button className={`help-tab-btn${tab === "editing"  ? " active" : ""}`} onClick={() => setTab("editing")}>UI &amp; editing</button>
          <button className={`help-tab-btn${tab === "grammar"  ? " active" : ""}`} onClick={() => setTab("grammar")}>Grammar</button>
          <button className={`help-tab-btn${tab === "changelog"? " active" : ""}`} onClick={() => setTab("changelog")}>Changelog</button>
          <button className={`help-tab-btn${tab === "credits"  ? " active" : ""}`} onClick={() => setTab("credits")}>Credits</button>
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
            <tr><td><code>λβx. body</code></td><td>eager binder (call-by-value): argument reduced before substitution; per-binder, no whitespace between <code>β</code> and the name</td></tr>
            <tr><td><code>f x y</code></td><td>application (left-associative)</td></tr>
            <tr><td><code>e[x:=a]</code></td><td>substitution: desugars to <code>(\x. e) a</code></td></tr>
            <tr><td><code># comment</code></td><td>line comment; <code>#* … *#</code> for block comments</td></tr>
            <tr><td><code>[example/name]</code></td><td>clickable link in comments — loads example, user buffer, or tutorial into scratch (<code>example/</code>, <code>user/</code>, <code>tut/</code>)</td></tr>
            <tr><td><code>;</code></td><td>statement separator (same as newline)</td></tr>
            <tr><td>(indented line)</td><td>line continuation — an indented line continues the previous statement</td></tr>
          </tbody></table>

          <h3>identifiers</h3>
          <table className="help-table"><tbody>
            <tr><td><code>x</code>, <code>x_1</code>, <code>42</code>, <code>ω</code>, <code>π₁</code></td><td>alphanumeric + Greek (except λ); may start with a digit; α/η/∀/∃/⊢ reserved; β reserved unless fused to a binder name (<code>βx</code>)</td></tr>
            <tr><td><code>+</code>, <code>∧</code>, <code>∧x</code></td><td>operator: starts with <code>+ - * / ^ ~ &amp; | &lt; &gt; ! ? =</code> or a free logic symbol; chars may freely mix</td></tr>
            <tr><td><code>`any name`</code></td><td>backtick-quoted — allows spaces and special chars</td></tr>
          </tbody></table>

          <h3>definitions &amp; assertions</h3>
          <table className="help-table"><tbody>
            <tr><td><code>name := expr</code></td><td>define a name; expanded into later statements</td></tr>
            <tr><td><code>f x y := expr</code></td><td>shorthand for <code>f := \x y. expr</code></td></tr>
            <tr><td><code>expr</code></td><td>bare expression: evaluate to normal form, show in output panel; last one is also loaded into the eval panel</td></tr>
            <tr><td><code>:print expr</code></td><td>same as a bare expression — explicit form</td></tr>
            <tr><td><code>:print[a:=&#123;T,F&#125;] expr</code></td><td>comprehension: evaluate for each combination of substitutions</td></tr>
            <tr><td><code>:print-list listExpr</code></td><td>unfold a list, printing <code>head l</code> per element until <code>tail l</code> reaches <code>nil</code> (or fixpoint, or max=100)</td></tr>
            <tr><td><code>:print-list[head:=h, tail:=t, nil:=z, max:=N] listExpr</code></td><td>same with explicit selectors / cap; any subset can be overridden, the rest fall back to top-level defs of the same name</td></tr>
            <tr><td><code>:assert lhs ≡ rhs</code></td><td>assert alpha-beta equivalence; halts script on failure</td></tr>
            <tr><td><code>:assert lhs ≢ rhs</code></td><td>assert non-equivalence; halts script on failure</td></tr>
            <tr><td><code>:assert[a:=&#123;T,F&#125;] lhs ≡ rhs</code></td><td>assertion comprehension over substitution combinations</td></tr>
          </tbody></table>

          <h3>directives</h3>
          <table className="help-table"><tbody>
            <tr><td><code>:import "ns/…"</code></td><td>import definitions from <code>std/</code>, <code>doc/</code>, <code>example/</code>, <code>tutorial/</code>, or <code>user/</code> namespace; Ctrl-click path to navigate</td></tr>
            <tr><td><code>:import[quiet] "…"</code></td><td>like import, but imported names are hidden from match list and autocomplete</td></tr>
            <tr><td><code>:import[prefix="C"] "…"</code></td><td>prepend "C" to every imported public name (e.g. for namespacing two competing libraries)</td></tr>
            <tr><td><code>:mixin "…"</code></td><td>import definitions that can see existing defs (for extending); accepts the same <code>[quiet]</code> / <code>[prefix="…"]</code> options</td></tr>
            <tr><td><code>:eval expr</code></td><td>load expression into eval panel (last one wins; overrides bare expressions)</td></tr>
            <tr><td><code>:infix name1 name2 …</code></td><td>mark definitions as infix operators; <code>a + b</code> is read as <code>+ a b</code>. Parenthesize to escape infix: <code>(+)</code>, <code>map (+)</code>, <code>f (+)</code></td></tr>
          </tbody></table>
          <h3>settings (<code>:set</code>)</h3>
          <table className="help-table"><tbody>
            <tr><td><code>:set max-steps 500</code></td><td>set both max-steps-print and max-steps-ident</td></tr>
            <tr><td><code>:set max-steps-print 500</code></td><td>beta step limit for print statements (bare or <code>:print</code>)</td></tr>
            <tr><td><code>:set max-steps-ident 500</code></td><td>beta step limit for definition matching / normalization</td></tr>
            <tr><td><code>:set max-history 20</code></td><td>max history entries stored</td></tr>
            <tr><td><code>:set max-history-size 100000</code></td><td>max total AST nodes summed across history (oldest dropped)</td></tr>
            <tr><td><code>:set max-size 5000</code></td><td>max AST nodes before reduction halts</td></tr>
            <tr><td><code>:set normalize-defs</code></td><td>normalize defs at load time (default on); <code>no-normalize-defs</code> to disable</td></tr>
            <tr><td><code>:set allow-eta</code></td><td>enable η-reduction during normalization (default off); <code>no-allow-eta</code> to disable</td></tr>
          </tbody></table>
        </>}

        {/* ── Editing tab ── */}
        {tab === "editing" && <>
          <h3>toolbar dropdowns</h3>
          <p>
            <em>Docs</em>, <em>tutorials</em>, and <em>examples</em> each load the selected file into the scratch buffer.
            <em>Sym</em> opens the Greek/logic symbol picker; hover for shorthand.
            Type <code>\name</code> + <kbd>space</kbd> to insert a symbol by name (e.g. <code>\omega </code> → <code>ω</code>).
          </p>

          <h3>controls</h3>
          <table className="help-table"><tbody>
            <tr><td><strong>run</strong> (eval panel)</td><td>reduce the current expression to normal form (the expression auto-loads from the editor)</td></tr>
            <tr><td><strong>reset</strong></td><td>reload the current expression at step 0</td></tr>
            <tr><td><strong>β-step</strong></td><td>one beta-reduction step</td></tr>
            <tr><td><strong>η-step</strong></td><td>one eta step (λx. f x → f when x ∉ fv(f))</td></tr>
            <tr><td><strong>continue</strong></td><td>reduce up to step limit from current position</td></tr>
            <tr><td><strong>show substitution</strong></td><td>show <code>e[x:=a]</code> as intermediate step before beta; auto-reloads</td></tr>
            <tr><td><strong>auto-run</strong> / <strong>run</strong> (output panel)</td><td>when auto-run is off, print and ≡ statements are parsed but not evaluated on edit; click <strong>run</strong> (or press <code>Ctrl-F5</code>) to evaluate once for the current source. Toggle auto-run with <code>Ctrl-Shift-F5</code>.</td></tr>
            <tr><td><strong>cursor on print/≡/expr</strong></td><td>matching output cell is highlighted and scrolled into view (works across continuation lines and within <code>;</code>-separated statements)</td></tr>
            <tr><td><strong>⚙</strong></td><td>settings: max steps (print/run/ident), history, term size</td></tr>
            <tr><td><strong>clear</strong></td><td>clear the editor</td></tr>
            <tr><td><code>Ctrl-S</code></td><td>save current named buffer (no-op on scratch)</td></tr>
          </tbody></table>

          <h3>keyboard shortcuts</h3>
          <table className="help-table"><tbody>
            <tr><td><code>F5</code></td><td>run (eval panel: reduce to normal form)</td></tr>
            <tr><td><code>Ctrl-F5</code></td><td>run print / ≡ statements (output panel)</td></tr>
            <tr><td><code>Ctrl-Shift-F5</code></td><td>toggle auto-run</td></tr>
            <tr><td><code>F6</code></td><td>reset</td></tr>
            <tr><td><code>F9</code></td><td>continue</td></tr>
            <tr><td><code>F10</code></td><td>β-step</td></tr>
            <tr><td><code>F11</code></td><td>η-step</td></tr>
            <tr><td><code>Ctrl-/</code></td><td>toggle <code>#</code> comment on current / selected lines</td></tr>
            <tr><td><code>( [ &#123;</code> with selection</td><td>wrap selected text in brackets</td></tr>
            <tr><td><code>`</code> with selection</td><td>wrap selected text in backticks</td></tr>
            <tr><td><code>`</code> without selection</td><td>insert paired backticks, cursor inside</td></tr>
            <tr><td><code>Alt-L</code></td><td>insert λ at cursor</td></tr>
            <tr><td><code>Alt-B</code></td><td>insert β at cursor (for eager binders, e.g. <code>λβx. body</code>)</td></tr>
            <tr><td><code>Alt-E</code></td><td>insert ≡ at cursor</td></tr>
            <tr><td><code>Alt-N</code></td><td>insert ≢ at cursor</td></tr>
            <tr><td><code>\name</code> + <kbd>space</kbd></td><td>insert symbol (e.g. <code>\omega</code> → ω)</td></tr>
          </tbody></table>

          <h3>storage</h3>
          <table className="help-table"><tbody>
            <tr><td><strong>name field</strong></td><td>type a name; Enter to save</td></tr>
            <tr><td><strong>▾</strong></td><td>dropdown of saved names</td></tr>
            <tr><td><strong>load / save / delete</strong></td><td>manage named slots in browser local storage</td></tr>
            <tr><td><strong>download</strong></td><td>download editor content as <em>name</em>.txt</td></tr>
            <tr><td><strong>import</strong></td><td>best-effort lexical converter for files in other LC dialects (lambda token, comment style, definition operator); won't touch <code>let</code>/<code>where</code>/types</td></tr>
            <tr><td><strong>backup</strong> / <strong>restore</strong></td><td>zip all named buffers / restore a previous backup with selective overwrite</td></tr>
          </tbody></table>

          <h3>history panel</h3>
          <p>
            Each reduction step is shown newest-first, up to the configured limit (default 200).
            When a term matches a definition's normal form, the name is shown on the right.
          </p>

          <h3>output panel</h3>
          <p>
            Each print / ≡ / bare expression shows runtime stats on the right of the source line:
            β-reductions, wall-clock ms, and peak term size reached during evaluation.
            For ≡ assertions both sides are aggregated (sum of steps and ms, max of peak size); hover for the lhs/rhs breakdown.
          </p>
        </>}

        {/* ── Grammar tab ── */}
        {tab === "grammar" && <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <p style={{ margin: 0 }}>Complete grammar in EBNF notation:</p>
            <button className="help-diagrams-btn" onClick={handleShowDiagrams}
              title="Interactive railroad diagrams via chevrotain.io — opens in a new tab">
              Railroad diagrams ↗
            </button>
          </div>

          <pre className="help-ebnf">{generateEBNF()}</pre>
        </>}

        {/* ── Changelog tab ── */}
        {tab === "changelog" && <div className="help-changelog">{renderChangelog(changelogSrc)}</div>}

        {/* ── Credits tab ── */}
        {tab === "credits" && <>
          <p style={{ color: "var(--muted)", fontSize: "0.85em" }}>
            Concept, design &amp; direction:{" "}
            <a href="https://github.com/ezander/" target="_blank" rel="noopener noreferrer">Elmar Zander</a>
          </p>

          <p style={{ marginTop: "0.25rem", color: "var(--muted)", fontSize: "0.85em" }}>
            Built with assistance from:{" "}
            <a href="https://claude.ai" target="_blank" rel="noopener noreferrer">Claude (Anthropic)</a>
          </p>

          <h3>project</h3>
          <table className="help-table plain" style={{ marginLeft: "1.25rem", width: "calc(100% - 1.25rem)" }}><tbody>
            <tr>
              <td>source</td>
              <td><a href="https://github.com/ezander/lambda_playground" target="_blank" rel="noopener noreferrer">github.com/ezander/lambda_playground</a></td>
            </tr>
            <tr>
              <td>issues</td>
              <td><a href="https://github.com/ezander/lambda_playground/issues" target="_blank" rel="noopener noreferrer">Report an issue</a></td>
            </tr>
            <tr>
              <td>license</td>
              <td>
                code{" "}
                <a href="https://github.com/ezander/lambda_playground/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT</a>
                {" · "}
                content{" "}
                <a href="https://github.com/ezander/lambda_playground/blob/main/LICENSE-CONTENT" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>
              </td>
            </tr>
            <tr>
              <td>version</td>
              <td>
                v{__APP_VERSION__}
                {" · "}
                <a
                  href={`https://github.com/ezander/lambda_playground/commit/${__APP_COMMIT_FULL__}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >{__APP_COMMIT__}</a>
                {" · "}
                {__APP_BUILD_DATE__}
              </td>
            </tr>
          </tbody></table>

          <h3>dependencies</h3>
          <table className="help-table plain" style={{ marginLeft: "1.25rem", width: "calc(100% - 1.25rem)" }}><tbody>
            <tr><td>language</td><td><a href="https://www.typescriptlang.org" target="_blank" rel="noopener noreferrer">TypeScript</a></td></tr>
            <tr><td>build tool</td><td><a href="https://vitejs.dev" target="_blank" rel="noopener noreferrer">Vite</a></td></tr>
            <tr><td>testing</td><td><a href="https://vitest.dev" target="_blank" rel="noopener noreferrer">Vitest</a></td></tr>
            <tr><td>UI framework</td><td><a href="https://react.dev" target="_blank" rel="noopener noreferrer">React</a></td></tr>
            <tr><td>editor</td><td><a href="https://codemirror.net" target="_blank" rel="noopener noreferrer">CodeMirror 6</a></td></tr>
            <tr><td>lexer &amp; parser</td><td><a href="https://chevrotain.io" target="_blank" rel="noopener noreferrer">Chevrotain</a></td></tr>
            <tr><td>icons</td><td><a href="https://lucide.dev" target="_blank" rel="noopener noreferrer">Lucide</a></td></tr>
            <tr><td>zip backup</td><td><a href="https://stuk.github.io/jszip" target="_blank" rel="noopener noreferrer">JSZip</a></td></tr>
            <tr><td>URL compression</td><td><a href="https://github.com/pieroxy/lz-string" target="_blank" rel="noopener noreferrer">lz-string</a></td></tr>
          </tbody></table>
        </>}
      </div>
    </div>
  );
}
