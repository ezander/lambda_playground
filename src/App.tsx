import { useState, useCallback } from "react";
import { parse } from "./parser/parser";
import { prettyPrint, dumpAST, assertRoundTrip } from "./parser/pretty";
import { step, normalize } from "./evaluator/eval";
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
type Loaded = { term: Term; done: boolean; stepNum: number; hitLimit: boolean } | null;

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
    setLoaded({ term, done: step(term) === null, stepNum: 1, hitLimit: false });
    setHistory([`1: ${prettyPrint(term)}`]);
  }, [parseResult]);

  const handleStep = useCallback(() => {
    if (!loaded || loaded.done) return;
    const next = step(loaded.term);
    if (next === null) {
      setLoaded({ ...loaded, done: true });
    } else {
      const newNum = loaded.stepNum + 1;
      setLoaded({ term: next, done: step(next) === null, stepNum: newNum, hitLimit: false });
      setHistory(h => [`${newNum}: ${prettyPrint(next)}`, ...h].slice(0, 10));
    }
  }, [loaded]);

  const handleRun = useCallback(() => {
    if (!loaded || loaded.done) return;
    const result = normalize(loaded.term);
    const newNum = loaded.stepNum + result.steps;
    const suffix = result.kind === "stepLimit" ? " (step limit)" : "";
    setLoaded({ term: result.term, done: true, stepNum: newNum, hitLimit: result.kind === "stepLimit" });
    setHistory(h => [`${newNum}: ${prettyPrint(result.term)}${suffix}`, ...h].slice(0, 10));
  }, [loaded]);

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
            <span className={loaded.hitLimit ? "limit-warning" : "normal-form"}>
              {loaded.hitLimit ? "step limit reached" : "normal form"}
            </span>
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
