import { useState, useCallback } from "react";
import { parse } from "./parser/parser";
import { prettyPrint, dumpAST, assertRoundTrip } from "./parser/pretty";
import { step } from "./evaluator/eval";
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

export default function App() {
  const [source, setSource] = useState(EXAMPLES[0].src);
  const [view, setView]     = useState<View>("pretty");
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [history, setHistory] = useState<string[]>([]);

  const parseResult = parse(source);
  let roundTripError: string | null = null;
  if (parseResult.ok) {
    try { assertRoundTrip(parseResult.term); }
    catch (e) { roundTripError = String(e); }
  }

  const handleLoad = useCallback(() => {
    if (!parseResult.ok) return;
    const term = parseResult.term;
    setLoaded({ term, done: step(term) === null, stepNum: 1 });
    setHistory([`1: ${prettyPrint(term)}`]);
  }, [parseResult]);

  const advance = useCallback((maxSteps: number) => {
    if (!loaded || loaded.done) return;
    let current = loaded.term;
    let stepNum = loaded.stepNum;
    const entries: string[] = [];
    let i = 0;
    for (; i < maxSteps; i++) {
      const next = step(current);
      if (next === null) break;
      current = next;
      entries.push(`${++stepNum}: ${prettyPrint(current)}`);
    }
    const batchLimitHit = i === maxSteps && maxSteps > 1;
    const done = step(current) === null;
    const labeled = entries.map((e, j) =>
      j === entries.length - 1 && batchLimitHit ? e + " (paused)" : e
    );
    setLoaded({ term: current, done, stepNum });
    setHistory(h => [...labeled.slice(-10).reverse(), ...h].slice(0, 10));
  }, [loaded]);

  const handleStep = useCallback(() => advance(1),    [advance]);
  const handleRun  = useCallback(() => advance(1000), [advance]);

  const canStep = loaded !== null && !loaded.done;
  const currentTerm = parseResult.ok ? parseResult.term : null;

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
          {!parseResult.ok && (
            <ul className="parse-errors">
              {parseResult.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          {roundTripError && (
            <ul className="parse-errors">
              <li>{roundTripError}</li>
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
          <button className="load-btn" onClick={handleLoad} disabled={!parseResult.ok}>
            load
          </button>
          <button onClick={handleStep} disabled={!canStep}>step</button>
          <button onClick={handleRun}  disabled={!canStep}>run</button>
          {loaded?.done && (
            <span className="eval-status normal-form">normal form</span>
          )}
        </div>

        {/* ── History ── */}
        {history.length > 0 && (
          <section className="history-section">
            {history.map((entry, i) => (
              <div key={i} className="history-entry">
                <pre>{entry}</pre>
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
atom        ::= identifier | '(' term ')' | function
function    ::= '\\' identifier+ (':=' | '.') term`}</pre>
        </div>
      </footer>
    </div>
  );
}
