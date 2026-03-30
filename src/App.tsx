import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { parseProgram } from "./parser/parser";
import { prettyPrint, assertRoundTrip } from "./parser/pretty";
import { AstView } from "./AstView";
import { HelpModal } from "./HelpModal";
import { step, etaStep, canonicalForm, normalize } from "./evaluator/eval";
import { Term } from "./parser/ast";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { basicSetup } from "codemirror";
import { lambdaTheme, lambdaKeymap } from "./editor";
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
  const editorViewRef = useRef<EditorView | null>(null);
  const [showHelp, setShowHelp]       = useState(false);
  const [source, setSource]           = useState(() =>
    localStorage.getItem("lambda-playground:source") ?? EXAMPLES[0].src.trimStart()
  );
  const [view, setView]               = useState<View>("pretty");
  const [loaded, setLoaded]           = useState<Loaded>(null);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [normDefs, setNormDefs]       = useState<Map<string, string>>(new Map());
  const [history, setHistory]         = useState<HistoryEntry[]>([]);
  const [cursorPos, setCursorPos]     = useState<{ line: number; col: number } | null>(null);
  const [kinoMode, setKinoMode]       = useState(false);
  const [showSubst, setShowSubst]     = useState(false);

  const setSourceAndSave = useCallback((s: string | ((prev: string) => string)) => {
    setSource(prev => {
      const next = typeof s === "function" ? s(prev) : s;
      localStorage.setItem("lambda-playground:source", next);
      return next;
    });
  }, []);

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
      const next = step(current, showSubst);
      if (next === null) break;
      current = next;
      entries.push(makeEntry(current, ++stepNum));
    }
    const batchLimitHit = i === maxSteps && maxSteps > 1;
    if (batchLimitHit && entries.length > 0)
      entries[entries.length - 1].text += " (paused)";
    const done = step(current, showSubst) === null;
    setLoaded({ term: current, done, stepNum });
    setHistory(h => [...entries.slice(-10).reverse(), ...h].slice(0, 10));
  }, [loaded, makeEntry, showSubst]);

  const jumpTo = useCallback((offset: number) => {
    const view = editorViewRef.current;
    if (!view) return;
    view.dispatch({ selection: { anchor: offset } });
    view.focus();
  }, []);

  const insertSnippetAtCursor = useCallback((def: string) => {
    const view = editorViewRef.current;
    if (!view) return;
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    view.dispatch({ changes: { from: line.from, insert: def + "\n" } });
    view.focus();
  }, []);

  const handleStep    = useCallback(() => advance(1),    [advance]);
  const handleRun     = useCallback(() => advance(1000), [advance]);

  const handleEtaStep = useCallback(() => {
    if (!loaded) return;
    const next = etaStep(loaded.term);
    if (next === null) return;
    const stepNum = loaded.stepNum + 1;
    const entry = makeEntry(next, stepNum);
    setLoaded({ term: next, done: step(next, showSubst) === null, stepNum });
    setHistory(h => [entry, ...h].slice(0, 10));
  }, [loaded, makeEntry, showSubst]);
  const handleLoadRun = useCallback(() => {
    if (!programResult.ok || !programResult.expr) return;
    const term = programResult.expr;
    const d = programResult.defs;
    const nd = buildNormDefs(d);
    setNormDefs(nd);
    setLoadedSource(source);
    // Run immediately from the fresh term
    const LIMIT = 1000;
    let current = term;
    const entries: HistoryEntry[] = [{ label: "1:", text: prettyPrint(term), match: findMatch(term, nd) }];
    let i = 0;
    for (; i < LIMIT; i++) {
      const next = step(current, showSubst);
      if (next === null) break;
      current = next;
      entries.push({ label: `${i + 2}:`, text: prettyPrint(current), match: findMatch(current, nd) });
    }
    const batchLimitHit = i === LIMIT;
    if (batchLimitHit) entries[entries.length - 1].text += " (paused)";
    const stepNum = entries.length;
    setLoaded({ term: current, done: step(current, showSubst) === null, stepNum });
    setHistory(entries.slice(-10).reverse());
  }, [programResult, source, showSubst]);

  const editorExtensions = useMemo(() => [basicSetup, lambdaTheme, lambdaKeymap], []);

  const toggleKino = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setKinoMode(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setKinoMode(false);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F5")  { e.preventDefault(); handleLoadRun(); }
      if (e.key === "F6")  { e.preventDefault(); handleLoad(); }
      if (e.key === "F9")  { e.preventDefault(); handleRun(); }
      if (e.key === "F10") { e.preventDefault(); handleStep(); }
      if (e.key === "F11") { e.preventDefault(); handleEtaStep(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleLoad, handleStep, handleRun, handleLoadRun, toggleKino]);

  // Sync kino state if user exits fullscreen via browser (Escape)
  useEffect(() => {
    const handler = () => { if (!document.fullscreenElement) setKinoMode(false); };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const canStep    = loaded !== null && !loaded.done && source === loadedSource;
  const canEtaStep = loaded !== null && source === loadedSource && etaStep(loaded.term) !== null;
  const currentTerm = programResult.expr;

  return (
    <div className={kinoMode ? "app kino" : "app"}>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      <header>
        <h1>λ playground</h1>
        <p className="subtitle">a small lambda dialect</p>
      </header>

      <main>
        {/* ── Editor ── */}
        <section className="editor-section">
          <div className="editor-label-row">
            <label htmlFor="source">expression</label>
            <span className="editor-meta">
              {cursorPos && <span className="cursor-pos">{cursorPos.line}:{cursorPos.col}</span>}
              <button className="clear-btn" onClick={() => setSourceAndSave("")} title="Clear the editor">clear</button>
              <button className="help-btn" onClick={() => setShowHelp(true)} title="Show help">?</button>
              <button className="help-btn kino-btn" onClick={toggleKino} title="Toggle kino (fullscreen) mode">⛶</button>
            </span>
          </div>
          <CodeMirror
            value={source}
            extensions={editorExtensions}
            onChange={(val) => setSourceAndSave(val)}
            onCreateEditor={(view) => { editorViewRef.current = view; }}
            onUpdate={(update) => {
              if (update.selectionSet) {
                const pos = update.state.selection.main.head;
                const line = update.state.doc.lineAt(pos);
                setCursorPos({ line: line.number, col: pos - line.from + 1 });
              }
            }}
          />
          <div className="example-row">
            <span className="row-label">examples</span>
            <div className="btn-group">
              {EXAMPLES.map((ex) => (
                <button key={ex.label} className="ex-btn" title={ex.src.trimStart()} onClick={() => setSourceAndSave(ex.src.trimStart())}>
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
          <div className="example-row">
            <span className="row-label">insert</span>
            <div className="btn-group">
              {SNIPPETS.map((s) => (
                <button key={s.label} className="ex-btn snippet-btn" title={`Insert: ${s.def}`} onClick={() => insertSnippetAtCursor(s.def)}>
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
            <button className={view === "pretty" ? "active" : ""} onClick={() => setView("pretty")} title="Show pretty-printed term">
              pretty print
            </button>
            <button className={view === "ast" ? "active" : ""} onClick={() => setView("ast")} title="Show abstract syntax tree">
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
          <button className="load-btn" onClick={handleLoad} disabled={!programResult.ok || !programResult.expr}
            title="Parse and load the current expression into the history (F6)">
            load <kbd>F6</kbd>
          </button>
          <button onClick={handleStep}    disabled={!canStep}    title="Perform one beta-reduction step (F10)">β-step <kbd>F10</kbd></button>
          <button onClick={handleEtaStep} disabled={!canEtaStep} title="Perform one eta-reduction step: λx. f x → f (F11)">η-step <kbd>F11</kbd></button>
          <button onClick={handleRun}     disabled={!canStep}    title="Beta-reduce up to 1000 steps (F9)">run <kbd>F9</kbd></button>
          <button onClick={handleLoadRun} disabled={!programResult.ok || !programResult.expr}
            title="Load and beta-reduce to normal form (F5)">load &amp; run <kbd>F5</kbd></button>
          {loaded?.done && (
            <span className="eval-status normal-form">normal form</span>
          )}
          <label className="subst-toggle" title="Show substitution as an intermediate step before beta-reducing">
            <input type="checkbox" checked={showSubst} onChange={e => setShowSubst(e.target.checked)} />
            {" "}show subst
          </label>
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
function    ::= ('\\' | 'λ') identifier+ (':=' | '.') term`}</pre>
        </div>
        <p className="attribution">
          inspired by <a href="https://hbr.github.io/Lambda-Calculus/lambda2/lambda.html" target="_blank" rel="noreferrer">hbr's Lambda Calculus evaluator</a>
        </p>
      </footer>
    </div>
  );
}
