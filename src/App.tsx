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
type EvalState =
  | { phase: "idle" }
  | { phase: "parsed";   term: Term }
  | { phase: "stepping"; term: Term; stepCount: number }
  | { phase: "done";     term: Term; stepCount: number; hitLimit: boolean };

export default function App() {
  const [source, setSource]     = useState(EXAMPLES[0].src);
  const [view, setView]         = useState<View>("pretty");
  const [evalState, setEvalState] = useState<EvalState>({ phase: "idle" });

  // Parse whenever source changes, resetting eval state
  const parseResult = parse(source);
  let roundTripError: string | null = null;
  if (parseResult.ok) {
    try { assertRoundTrip(parseResult.term); }
    catch (e) { roundTripError = String(e); }
  }

  const handleSourceChange = (src: string) => {
    setSource(src);
    setEvalState({ phase: "idle" });
  };

  // Load a parsed term fresh
  const handleLoad = useCallback(() => {
    if (!parseResult.ok) return;
    setEvalState({ phase: "parsed", term: parseResult.term });
  }, [parseResult]);

  // Single step
  const handleStep = useCallback(() => {
    const term =
      evalState.phase === "parsed"   ? evalState.term :
      evalState.phase === "stepping" ? evalState.term : null;
    if (!term) return;

    const stepCount =
      evalState.phase === "stepping" ? evalState.stepCount : 0;

    const next = step(term);
    if (next === null) {
      setEvalState({ phase: "done", term, stepCount, hitLimit: false });
    } else {
      setEvalState({ phase: "stepping", term: next, stepCount: stepCount + 1 });
    }
  }, [evalState]);

  // Run to normal form
  const handleRun = useCallback(() => {
    const term =
      evalState.phase === "parsed"   ? evalState.term :
      evalState.phase === "stepping" ? evalState.term : null;
    if (!term) return;

    const already = evalState.phase === "stepping" ? evalState.stepCount : 0;
    const result = normalize(term);
    const total = already + result.steps;

    setEvalState({
      phase: "done",
      term: result.term,
      stepCount: total,
      hitLimit: result.kind === "stepLimit",
    });
  }, [evalState]);

  // Current term being displayed (in eval panel)
  const currentTerm =
    evalState.phase === "idle" ? (parseResult.ok ? parseResult.term : null) :
    evalState.phase === "parsed"   ? evalState.term :
    evalState.phase === "stepping" ? evalState.term :
    evalState.term;

  const canStep = evalState.phase === "parsed" || evalState.phase === "stepping";
  const isDone  = evalState.phase === "done";

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
            onChange={(e) => handleSourceChange(e.target.value)}
            spellCheck={false}
            rows={4}
          />
          <div className="toolbar">
            <div className="examples">
              {EXAMPLES.map((ex) => (
                <button key={ex.label} className="ex-btn" onClick={() => handleSourceChange(ex.src)}>
                  {ex.label}
                </button>
              ))}
            </div>
            <button
              className="load-btn"
              onClick={handleLoad}
              disabled={!parseResult.ok}
            >
              load
            </button>
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

        {/* ── Eval controls ── */}
        <section className="eval-controls">
          <button onClick={handleStep} disabled={!canStep}>step</button>
          <button onClick={handleRun}  disabled={!canStep}>run</button>
          {evalState.phase !== "idle" && (
            <span className="step-count">
              {evalState.phase === "stepping" && `${evalState.stepCount} step${evalState.stepCount !== 1 ? "s" : ""}`}
              {isDone && (
                <>
                  {evalState.stepCount} step{evalState.stepCount !== 1 ? "s" : ""}
                  {" — "}
                  {evalState.hitLimit
                    ? <span className="limit-warning">step limit reached</span>
                    : <span className="normal-form">normal form</span>}
                </>
              )}
            </span>
          )}
        </section>

        {/* ── Output ── */}
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
      </main>

      <footer>
        <div className="grammar">
          <h2>grammar</h2>
          <pre>{`term        ::= application
application ::= atom+
atom        ::= identifier | '(' term ')' | function
function    ::= '\\' identifier+ ':=' term`}</pre>
        </div>
      </footer>
    </div>
  );
}
