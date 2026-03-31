import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { parseProgram } from "./parser/parser";
import { prettyPrint, assertRoundTrip } from "./parser/pretty";
import { AstView } from "./AstView";
import { HelpModal } from "./HelpModal";
import { step, etaStep, canonicalForm, normalize } from "./evaluator/eval";
import { Term } from "./parser/ast";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { basicSetup } from "codemirror";
import { undo, redo, undoDepth, redoDepth } from "@codemirror/commands";
import { lambdaTheme, lambdaKeymap } from "./editor";
import { lambdaHighlight, setParsed, parsedField } from "./highlight";
import "./App.css";
import { examples as EXAMPLES } from "./data/examples";
import { snippets as SNIPPETS } from "./data/snippets";

const SAVE_PREFIX = "lambda-playground:saved:";

function getSavedSlots(): string[] {
  const slots: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(SAVE_PREFIX)) slots.push(key.slice(SAVE_PREFIX.length));
  }
  return slots.sort();
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
  const editorViewRef   = useRef<EditorView | null>(null);
  const slotPickerRef   = useRef<HTMLDivElement | null>(null);
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
  const [canUndo, setCanUndo]         = useState(false);
  const [canRedo, setCanRedo]         = useState(false);
  const [kinoMode, setKinoMode]       = useState(false);
  const [showSubst, setShowSubst]     = useState(false);
  const [saveName, setSaveName]       = useState("");
  const [savedSlots, setSavedSlots]   = useState<string[]>(getSavedSlots);
  const [loadedSlotName, setLoadedSlotName] = useState<string | null>(null);
  const [slotOpen, setSlotOpen]       = useState(false);

  const setSourceAndSave = useCallback((s: string | ((prev: string) => string)) => {
    setSource(prev => {
      const next = typeof s === "function" ? s(prev) : s;
      localStorage.setItem("lambda-playground:source", next);
      return next;
    });
  }, []);

  const programResult = parseProgram(source);

  // Push parse result into the CodeMirror StateField for syntax highlighting
  useEffect(() => {
    editorViewRef.current?.dispatch({ effects: setParsed.of(programResult) });
  }, [programResult]);

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

  const handleSaveSlot = useCallback(() => {
    const name = saveName.trim();
    if (!name) return;
    if (savedSlots.includes(name) && name !== loadedSlotName) {
      if (!window.confirm(`Overwrite saved entry "${name}"?`)) return;
    }
    localStorage.setItem(SAVE_PREFIX + name, source);
    setSavedSlots(getSavedSlots());
    setLoadedSlotName(name);
  }, [saveName, source, savedSlots, loadedSlotName]);

  const handleLoadSlot = useCallback(() => {
    const name = saveName.trim();
    if (!name) return;
    const saved = localStorage.getItem(SAVE_PREFIX + name);
    if (saved !== null) { setSourceAndSave(saved); setLoadedSlotName(name); }
  }, [saveName, setSourceAndSave]);

  const handleDeleteSlot = useCallback(() => {
    const name = saveName.trim();
    if (!name) return;
    if (!window.confirm(`Delete saved entry "${name}"?`)) return;
    localStorage.removeItem(SAVE_PREFIX + name);
    setSavedSlots(getSavedSlots());
    setSaveName("");
    setLoadedSlotName(null);
  }, [saveName]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([source], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (saveName.trim() || "lambda") + ".txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [source, saveName]);

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

  const editorExtensions = useMemo(() => [basicSetup, lambdaTheme, lambdaKeymap, parsedField, lambdaHighlight], []);

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

  // Close slot picker on outside click
  useEffect(() => {
    if (!slotOpen) return;
    const handler = (e: MouseEvent) => {
      if (!slotPickerRef.current?.contains(e.target as Node)) setSlotOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [slotOpen]);

  const canStep    = loaded !== null && !loaded.done && source === loadedSource;
  const canEtaStep = loaded !== null && source === loadedSource && etaStep(loaded.term) !== null;
  const currentTerm = programResult.expr;

  return (
    <div className={kinoMode ? "app kino" : "app"}>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      <header>
        <h1>λ playground</h1>
        <p className="subtitle">an untyped lambda dialect</p>
      </header>

      <main>
        {/* ── Editor ── */}
        <section className="editor-section">
          <div className="editor-label-row">
            <label htmlFor="source">expression</label>
            <span className="editor-meta">
              {cursorPos && <span className="cursor-pos">{cursorPos.line}:{cursorPos.col}</span>}
              <button className="clear-btn" onClick={() => editorViewRef.current && undo(editorViewRef.current)} disabled={!canUndo} title="Undo (Ctrl+Z)">undo</button>
              <button className="clear-btn" onClick={() => editorViewRef.current && redo(editorViewRef.current)} disabled={!canRedo} title="Redo (Ctrl+Y)">redo</button>
              <button className="clear-btn" onClick={() => setSourceAndSave("")} title="Clear the editor">clear</button>
              <button className="help-btn" onClick={() => setShowHelp(true)} title="Show help">?</button>
              <button className="help-btn kino-btn" onClick={toggleKino} title="Toggle kino (fullscreen) mode">⛶</button>
            </span>
          </div>
          <CodeMirror
            value={source}
            extensions={editorExtensions}
            onChange={(val) => setSourceAndSave(val)}
            onCreateEditor={(view) => { editorViewRef.current = view; view.dispatch({ effects: setParsed.of(programResult) }); }}
            onUpdate={(update) => {
              if (update.selectionSet) {
                const pos = update.state.selection.main.head;
                const line = update.state.doc.lineAt(pos);
                setCursorPos({ line: line.number, col: pos - line.from + 1 });
              }
              setCanUndo(undoDepth(update.state) > 0);
              setCanRedo(redoDepth(update.state) > 0);
            }}
          />
          <div className="toolbar">
            <div className="toolbar-group">
              <span className="row-label">examples</span>
              <div className="select-wrap">
                <select className="tool-select" onChange={e => {
                  const ex = EXAMPLES.find(x => x.label === e.target.value);
                  if (ex) { setSourceAndSave(ex.src.trimStart()); setSaveName(""); setLoadedSlotName(null); }
                }}>
                  {EXAMPLES.map(ex => <option key={ex.label} value={ex.label}>{ex.label}</option>)}
                </select>
              </div>
            </div>
            <span className="toolbar-sep" />
            <div className="toolbar-group">
              <span className="row-label">insert</span>
              <div className="select-wrap">
                <select className="tool-select" onChange={e => {
                  const s = SNIPPETS.find(x => x.label === e.target.value);
                  if (s) insertSnippetAtCursor(s.def);
                }}>
                  {SNIPPETS.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <span className="toolbar-sep" />
            <div className="toolbar-group">
              <span className="row-label">storage</span>
              <div className="storage-combo">
                <input
                  className="save-name-input"
                  type="text"
                  placeholder="name…"
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveSlot(); }}
                />
                <div className="slot-picker" ref={slotPickerRef}>
                  <button className="tool-select slot-picker-btn" onClick={() => setSlotOpen(o => !o)}
                    disabled={savedSlots.length === 0} title="Select a saved slot">▾</button>
                  {slotOpen && (
                    <div className="slot-picker-menu">
                      {savedSlots.map(name => (
                        <button key={name} className="slot-picker-item"
                          onClick={() => { setSaveName(name); setSlotOpen(false); }}>
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button className="ex-btn" onClick={handleLoadSlot}
                disabled={!savedSlots.includes(saveName.trim())}
                title="Load saved content into editor">load</button>
              <button className="ex-btn" onClick={handleSaveSlot} disabled={!saveName.trim()}
                title="Save current editor content under this name">save</button>
              <button className="ex-btn" onClick={handleDeleteSlot}
                disabled={!savedSlots.includes(saveName.trim())}
                title="Delete this saved slot">delete</button>
              <span className="toolbar-sep" />
              <button className="ex-btn" onClick={handleDownload}
                title={`Download as ${(saveName.trim() || "lambda") + ".txt"}`}>download</button>
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

        {/* ── Controls ── */}
        <div className="eval-controls">
          <button className="load-btn" onClick={handleLoadRun} disabled={!programResult.ok || !programResult.expr}
            title="Load and beta-reduce to normal form (F5)">load &amp; run <kbd>F5</kbd></button>
          <button className="load-btn" onClick={handleLoad} disabled={!programResult.ok || !programResult.expr}
            title="Parse and load the current expression into the history (F6)">
            load <kbd>F6</kbd>
          </button>
          <button onClick={handleStep}    disabled={!canStep}    title="Perform one beta-reduction step (F10)">β-step <kbd>F10</kbd></button>
          <button onClick={handleEtaStep} disabled={!canEtaStep} title="Perform one eta-reduction step: λx. f x → f (F11)">η-step <kbd>F11</kbd></button>
          <button onClick={handleRun}     disabled={!canStep}    title="Beta-reduce up to 1000 steps (F9)">run <kbd>F9</kbd></button>
          {loaded?.done && (
            <span className="eval-status normal-form">normal form</span>
          )}
          <label className="subst-toggle" title="Show substitution as an intermediate step before beta-reducing">
            <input type="checkbox" checked={showSubst} onChange={e => setShowSubst(e.target.checked)} />
            {" "}show substitution
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
      </main>

      <footer>
        <div className="grammar">
          <h2>grammar</h2>
          <pre>{`program     → statement (('\\n' | ';') statement)*
statement   → definition | term
definition  → identifier+ '::=' term
term        → application
application → atom+
atom        → primary ('[' identifier ':=' term ']')*
primary     → identifier | '(' term ')' | function
function    → ('\\' | 'λ') identifier+ (':=' | '.') term
identifier  → [a-zA-Z0-9_]+`}</pre>
        </div>
        <p className="attribution">
          inspired by <a href="https://hbr.github.io/Lambda-Calculus/lambda2/lambda.html" target="_blank" rel="noreferrer">hbr's Lambda Calculus evaluator</a>
        </p>
      </footer>
    </div>
  );
}
