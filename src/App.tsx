import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { parseProgram, PragmaConfig } from "./parser/parser";
import { prettyPrint, assertRoundTrip } from "./parser/pretty";
import { AstView } from "./AstView";
import { HelpModal } from "./HelpModal";
import { SettingsModal } from "./SettingsModal";
import { step, etaStep, buildNormDefs, findMatch, termSize } from "./evaluator/eval";
import { Term } from "./parser/ast";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { lineNumbers } from "@codemirror/view";
import { undo, redo, undoDepth, redoDepth } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { lambdaTheme, lambdaKeymap, GREEK_SYMBOLS, LOGIC_SYMBOLS } from "./editor";
import { lambdaComplete, lambdaCompleteKeymap } from "./autocomplete";
import { Settings, Share2 } from "lucide-react";
import { lambdaHighlight, setParsed, parsedField } from "./highlight";
import "./App.css";
import LZString from "lz-string";
import { examples as EXAMPLES } from "./data/examples";
import { snippets as SNIPPETS } from "./data/snippets";

const SAVE_PREFIX = "lambda-playground:saved:";

type Config = { maxStepsPrint: number; maxStepsRun: number; maxStepsIdent: number; maxHistory: number; maxSize: number };
const DEFAULT_CONFIG: Config = { maxStepsPrint: 1000, maxStepsRun: 1000, maxStepsIdent: 1000, maxHistory: 200, maxSize: 10000 };

function loadConfig(): Config {
  try {
    const s = localStorage.getItem("lambda-playground:config");
    if (s) return { ...DEFAULT_CONFIG, ...JSON.parse(s) };
  } catch {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(c: Config) {
  localStorage.setItem("lambda-playground:config", JSON.stringify(c));
}

function Panel({ label, open, onToggle, children, className, flush = false, headerExtra }: {
  label: string; open: boolean; onToggle: () => void; children: React.ReactNode;
  className?: string; flush?: boolean; headerExtra?: React.ReactNode;
}) {
  return (
    <section className={["panel", className].filter(Boolean).join(" ")}>
      <div className="panel-header" onClick={onToggle}>
        <span className="panel-label">{label}</span>
        {headerExtra && <span className="panel-header-extra" onClick={e => e.stopPropagation()}>{headerExtra}</span>}
        <span className="panel-toggle">{open ? "▾" : "▸"}</span>
      </div>
      {open && <div className={flush ? "panel-body panel-body-flush" : "panel-body"}>{children}</div>}
    </section>
  );
}

function getSavedSlots(): string[] {
  const slots: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(SAVE_PREFIX)) slots.push(key.slice(SAVE_PREFIX.length));
  }
  return slots.sort();
}



type View = "pretty" | "ast";
type Loaded = { term: Term; done: boolean; stepNum: number; effectiveConfig: Config } | null;
type HistoryEntry = { label: string; text: string; match?: string; status?: "normalForm" | "stepLimit" | "sizeLimit"; steps?: number; size?: number };


function buildEntry(term: Term, stepNum: number, nd: Map<string, string>, suffix = "", normal = true, status?: HistoryEntry["status"]): HistoryEntry {
  return {
    label: `${stepNum}:`,
    text: prettyPrint(term) + suffix,
    match: normal ? findMatch(term, nd) : undefined,
    status,
  };
}

export default function App() {
  const editorViewRef   = useRef<EditorView | null>(null);
  const slotPickerRef   = useRef<HTMLDivElement | null>(null);
  const symPickerRef    = useRef<HTMLDivElement | null>(null);
  const [showHelp, setShowHelp]         = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [source, setSource]           = useState(() => {
    const p = new URLSearchParams(window.location.search).get("s");
    if (p) try { return LZString.decompressFromEncodedURIComponent(p) ?? undefined; } catch {}
    return localStorage.getItem("lambda-playground:source") ?? EXAMPLES[0].src.trimStart();
  });
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
  const [symOpen, setSymOpen]         = useState(false);
  const [showCopied, setShowCopied]   = useState(false);
  const [copiedKey,  setCopiedKey]    = useState(0);
  const [config, setConfig]         = useState<Config>(loadConfig);
  const [stepsOpen, setStepsOpen]   = useState(() => localStorage.getItem("lambda-playground:panel:steps") !== "0");
  const [printOpen, setPrintOpen]   = useState(() => localStorage.getItem("lambda-playground:panel:print") !== "0");
  const [printDesc, setPrintDesc]   = useState(() => localStorage.getItem("lambda-playground:print:desc") === "1");
  const updateConfig = useCallback((patch: Partial<Config>) => {
    setConfig(c => { const next = { ...c, ...patch }; saveConfig(next); return next; });
  }, []);

  const toggleSteps = useCallback(() => setStepsOpen(o => { const n = !o; localStorage.setItem("lambda-playground:panel:steps", n ? "1" : "0"); return n; }), []);
  const togglePrint = useCallback(() => setPrintOpen(o => { const n = !o; localStorage.setItem("lambda-playground:panel:print", n ? "1" : "0"); return n; }), []);

  const setSourceAndSave = useCallback((s: string | ((prev: string) => string)) => {
    setSource(prev => {
      const next = typeof s === "function" ? s(prev) : s;
      localStorage.setItem("lambda-playground:source", next);
      return next;
    });
  }, []);

  const programResult = useMemo(() => parseProgram(source, config), [source, config]);

  // Push parse result into the CodeMirror StateField for syntax highlighting
  useEffect(() => {
    editorViewRef.current?.dispatch({ effects: setParsed.of(programResult) });
  }, [programResult]);

  let roundTripError: string | null = null;
  if (programResult.rawExpr) {
    try { assertRoundTrip(programResult.rawExpr); }
    catch (e) { roundTripError = String(e); }
  }

  const makeEntry = useCallback(
    (term: Term, stepNum: number, suffix = "", normal = true, status?: HistoryEntry["status"]) =>
      buildEntry(term, stepNum, normDefs, suffix, normal, status),
    [normDefs]
  );

  const mergeConfig = useCallback((pragma: PragmaConfig): Config =>
    ({ ...config, ...pragma }), [config]);

  const handleLoad = useCallback(() => {
    if (!programResult.ok || !programResult.expr) return;
    const term = programResult.expr;
    const d = programResult.defs;
    const effectiveConfig = mergeConfig(programResult.pragmaConfig);
    const nd = buildNormDefs(d, { maxSteps: effectiveConfig.maxStepsIdent, maxSize: effectiveConfig.maxSize });
    setNormDefs(nd);
    const done = step(term) === null;
    setLoaded({ term, done, stepNum: 0, effectiveConfig });
    setLoadedSource(source);
    setHistory([{ label: "0:", text: prettyPrint(term), match: findMatch(term, nd), status: done ? "normalForm" : undefined }]);
  }, [programResult, source, mergeConfig]);

  const advance = useCallback((maxSteps: number) => {
    if (!loaded || loaded.done) return;
    let current = loaded.term;
    let stepNum = loaded.stepNum;
    const entries: HistoryEntry[] = [];
    const maxSize = loaded.effectiveConfig.maxSize;
    let i = 0;
    let lastNext: Term | null = null;
    let sizeLimitHit = false;
    let hitSize = 0;
    for (; i < maxSteps; i++) {
      lastNext = step(current, showSubst);
      if (lastNext === null) break;
      current = lastNext;
      entries.push(makeEntry(current, ++stepNum));
      const sz = termSize(current);
      if (sz > maxSize) { sizeLimitHit = true; hitSize = sz; break; }
    }
    const done = sizeLimitHit || lastNext === null || step(current, showSubst) === null;
    const batchLimitHit = !done && i === maxSteps && maxSteps > 1;
    // Tag the last entry with its terminal status
    if (entries.length > 0) {
      const last = entries[entries.length - 1];
      if (sizeLimitHit) {
        entries[entries.length - 1] = { ...last, match: undefined, status: "sizeLimit", steps: stepNum, size: hitSize };
      } else if (done) {
        entries[entries.length - 1] = { ...last, status: "normalForm" };
      } else if (batchLimitHit) {
        entries[entries.length - 1] = { ...last, match: undefined, status: "stepLimit", steps: stepNum };
      }
    }
    setLoaded({ term: current, done, stepNum, effectiveConfig: loaded.effectiveConfig });
    const maxHistory = loaded.effectiveConfig.maxHistory;
    setHistory(h => [...entries.slice(-maxHistory).reverse(), ...h].slice(0, maxHistory));
  }, [loaded, makeEntry, showSubst]);

  const jumpTo = useCallback((offset: number) => {
    const view = editorViewRef.current;
    if (!view) return;
    view.dispatch({ selection: { anchor: offset }, scrollIntoView: true });
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
  const handleRun     = useCallback(() => advance(loaded?.effectiveConfig.maxStepsRun ?? config.maxStepsRun), [advance, loaded, config.maxStepsRun]);

  const handleEtaStep = useCallback(() => {
    if (!loaded) return;
    const next = etaStep(loaded.term);
    if (next === null) return;
    const stepNum = loaded.stepNum + 1;
    const done = step(next, showSubst) === null;
    const entry = makeEntry(next, stepNum);
    if (done) entry.status = "normalForm";
    setLoaded({ term: next, done, stepNum, effectiveConfig: loaded.effectiveConfig });
    setHistory(h => [entry, ...h].slice(0, loaded.effectiveConfig.maxHistory));
  }, [loaded, makeEntry, showSubst]);
  const handleLoadRun = useCallback(() => {
    if (!programResult.ok || !programResult.expr) return;
    const term = programResult.expr;
    const d = programResult.defs;
    const effectiveConfig = mergeConfig(programResult.pragmaConfig);
    const nd = buildNormDefs(d, { maxSteps: effectiveConfig.maxStepsIdent, maxSize: effectiveConfig.maxSize });
    setNormDefs(nd);
    setLoadedSource(source);
    // Run immediately from the fresh term
    const LIMIT = effectiveConfig.maxStepsRun;
    const maxSize = effectiveConfig.maxSize;
    let current = term;
    const entries: HistoryEntry[] = [buildEntry(term, 0, nd)];
    let i = 0;
    let lastNext: Term | null = null;
    let sizeLimitHit = false;
    let hitSize = 0;
    for (; i < LIMIT; i++) {
      lastNext = step(current, showSubst);
      if (lastNext === null) break;
      current = lastNext;
      entries.push(buildEntry(current, i + 1, nd));
      const sz = termSize(current);
      if (sz > maxSize) { sizeLimitHit = true; hitSize = sz; break; }
    }
    const done = sizeLimitHit || lastNext === null || step(current, showSubst) === null;
    const batchLimitHit = !done && i === LIMIT;
    if (entries.length > 0) {
      const last = entries[entries.length - 1];
      if (sizeLimitHit) {
        entries[entries.length - 1] = { ...last, match: undefined, status: "sizeLimit", steps: i + 1, size: hitSize };
      } else if (done) {
        entries[entries.length - 1] = { ...last, status: "normalForm" };
      } else if (batchLimitHit) {
        entries[entries.length - 1] = { ...last, match: undefined, status: "stepLimit", steps: i };
      }
    }
    const stepNum = entries.length - 1;
    setLoaded({ term: current, done, stepNum, effectiveConfig });
    setHistory(entries.slice(-effectiveConfig.maxHistory).reverse());
  }, [programResult, source, showSubst, mergeConfig]);

  const editorExtensions = useMemo(() => [
    lineNumbers({ formatNumber: n => String(n).padStart(4, "\u00a0") }),
    lambdaTheme, lambdaKeymap, lambdaCompleteKeymap, parsedField, lambdaHighlight, lambdaComplete,
  ], []);

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

  // Close symbol picker on outside click
  useEffect(() => {
    if (!symOpen) return;
    const handler = (e: MouseEvent) => {
      if (!symPickerRef.current?.contains(e.target as Node)) setSymOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [symOpen]);

  const handleInsertSym = useCallback((sym: string) => {
    const view = editorViewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({ changes: { from, to, insert: sym }, selection: { anchor: from + sym.length } });
    view.focus();
  }, []);

  const handleShare = useCallback(async () => {
    const encoded = LZString.compressToEncodedURIComponent(source);
    const url = `${location.origin}${location.pathname}?s=${encoded}`;
    await navigator.clipboard.writeText(url);
    setShowCopied(true);
    setCopiedKey(k => k + 1);
    setTimeout(() => setShowCopied(false), 1500);
  }, [source]);


  const canStep    = loaded !== null && !loaded.done && source === loadedSource;
  const canEtaStep = loaded !== null && source === loadedSource && etaStep(loaded.term) !== null;
  const currentTerm = programResult.expr;

  return (
    <div className={kinoMode ? "app kino" : "app"}>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showSettings && (
        <SettingsModal
          config={config}
          onApply={c => { updateConfig(c); setShowSettings(false); }}
          onCancel={() => setShowSettings(false)}
        />
      )}
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
              <button className="clear-btn" onClick={() => editorViewRef.current && openSearchPanel(editorViewRef.current)} title="Find and replace (Ctrl-F)">find</button>
              <button className="clear-btn" onClick={() => setSourceAndSave("")} title="Clear the editor">clear</button>
              <button className="share-btn" onClick={handleShare} title="Copy share link to clipboard">
                <Share2 size={16} />
                {showCopied && <span key={copiedKey} className="share-copied">copied!</span>}
              </button>
              <button className="help-btn" onClick={() => setShowSettings(true)} title="Settings"><Settings size={16} /></button>
              <button className="help-btn" onClick={() => setShowHelp(true)} title="Show help">?</button>
              <button className="help-btn kino-btn" onClick={toggleKino} title="Toggle kino (fullscreen) mode">⛶</button>
            </span>
          </div>
          <CodeMirror
            basicSetup={{ lineNumbers: false }}
            value={source}
            extensions={editorExtensions}
            onChange={(val) => setSourceAndSave(val)}
            onCreateEditor={(view) => { editorViewRef.current = view; view.dispatch({ effects: setParsed.of(programResult) }); view.focus(); }}
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
              <span className="row-label">sym</span>
              <div className="sym-picker" ref={symPickerRef}>
                <button className="tool-select slot-picker-btn" onClick={() => setSymOpen(o => !o)}
                  title="Insert Greek symbol (or type \name then Tab)">Ω ▾</button>
                {symOpen && (
                  <div className="sym-picker-menu">
                    <div className="sym-section-label">logic</div>
                    <div className="sym-row">
                      {LOGIC_SYMBOLS.map(g => (
                        <button key={g.name} className={`sym-item${g.reserved ? " sym-item-reserved" : ""}`}
                          title={g.reserved ? `\\${g.name} (reserved)` : `\\${g.name}`}
                          onClick={() => { handleInsertSym(g.sym); setSymOpen(false); }}>{g.sym}</button>
                      ))}
                    </div>
                    <div className="sym-section-label">lowercase</div>
                    <div className="sym-row">
                      {GREEK_SYMBOLS.filter(g => g.sym === g.sym.toLowerCase()).map(g => (
                        <button key={g.name} className="sym-item" title={`\\${g.name}`}
                          onClick={() => { handleInsertSym(g.sym); setSymOpen(false); }}>{g.sym}</button>
                      ))}
                    </div>
                    <div className="sym-section-label">uppercase</div>
                    <div className="sym-row">
                      {GREEK_SYMBOLS.filter(g => g.sym !== g.sym.toLowerCase()).map(g => (
                        <button key={g.name} className="sym-item" title={`\\${g.name}`}
                          onClick={() => { handleInsertSym(g.sym); setSymOpen(false); }}>{g.sym}</button>
                      ))}
                    </div>
                  </div>
                )}
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

        {/* ── Steps panel ── */}
        <Panel label="eval" open={stepsOpen} onToggle={toggleSteps}>
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
          <div className="eval-controls">
            <button className="load-btn" onClick={handleLoadRun} disabled={!programResult.ok || !programResult.expr}
              title="Load and beta-reduce to normal form (F5)">load &amp; run <kbd>F5</kbd></button>
            <button className="load-btn" onClick={handleLoad} disabled={!programResult.ok || !programResult.expr}
              title="Parse and load the current expression into the history (F6)">load <kbd>F6</kbd></button>
            <button onClick={handleStep}    disabled={!canStep}    title="Perform one beta-reduction step (F10)">β-step <kbd>F10</kbd></button>
            <button onClick={handleEtaStep} disabled={!canEtaStep} title="Perform one eta-reduction step: λx. f x → f (F11)">η-step <kbd>F11</kbd></button>
            <button onClick={handleRun}     disabled={!canStep}    title={`Beta-reduce up to ${loaded?.effectiveConfig.maxStepsRun ?? config.maxStepsRun} steps (F9)`}>run <kbd>F9</kbd></button>
            <label className="subst-toggle" title="Show substitution as an intermediate step before beta-reducing">
              <input type="checkbox" checked={showSubst} onChange={e => setShowSubst(e.target.checked)} />
              {" "}show substitution
            </label>
          </div>
          {history.length > 0 && (
            <div className="history-section">
              {history.map((entry, i) => (
                <div key={i} className="history-entry">
                  <code className="history-term">
                    <span className="history-label">{entry.label}</span>
                    {" "}{entry.text}
                  </code>
                  {entry.status && (
                    <span className="history-entry-status">
                      {entry.status === "normalForm"
                        ? <span className="eval-status normal-form">normal form</span>
                        : entry.status === "sizeLimit"
                          ? <span className="eval-status did-not-terminate">exceeded {entry.size} nodes after {entry.steps} steps</span>
                          : <span className="eval-status paused">paused after {entry.steps} steps</span>}
                      {entry.match && <span className="history-match"><span className="print-equiv">≡</span> {entry.match}</span>}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* ── Print panel ── */}
        <Panel label="output" open={printOpen} onToggle={togglePrint}
          headerExtra={<button className="panel-sort-btn" onClick={() => setPrintDesc(d => { const n = !d; localStorage.setItem("lambda-playground:print:desc", n ? "1" : "0"); return n; })} title="Toggle sort order">sort {printDesc ? "↑" : "↓"}</button>}>
          {programResult.printInfos.length > 0 ? (
            <div className="print-section">
              {(printDesc ? [...programResult.printInfos].reverse() : programResult.printInfos).map((r, i) => (
                <div key={i} className="print-entry" onClick={() => jumpTo(r.offset)} title="Go to source">
                  <code className="print-src">
                    <span className="print-index">{r.line}:</span>
                    {" π "}{r.src}
                  </code>
                  <code className="print-result">
                    <span className="print-result-text">{r.result}</span>
                    <span className="print-result-status">
                      {r.normal
                        ? <span className="eval-status normal-form">normal form</span>
                        : r.size !== undefined
                          ? <span className="eval-status did-not-terminate">exceeded {r.size} nodes after {r.steps} steps</span>
                          : <span className="eval-status did-not-terminate">did not terminate in {r.steps} steps</span>}
                      {r.match && <span className="history-match"><span className="print-equiv">≡</span> {r.match}</span>}
                    </span>
                  </code>
                </div>
              ))}
            </div>
          ) : (
            <span className="placeholder">no π statements in current program</span>
          )}
        </Panel>
      </main>

      <footer />
    </div>
  );
}
