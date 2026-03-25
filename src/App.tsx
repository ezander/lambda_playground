import { useState, useCallback, useRef } from "react";
import { parseProgram } from "./parser/parser";
import { prettyPrint, assertRoundTrip } from "./parser/pretty";
import { AstView } from "./AstView";
import { HelpModal } from "./HelpModal";
import { step, canonicalForm, normalize } from "./evaluator/eval";
import { Term } from "./parser/ast";
import "./App.css";

const EXAMPLES = [
  { label: "booleans", src:
`# Church booleans
true    ::= \\x y. x
false   ::= \\x y. y
not p   ::= p false true
and p q ::= p q false
or  p q ::= p true q

and (not false) true` },
  { label: "SKI", src:
`# SKI combinators
I     ::= \\x. x
K     ::= \\x y. x
S f g x ::= f x (g x)

# S K K reduces to I
S K K z` },
  { label: "numerals", src:
`# Church numerals
zero    ::= \\f x. x
succ  n f x ::= f (n f x)
plus  m n f x ::= m f (n f x)
one   ::= succ zero
two   ::= succ one
three ::= succ two

plus two three` },
  { label: "Y combinator", src:
`# Y combinator — diverges without a lazy argument
Y   ::= \\f. (\\x. f (x x)) (\\x. f (x x))
I   ::= \\x. x

# Y I diverges; step carefully
Y I` },
];

const SNIPPETS: { label: string; def: string }[] = [
  { label: "I",     def: "I       ::= \\x. x" },
  { label: "K",     def: "K       ::= \\x y. x" },
  { label: "S",     def: "S f g x ::= f x (g x)" },
  { label: "true",  def: "true    ::= \\x y. x" },
  { label: "false", def: "false   ::= \\x y. y" },
  { label: "not",   def: "not p   ::= p false true" },
  { label: "and",   def: "and p q ::= p q false" },
  { label: "or",    def: "or  p q ::= p true q" },
  { label: "zero",  def: "zero    ::= \\f x. x" },
  { label: "succ",  def: "succ  n f x ::= f (n f x)" },
  { label: "plus",  def: "plus  m n f x ::= m f (n f x)" },
  { label: "Y",     def: "Y       ::= \\f. (\\x. f (x x)) (\\x. f (x x))" },
];

function insertSnippet(source: string, def: string): string {
  const lines = source.split("\n");
  // Insert before the last non-empty, non-comment, non-definition line
  let insertAt = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].replace(/#.*$/, "").trim();
    if (line && !line.includes("::=")) { insertAt = i; break; }
  }
  lines.splice(insertAt, 0, def);
  return lines.join("\n");
}

type View = "pretty" | "ast";
type Loaded = { term: Term; done: boolean; stepNum: number } | null;
type HistoryEntry = { label: string; text: string; match?: string };

function buildNormDefs(defs: Map<string, Term>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [name, term] of defs)
    m.set(name, canonicalForm(normalize(term).term));
  return m;
}

function findMatch(term: Term, nd: Map<string, string>): string | undefined {
  const key = canonicalForm(term);
  const matches: string[] = [];
  for (const [name, canon] of nd)
    if (key === canon) matches.push(name);
  return matches.length > 0 ? matches.join(", ") : undefined;
}

export default function App() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showHelp, setShowHelp]       = useState(false);
  const [source, setSource]           = useState(EXAMPLES[0].src.trimStart());
  const [view, setView]               = useState<View>("pretty");
  const [loaded, setLoaded]           = useState<Loaded>(null);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [defs, setDefs]               = useState<Map<string, Term>>(new Map());
  const [normDefs, setNormDefs]       = useState<Map<string, string>>(new Map());
  const [history, setHistory]         = useState<HistoryEntry[]>([]);

  const programResult = parseProgram(source);
  let roundTripError: string | null = null;
  if (programResult.rawExpr) {
    try { assertRoundTrip(programResult.rawExpr); }
    catch (e) { roundTripError = String(e); }
  }

  const makeEntry = useCallback((term: Term, stepNum: number, suffix = ""): HistoryEntry => ({
    label: `${stepNum}:`,
    text: prettyPrint(term) + suffix,
    match: findMatch(term, normDefs),
  }), [normDefs]);

  const handleLoad = useCallback(() => {
    if (!programResult.ok || !programResult.expr) return;
    const term = programResult.expr;
    const d = programResult.defs;
    const nd = buildNormDefs(d);
    setDefs(d);
    setNormDefs(nd);
    setLoaded({ term, done: step(term) === null, stepNum: 1 });
    setLoadedSource(source);
    setHistory([{ label: "1:", text: prettyPrint(term), match: findMatch(term, nd) }]);
  }, [programResult, source]);

  const advance = useCallback((maxSteps: number) => {
    if (!loaded || loaded.done) return;
    let current = loaded.term;
    let stepNum = loaded.stepNum;
    const entries: HistoryEntry[] = [];
    let i = 0;
    for (; i < maxSteps; i++) {
      const next = step(current);
      if (next === null) break;
      current = next;
      entries.push(makeEntry(current, ++stepNum));
    }
    const batchLimitHit = i === maxSteps && maxSteps > 1;
    if (batchLimitHit && entries.length > 0)
      entries[entries.length - 1].text += " (paused)";
    const done = step(current) === null;
    setLoaded({ term: current, done, stepNum });
    setHistory(h => [...entries.slice(-10).reverse(), ...h].slice(0, 10));
  }, [loaded, makeEntry]);

  const jumpTo = useCallback((offset: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(offset, offset);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}", "<": ">" };
    const close = pairs[e.key];
    if (close) {
      const ta = e.currentTarget;
      const { selectionStart: start, selectionEnd: end } = ta;
      if (start !== end) {
        e.preventDefault();
        const next = source.slice(0, start) + e.key + source.slice(start, end) + close + source.slice(end);
        setSource(next);
        requestAnimationFrame(() => {
          ta.selectionStart = start + 1;
          ta.selectionEnd   = end + 1;
        });
      }
    }
  }, [source]);

  const handleStep    = useCallback(() => advance(1),    [advance]);
  const handleRun     = useCallback(() => advance(1000), [advance]);
  const handleLoadRun = useCallback(() => {
    if (!programResult.ok || !programResult.expr) return;
    const term = programResult.expr;
    const d = programResult.defs;
    const nd = buildNormDefs(d);
    setDefs(d);
    setNormDefs(nd);
    setLoadedSource(source);
    // Run immediately from the fresh term
    const LIMIT = 1000;
    let current = term;
    const entries: HistoryEntry[] = [{ label: "1:", text: prettyPrint(term), match: findMatch(term, nd) }];
    let i = 0;
    for (; i < LIMIT; i++) {
      const next = step(current);
      if (next === null) break;
      current = next;
      entries.push({ label: `${i + 2}:`, text: prettyPrint(current), match: findMatch(current, nd) });
    }
    const batchLimitHit = i === LIMIT;
    if (batchLimitHit) entries[entries.length - 1].text += " (paused)";
    const stepNum = entries.length;
    setLoaded({ term: current, done: step(current) === null, stepNum });
    setHistory(entries.slice(-10).reverse());
  }, [programResult, source]);

  const canStep    = loaded !== null && !loaded.done && source === loadedSource;
  const currentTerm = programResult.expr;

  return (
    <div className="app">
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      <header>
        <div className="header-row">
          <div>
            <h1>λ playground</h1>
            <p className="subtitle">a small lambda dialect</p>
          </div>
          <button className="help-btn" onClick={() => setShowHelp(true)}>?</button>
        </div>
      </header>

      <main>
        {/* ── Editor ── */}
        <section className="editor-section">
          <label htmlFor="source">expression</label>
          <textarea
            ref={textareaRef}
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            rows={8}
          />
          <div className="example-row">
            <span className="row-label">examples</span>
            <div className="btn-group">
              {EXAMPLES.map((ex) => (
                <button key={ex.label} className="ex-btn" onClick={() => setSource(ex.src.trimStart())}>
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
          <div className="example-row">
            <span className="row-label">insert</span>
            <div className="btn-group">
              {SNIPPETS.map((s) => (
                <button key={s.label} className="ex-btn snippet-btn" onClick={() => setSource(src => insertSnippet(src, s.def))}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {(programResult.errors.length > 0 || roundTripError) && (
            <ul className="parse-errors">
              {programResult.errors.map((e, i) => (
                <li
                  key={i}
                  className={[
                    e.kind === "warning" ? "parse-warning" : "",
                    e.offset !== undefined ? "parse-error-link" : "",
                  ].join(" ").trim()}
                  onClick={() => e.offset !== undefined && jumpTo(e.offset)}
                >{e.message}</li>
              ))}
              {roundTripError && <li>{roundTripError}</li>}
            </ul>
          )}
        </section>

        {/* ── Live parse output ── */}
        <section className="output-section">
          <div className="output-tabs">
            <button className={view === "pretty" ? "active" : ""} onClick={() => setView("pretty")}>
              pretty print
            </button>
            <button className={view === "ast" ? "active" : ""} onClick={() => setView("ast")}>
              AST
            </button>
          </div>
          <div className="output">
            {currentTerm ? (
              view === "pretty"
                ? <pre>{prettyPrint(currentTerm)}</pre>
                : <AstView term={currentTerm} />
            ) : (
              <span className="placeholder">parse result will appear here</span>
            )}
          </div>
        </section>

        {/* ── Controls ── */}
        <div className="eval-controls">
          <button className="load-btn" onClick={handleLoad} disabled={!programResult.ok || !programResult.expr}>
            load
          </button>
          <button onClick={handleStep}    disabled={!canStep}>step</button>
          <button onClick={handleRun}     disabled={!canStep}>run</button>
          <button onClick={handleLoadRun} disabled={!programResult.ok || !programResult.expr}>load &amp; run</button>
          {loaded?.done && (
            <span className="eval-status normal-form">normal form</span>
          )}
        </div>

        {/* ── History ── */}
        {history.length > 0 && (
          <section className="history-section">
            {history.map((entry, i) => (
              <div key={i} className="history-entry">
                <code className="history-term">
                  <span className="history-label">{entry.label}</span>
                  {" "}{entry.text}
                </code>
                {entry.match && <span className="history-match">{entry.match}</span>}
              </div>
            ))}
          </section>
        )}
      </main>

      <footer>
        <div className="grammar">
          <h2>grammar</h2>
          <pre>{`term        ::= application
application ::= atom+
atom        ::= primary ('[' identifier ':=' term ']')*
primary     ::= identifier | '(' term ')' | function
function    ::= '\\' identifier+ (':=' | '.') term`}</pre>
        </div>
        <p className="attribution">
          inspired by <a href="https://hbr.github.io/Lambda-Calculus/lambda2/lambda.html" target="_blank" rel="noreferrer">hbr's Lambda Calculus evaluator</a>
        </p>
      </footer>
    </div>
  );
}
