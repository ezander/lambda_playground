import { useState, useCallback } from "react";
import { parseProgram } from "./parser/parser";
import { prettyPrint, dumpAST, assertRoundTrip } from "./parser/pretty";
import { step, alphaEq } from "./evaluator/eval";
import { Term } from "./parser/ast";
import "./App.css";

const EXAMPLES = [
  { label: "identity",     src: "(\\x := x) y" },
  { label: "K combinator", src: "(\\x y := x) a b" },
  { label: "S combinator", src: "(\\f g x := f x (g x)) (\\x y := x) (\\x := x) z" },
  { label: "church true",  src: "(\\t f := t) a b" },
  { label: "church false", src: "(\\t f := f) a b" },
];

type View = "pretty" | "ast";
type Loaded = { term: Term; done: boolean; stepNum: number } | null;
type HistoryEntry = { label: string; text: string; match?: string };

function findMatch(term: Term, defs: Map<string, Term>): string | undefined {
  for (const [name, defTerm] of defs)
    if (alphaEq(term, defTerm)) return name;
}

export default function App() {
  const [source, setSource]           = useState(EXAMPLES[0].src);
  const [view, setView]               = useState<View>("pretty");
  const [loaded, setLoaded]           = useState<Loaded>(null);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [defs, setDefs]               = useState<Map<string, Term>>(new Map());
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
    match: findMatch(term, defs),
  }), [defs]);

  const handleLoad = useCallback(() => {
    if (!programResult.ok || !programResult.expr) return;
    const term = programResult.expr;
    const d = programResult.defs;
    setDefs(d);
    setLoaded({ term, done: step(term) === null, stepNum: 1 });
    setLoadedSource(source);
    setHistory([{ label: "1:", text: prettyPrint(term), match: findMatch(term, d) }]);
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

  const handleStep    = useCallback(() => advance(1),    [advance]);
  const handleRun     = useCallback(() => advance(1000), [advance]);
  const handleLoadRun = useCallback(() => {
    if (!programResult.ok || !programResult.expr) return;
    const term = programResult.expr;
    const d = programResult.defs;
    setDefs(d);
    setLoadedSource(source);
    // Run immediately from the fresh term
    const LIMIT = 1000;
    let current = term;
    const entries: HistoryEntry[] = [{ label: "1:", text: prettyPrint(term), match: findMatch(term, d) }];
    let i = 0;
    for (; i < LIMIT; i++) {
      const next = step(current);
      if (next === null) break;
      current = next;
      entries.push({ label: `${i + 2}:`, text: prettyPrint(current), match: findMatch(current, d) });
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
      <header>
        <h1>λ playground</h1>
        <p className="subtitle">a small lambda dialect</p>
      </header>

      <main>
        {/* ── Editor ── */}
        <section className="editor-section">
          <label htmlFor="source">expression</label>
          <textarea
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
            rows={4}
          />
          <div className="examples">
            {EXAMPLES.map((ex) => (
              <button key={ex.label} className="ex-btn" onClick={() => setSource(ex.src)}>
                {ex.label}
              </button>
            ))}
          </div>
          {(programResult.errors.length > 0 || roundTripError) && (
            <ul className="parse-errors">
              {programResult.errors.map((e, i) => <li key={i}>{e}</li>)}
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
              <pre>{view === "pretty" ? prettyPrint(currentTerm) : dumpAST(currentTerm)}</pre>
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
      </footer>
    </div>
  );
}
