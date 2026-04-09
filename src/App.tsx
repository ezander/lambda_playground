import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { parseProgram, PragmaConfig, EquivInfo, PrintComprehensionInfo, EquivComprehensionInfo } from "./parser/parser";
import { prettyPrint, assertRoundTrip } from "./parser/pretty";
import { AstView } from "./AstView";
import { HelpModal } from "./HelpModal";
import { SettingsModal } from "./SettingsModal";
import { step, etaStep, buildNormDefs, findMatch, termSize } from "./evaluator/eval";
import { Term } from "./parser/ast";
import CodeMirror, { EditorView, EditorState } from "@uiw/react-codemirror";
import { lineNumbers } from "@codemirror/view";
import { undo, redo, undoDepth, redoDepth, history as cmHistory } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { lambdaTheme, lambdaKeymap, GREEK_SYMBOLS, LOGIC_SYMBOLS } from "./editor";
import { lambdaComplete, lambdaCompleteKeymap } from "./autocomplete";
import { Settings, Share2, Maximize2, Minimize2 } from "lucide-react";
import { lambdaHighlight, setParsed, parsedField } from "./highlight";
import { lambdaLinks, LinkHandler } from "./links";
import "./App.css";
import LZString from "lz-string";
import JSZip from "jszip";
import { BUNDLED_CONTENT, DOCS, EXAMPLES, TUTORIALS, DEFAULT_SCRATCH } from "./data/content";

const SAVE_PREFIX = "lambda-playground:saved:";

type Config = { maxStepsPrint: number; maxStepsRun: number; maxStepsIdent: number; maxHistory: number; maxSize: number; showPassingEquiv: boolean };
const DEFAULT_CONFIG: Config = { maxStepsPrint: 1000, maxStepsRun: 1000, maxStepsIdent: 1000, maxHistory: 200, maxSize: 10000, showPassingEquiv: false };

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



const TRUNCATE_LEN = 200;

function TruncatedText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  if (text.length <= TRUNCATE_LEN) return <>{text}</>;
  if (expanded) return (
    <>
      {text}
      <span className="truncated-more" onClick={e => { e.stopPropagation(); setExpanded(false); }}> (less)</span>
    </>
  );
  return (
    <>
      {text.slice(0, TRUNCATE_LEN)}
      <span className="truncated-more" onClick={e => { e.stopPropagation(); setExpanded(true); }}>… (more)</span>
    </>
  );
}

function Truncated({ text }: { text: string }) {
  return <TruncatedText key={text} text={text} />;
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
  const editorExtRef    = useRef<import("@codemirror/state").Extension[]>([]);
  const linkHandlerRef  = useRef<LinkHandler | null>(null);
  const slotPickerRef   = useRef<HTMLDivElement | null>(null);
  const symPickerRef    = useRef<HTMLDivElement | null>(null);
  const [showHelp, setShowHelp]         = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [source, setSource]           = useState(() => {
    const p = new URLSearchParams(window.location.search).get("s");
    if (p) try { return LZString.decompressFromEncodedURIComponent(p) ?? undefined; } catch {}
    return localStorage.getItem("lambda-playground:source") ?? DEFAULT_SCRATCH;
  });
  const [view, setView]               = useState<View>("pretty");
  const [loaded, setLoaded]           = useState<Loaded>(null);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [normDefs, setNormDefs]       = useState<Map<string, string>>(new Map());
  const [history, setHistory]         = useState<HistoryEntry[]>([]);
  const [cursorPos, setCursorPos]     = useState<{ line: number; col: number } | null>(null);
  const [canUndo, setCanUndo]         = useState(false);
  const [canRedo, setCanRedo]         = useState(false);
  const [kinoLayout, setKinoLayout]   = useState(() => localStorage.getItem("lambda-playground:kino") === "1");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const kinoActive = kinoLayout || isFullscreen;
  const [kinoSplitPct, setKinoSplitPct] = useState(() => Number(localStorage.getItem("lambda-playground:kino-split")) || 40);
  const mainRef = useRef<HTMLElement>(null);
  const [showSubst, setShowSubst]     = useState(false);
  const [saveName, setSaveName]       = useState("");
  const [savedSlots, setSavedSlots]   = useState<string[]>(getSavedSlots);
  const [loadedSlotName, setLoadedSlotName] = useState<string | null>(null);
  const loadedSlotRef = useRef<string | null>(null); // ref copy for use in setSourceAndSave closure
  const isDirty = loadedSlotName !== null &&
    source !== (localStorage.getItem(SAVE_PREFIX + loadedSlotName) ?? "");
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
      if (loadedSlotRef.current === null)
        localStorage.setItem("lambda-playground:source", next); // only auto-save scratch
      return next;
    });
  }, []);

  const includeResolver = useCallback((path: string): string | null => {
    if (path.startsWith("user/")) return localStorage.getItem(SAVE_PREFIX + path.slice("user/".length)) ?? null;
    return BUNDLED_CONTENT[path] ?? null;
  }, []);

  const programResult = useMemo(() => parseProgram(source, config, includeResolver), [source, config, includeResolver]);

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

  const resetEditorContent = useCallback((content: string) => {
    const view = editorViewRef.current;
    if (!view) return;
    view.setState(EditorState.create({ doc: content, extensions: editorExtRef.current }));
    view.dispatch({ effects: EditorView.scrollIntoView(0) });
    view.focus();
  }, []);

  const switchToSlot = useCallback((name: string) => {
    if (loadedSlotRef.current !== null && isDirty) {
      if (!window.confirm(`Discard unsaved changes to buffer "${loadedSlotRef.current}"?`)) return;
    }
    const saved = localStorage.getItem(SAVE_PREFIX + name);
    if (saved !== null) {
      loadedSlotRef.current = name;
      setLoadedSlotName(name);
      setSaveName(name);
      setSource(saved);
      resetEditorContent(saved);
    }
  }, [isDirty, resetEditorContent]);

  const switchToScratch = useCallback(() => {
    if (loadedSlotRef.current !== null && isDirty) {
      if (!window.confirm(`Discard unsaved changes to buffer "${loadedSlotRef.current}"?`)) return;
    }
    const scratch = localStorage.getItem("lambda-playground:source") ?? "";
    loadedSlotRef.current = null;
    setLoadedSlotName(null);
    setSaveName("");
    setSource(scratch);
    resetEditorContent(scratch);
  }, [isDirty, resetEditorContent]);

  const handleSaveSlot = useCallback(() => {  // "save as"
    const name = saveName.trim();
    if (!name) return;
    if (savedSlots.includes(name) && name !== loadedSlotRef.current) {
      if (!window.confirm(`Overwrite buffer "${name}"?`)) return;
    }
    localStorage.setItem(SAVE_PREFIX + name, source);
    setSavedSlots(getSavedSlots());
    loadedSlotRef.current = name;
    setLoadedSlotName(name);
    setSaveName(name);
  }, [saveName, source, savedSlots]);

  const handleSaveOverwrite = useCallback(() => {  // "save" — overwrite current named buffer
    if (!loadedSlotName) return;
    localStorage.setItem(SAVE_PREFIX + loadedSlotName, source);
    setSavedSlots(getSavedSlots());
  }, [loadedSlotName, source]);

  const handleNewBuffer = useCallback(() => {  // "new" — create empty buffer under typed name
    const name = saveName.trim();
    if (!name) return;
    if (loadedSlotRef.current !== null && isDirty) {
      if (!window.confirm(`Discard unsaved changes to buffer "${loadedSlotRef.current}"?`)) return;
    }
    if (savedSlots.includes(name)) {
      if (!window.confirm(`Overwrite buffer "${name}"?`)) return;
    }
    localStorage.setItem(SAVE_PREFIX + name, "");
    setSavedSlots(getSavedSlots());
    loadedSlotRef.current = name;
    setLoadedSlotName(name);
    setSource("");
    resetEditorContent("");
  }, [saveName, isDirty, savedSlots, resetEditorContent]);


  const handleDeleteSlot = useCallback(() => {
    const name = saveName.trim();
    if (!name) return;
    if (!window.confirm(`Delete buffer "${name}"?`)) return;
    localStorage.removeItem(SAVE_PREFIX + name);
    setSavedSlots(getSavedSlots());
    setSaveName("");
    if (loadedSlotRef.current === name) {
      const scratch = localStorage.getItem("lambda-playground:source") ?? "";
      loadedSlotRef.current = null;
      setLoadedSlotName(null);
      setSource(scratch);
      resetEditorContent(scratch);
    }
  }, [saveName, resetEditorContent]);

  const loadExample = useCallback((exSrc: string) => {
    const view = editorViewRef.current;
    const oldScratch = localStorage.getItem("lambda-playground:source") ?? "";
    // Switch to scratch buffer
    loadedSlotRef.current = null;
    setLoadedSlotName(null);
    setSaveName("");
    // Reset editor history to old scratch content as base, then apply example on top.
    // Skip if content is already identical (avoids breaking extensions on no-op reload).
    if (view && view.state.doc.toString() !== exSrc) {
      view.setState(EditorState.create({ doc: oldScratch, extensions: editorExtRef.current }));
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: exSrc } });
    }
    const newSrc = exSrc;
    setSource(newSrc);
    localStorage.setItem("lambda-playground:source", newSrc);
  }, []);

  useEffect(() => {
    linkHandlerRef.current = (type: string, name: string) => {
      if (loadedSlotRef.current !== null && isDirty) {
        if (!window.confirm(`Discard unsaved changes to buffer "${loadedSlotRef.current}"?`)) return;
      }
      if (type === "user") {
        switchToSlot(name);
      } else {
        const path = `${type}/${name}`;
        const src = BUNDLED_CONTENT[path];
        if (src) loadExample(src.trimStart());
        else {
          // Try display lists for case-insensitive or label match
          const all = [...DOCS, ...TUTORIALS, ...EXAMPLES];
          const entry = all.find(x => x.label === name);
          if (entry) loadExample(entry.src.trimStart());
          else alert(`"${path}" not found.`);
        }
      }
    };
  }, [isDirty, loadExample, switchToSlot]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([source], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (saveName.trim() || "lambda") + ".txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [source, saveName]);

  const handleExport = useCallback(async () => {
    if (savedSlots.length === 0) { alert("No named buffers to export."); return; }
    if (!window.confirm(`Export ${savedSlots.length} named buffer${savedSlots.length === 1 ? "" : "s"} to lambda-buffers.zip?`)) return;
    const zip = new JSZip();
    for (const name of savedSlots) {
      const content = localStorage.getItem(SAVE_PREFIX + name) ?? "";
      zip.file(name + ".txt", content);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "lambda-buffers.zip"; a.click();
    URL.revokeObjectURL(url);
  }, [savedSlots]);

  const [importItems, setImportItems] = useState<{ name: string; content: string; conflict: boolean; checked: boolean }[]>([]);
  const [showImport, setShowImport]   = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImportPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const zip = await JSZip.loadAsync(file);
      const items: typeof importItems = [];
      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir || path.includes("/") || !path.endsWith(".txt")) continue;
        const content = await entry.async("string");
        const name = path.slice(0, -4);
        const conflict = savedSlots.includes(name);
        items.push({ name, content, conflict, checked: !conflict });
      }
      if (items.length === 0) { alert("No .txt files found in zip root."); return; }
      items.sort((a, b) => a.name.localeCompare(b.name));
      setImportItems(items);
      setShowImport(true);
    } catch { alert("Could not read zip file."); }
  }, [savedSlots]);

  const handleImportConfirm = useCallback(() => {
    for (const item of importItems) {
      if (!item.checked) continue;
      localStorage.setItem(SAVE_PREFIX + item.name, item.content);
    }
    setSavedSlots(getSavedSlots());
    setShowImport(false);
  }, [importItems]);

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

  const editorExtensions = useMemo(() => {
    const exts = [
      cmHistory(),
      lineNumbers({ formatNumber: n => String(n).padStart(4, "\u00a0") }),
      lambdaTheme, lambdaKeymap, lambdaCompleteKeymap, parsedField, lambdaHighlight, lambdaComplete,
      lambdaLinks(linkHandlerRef),
    ];
    editorExtRef.current = exts;
    return exts;
  }, []);

  const toggleTheater   = useCallback(() => setKinoLayout(v => { const next = !v; localStorage.setItem("lambda-playground:kino", next ? "1" : "0"); return next; }), []);
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement)
      document.documentElement.requestFullscreen().catch(() => {});
    else
      document.exitFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setShowImport(false); return; }
      if (e.key === "F5")  { e.preventDefault(); handleLoadRun(); }
      if (e.key === "F6")  { e.preventDefault(); handleLoad(); }
      if (e.key === "F9")  { e.preventDefault(); handleRun(); }
      if (e.key === "F10") { e.preventDefault(); handleStep(); }
      if (e.key === "F11") { e.preventDefault(); handleEtaStep(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleLoad, handleStep, handleRun, handleLoadRun, toggleFullscreen]);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMouseMove = (ev: MouseEvent) => {
      if (!mainRef.current) return;
      const rect = mainRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(20, Math.min(75, pct));
      localStorage.setItem("lambda-playground:kino-split", String(clamped));
      setKinoSplitPct(clamped);
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  // Sync kino state if user exits fullscreen via browser (Escape)
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
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

  const parseErrorsBlock = (programResult.errors.length > 0 || roundTripError) ? (
    <ul className="parse-errors">
      {programResult.errors.map((e, i) => (
        <li
          key={i}
          className={[
            e.kind === "warning" ? "parse-warning" : "",
            e.offset !== undefined ? "parse-error-link" : "",
          ].join(" ").trim()}
          onClick={() => e.offset !== undefined && jumpTo(e.offset)}
        >{e.source ? `In "${e.source}": ${e.message}` : e.message}</li>
      ))}
      {roundTripError && <li>{roundTripError}</li>}
    </ul>
  ) : null;

  return (
    <div className={kinoActive ? "app kino" : "app"}>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showImport && (
        <div className="modal-backdrop" onClick={() => setShowImport(false)}>
          <div className="modal import-modal" onClick={e => e.stopPropagation()}>
            <h2>IMPORT BUFFERS</h2>
            <div className="import-actions">
              <button className="ex-btn" onClick={() => setImportItems(items => items.map(i => ({ ...i, checked: true })))}>check all</button>
              <button className="ex-btn" onClick={() => setImportItems(items => items.map(i => ({ ...i, checked: false })))}>uncheck all</button>
            </div>
            <ul className="import-list">
              {importItems.map((item, i) => (
                <li key={item.name} className={item.conflict ? "import-conflict" : ""}>
                  <label>
                    <input type="checkbox" checked={item.checked}
                      onChange={e => setImportItems(items => items.map((it, j) => j === i ? { ...it, checked: e.target.checked } : it))} />
                    {" "}{item.name}{item.conflict ? <span className="import-conflict-tag"> (exists — overwrite?)</span> : ""}
                  </label>
                </li>
              ))}
            </ul>
            <div className="modal-buttons">
              <button className="ex-btn" onClick={handleImportConfirm}
                disabled={importItems.every(i => !i.checked)}>import selected</button>
              <button className="ex-btn" onClick={() => setShowImport(false)}>cancel</button>
            </div>
          </div>
        </div>
      )}

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

      <main ref={mainRef} style={kinoActive ? { gridTemplateColumns: `${kinoSplitPct}% 6px 1fr` } : undefined}>
        {/* ── Editor ── */}
        <section className="editor-section">
          <div className="editor-label-row">
            <label htmlFor="source">expression</label>
            <span className="editor-meta">
              {cursorPos && <span className="cursor-pos">{cursorPos.line}:{cursorPos.col}</span>}
              <button className="clear-btn" onClick={() => editorViewRef.current && undo(editorViewRef.current)} disabled={!canUndo} title="Undo (Ctrl+Z)">undo</button>
              <button className="clear-btn" onClick={() => editorViewRef.current && redo(editorViewRef.current)} disabled={!canRedo} title="Redo (Ctrl+Y)">redo</button>
              <button className="clear-btn" onClick={() => editorViewRef.current && openSearchPanel(editorViewRef.current)} title="Find and replace (Ctrl-F)">find</button>
              <button className="share-btn" onClick={handleShare} title="Copy share link to clipboard">
                <Share2 size={16} />
                {showCopied && <span key={copiedKey} className="share-copied">copied!</span>}
              </button>
              <button className="help-btn" onClick={() => setShowSettings(true)} title="Settings"><Settings size={16} /></button>
              <button className="help-btn" onClick={() => setShowHelp(true)} title="Show help">?</button>
              <button className="help-btn" onClick={toggleTheater} title={kinoLayout ? "Exit theater mode" : "Theater mode"}><span style={{ display: "inline-block", transform: "scale(1.3, 0.85)" }}>⛶</span></button>
              <button className="help-btn" onClick={toggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
                {isFullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
              </button>
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
            {DOCS.length > 0 && <><div className="toolbar-group">
              <span className="row-label">docs</span>
              <div className="select-wrap">
                <select className="tool-select" value="" onChange={e => {
                  const d = DOCS.find(x => x.label === e.target.value);
                  if (d) loadExample(d.src.trimStart());
                }}>
                  <option value="" disabled>— pick —</option>
                  {DOCS.map(d => <option key={d.label} value={d.label}>{d.label}</option>)}
                </select>
              </div>
            </div><span className="toolbar-sep" /></>}
            {TUTORIALS.length > 0 && <><div className="toolbar-group">
              <span className="row-label">tutorials</span>
              <div className="select-wrap">
                <select className="tool-select" value="" onChange={e => {
                  const t = TUTORIALS.find(x => x.label === e.target.value);
                  if (t) loadExample(t.src.trimStart());
                }}>
                  <option value="" disabled>— pick —</option>
                  {TUTORIALS.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
                </select>
              </div>
            </div><span className="toolbar-sep" /></>}
            <div className="toolbar-group">
              <span className="row-label">examples</span>
              <div className="select-wrap">
                <select className="tool-select" value="" onChange={e => {
                  const ex = EXAMPLES.find(x => x.label === e.target.value);
                  if (ex) loadExample(ex.src.trimStart());
                }}>
                  <option value="" disabled>— pick —</option>
                  {EXAMPLES.map(ex => <option key={ex.label} value={ex.label}>{ex.label}</option>)}
                </select>
              </div>
            </div>
            <span className="toolbar-sep" />
            <div className="toolbar-group">
              <span className="row-label">sym</span>
              <div className="sym-picker" ref={symPickerRef}>
                <button className="tool-select slot-picker-btn" onClick={() => setSymOpen(o => !o)}
                  title="Insert symbol (or type \name then Space)">Ω ▾</button>
                {symOpen && (
                  <div className="sym-picker-menu">
                    <div className="sym-section-label">logic</div>
                    <div className="sym-row">
                      {LOGIC_SYMBOLS.map(g => (
                        <button key={g.name} className={`sym-item${g.reserved ? " sym-item-reserved" : ""}`}
                          title={g.reserved ? `\\${g.name} (reserved)` : g.shortcut ? `\\${g.name}  (${g.shortcut})` : `\\${g.name}`}
                          onClick={() => { handleInsertSym(g.sym); setSymOpen(false); }}>{g.sym}</button>
                      ))}
                    </div>
                    <div className="sym-section-label">lowercase</div>
                    <div className="sym-row">
                      {GREEK_SYMBOLS.filter(g => g.sym === g.sym.toLowerCase()).map(g => (
                        <button key={g.name} className={`sym-item${g.reserved ? " sym-item-reserved" : ""}`}
                          title={g.reserved ? `\\${g.name} (reserved)` : g.shortcut ? `\\${g.name}  (${g.shortcut})` : `\\${g.name}`}
                          onClick={() => { handleInsertSym(g.sym); setSymOpen(false); }}>{g.sym}</button>
                      ))}
                    </div>
                    <div className="sym-section-label">uppercase</div>
                    <div className="sym-row">
                      {GREEK_SYMBOLS.filter(g => g.sym !== g.sym.toLowerCase()).map(g => (
                        <button key={g.name} className={`sym-item${g.reserved ? " sym-item-reserved" : ""}`}
                          title={g.reserved ? `\\${g.name} (reserved)` : g.shortcut ? `\\${g.name}  (${g.shortcut})` : `\\${g.name}`}
                          onClick={() => { handleInsertSym(g.sym); setSymOpen(false); }}>{g.sym}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="toolbar">
            <div className="toolbar-group">
              <span className="row-label">buffers</span>
              <span className="current-buffer" title={
                loadedSlotName
                  ? (isDirty ? `${loadedSlotName} (modified)` : loadedSlotName)
                  : "Scratch buffer (auto-saved)"
              }>
                {loadedSlotName ?? "*scratch*"}{isDirty ? (() => {
                  const hasErrors = !programResult.ok || programResult.errors.some(e => e.kind !== "warning");
                  const hasWarnings = programResult.errors.some(e => e.kind === "warning");
                  const cls = hasErrors ? "dirty-indicator dirty-indicator-error" : hasWarnings ? "dirty-indicator dirty-indicator-warning" : "dirty-indicator dirty-indicator-ok";
                  return <span className={cls}> ●</span>;
                })() : ""}
              </span>
              <button className="ex-btn" onClick={handleSaveOverwrite}
                disabled={!loadedSlotName || !isDirty}
                title="Save changes to current buffer">save</button>
              <span className="toolbar-sep" />
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
                    title="Select a buffer">▾</button>
                  {slotOpen && (
                    <div className="slot-picker-menu">
                      <button className={`slot-picker-item${loadedSlotName === null ? " slot-picker-item-active" : ""}`}
                        onClick={() => { switchToScratch(); setSlotOpen(false); }}>
                        *scratch*
                      </button>
                      {savedSlots.map(name => (
                        <button key={name} className={`slot-picker-item${name === loadedSlotName ? " slot-picker-item-active" : ""}`}
                          onClick={() => { switchToSlot(name); setSlotOpen(false); }}>
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="toolbar-group">
              <button className="ex-btn" onClick={handleSaveSlot}
                disabled={!saveName.trim() || saveName.trim() === loadedSlotName}
                title="Save current content as a named buffer">save&nbsp;as</button>
              <button className="ex-btn" onClick={handleNewBuffer}
                disabled={!saveName.trim() || saveName.trim() === loadedSlotName}
                title="Create a new empty buffer with this name">new</button>
              <button className="ex-btn" onClick={handleDeleteSlot}
                disabled={!savedSlots.includes(saveName.trim())}
                title="Delete this buffer">delete</button>
            </div>
            <div className="toolbar-group">
              <button className="ex-btn" onClick={handleDownload}
                title={`Download as ${(saveName.trim() || "lambda") + ".txt"}`}>download</button>
              <button className="ex-btn" onClick={handleExport}
                disabled={savedSlots.length === 0}
                title="Export all named buffers to a zip file">export</button>
              <button className="ex-btn" onClick={() => importInputRef.current?.click()}
                title="Import buffers from a zip file">import</button>
              <input ref={importInputRef} type="file" accept=".zip" style={{ display: "none" }} onChange={handleImportPick} />
            </div>
          </div>
          {!kinoActive && parseErrorsBlock}
        </section>

        {kinoActive && <div className="kino-divider" onMouseDown={handleDividerMouseDown} />}
        <div className="panels-right">
          {kinoActive && parseErrorsBlock}
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
          {(programResult.printInfos.length > 0 || programResult.equivInfos.length > 0 || programResult.printComprehensionInfos.length > 0 || programResult.equivComprehensionInfos.length > 0) ? (() => {
            type PrintItem      = { kind: "print";      data: typeof programResult.printInfos[number] };
            type EquivItem      = { kind: "equiv";      data: EquivInfo; passed: boolean; opSym: string };
            type PrintCompItem  = { kind: "print-comp"; data: PrintComprehensionInfo };
            type EquivCompItem  = { kind: "equiv-comp"; data: EquivComprehensionInfo };
            const items: (PrintItem | EquivItem | PrintCompItem | EquivCompItem)[] = [
              ...programResult.printInfos.map(d => ({ kind: "print" as const, data: d })),
              ...programResult.equivInfos.map(d => ({ kind: "equiv" as const, data: d, passed: d.negated ? !d.equivalent : d.equivalent, opSym: d.negated ? "≢" : "≡" })).filter(d => config.showPassingEquiv || !d.passed),
              ...programResult.printComprehensionInfos.map(d => ({ kind: "print-comp" as const, data: d })),
              ...programResult.equivComprehensionInfos.filter(d => config.showPassingEquiv || !d.allPassed).map(d => ({ kind: "equiv-comp" as const, data: d })),
            ].sort((a, b) => (printDesc ? b.data.offset - a.data.offset : a.data.offset - b.data.offset));
            return (
              <div className="print-section">
                {items.map((item, i) => item.kind === "print" ? (
                  <div key={i} className="print-entry" onClick={() => jumpTo(item.data.offset)} title="Go to source">
                    <code className="print-src">
                      <span className="print-index">{item.data.line}:</span>
                      {" π "}{item.data.src}
                    </code>
                    <code className="print-result">
                      <span className="print-result-text"><Truncated text={item.data.result} /></span>
                      <span className="print-result-status">
                        {item.data.match && <span className="history-match"><span className="print-equiv">≡</span> {item.data.match}</span>}
                        {item.data.normal
                          ? <><span className="eval-status normal-form">normal form</span>{item.data.steps > 0 && <span className="eval-status normal-form">in {item.data.steps} steps</span>}</>
                          : item.data.size !== undefined
                            ? <span className="eval-status did-not-terminate">exceeded {item.data.size} nodes after {item.data.steps} steps</span>
                            : <span className="eval-status did-not-terminate">did not terminate in {item.data.steps} steps</span>}
                      </span>
                    </code>
                  </div>
                ) : item.kind === "equiv" ? (
                  <div key={i} className="print-entry equiv-entry" onClick={() => jumpTo(item.data.offset)} title="Go to source">
                    <code className="print-src">
                      <span className="print-index">{item.data.line}:</span>
                      {" "}{item.data.src1}
                      <span className={`equiv-op ${item.passed ? "equiv-pass" : "equiv-fail"}`}> {item.opSym} </span>
                      {item.data.src2}
                    </code>
                    <code className="print-result">
                      <span className="print-result-text">
                        <Truncated text={item.data.norm1} />
                        <span className={`equiv-op ${item.passed ? "equiv-pass" : "equiv-fail"}`}> {item.opSym} </span>
                        <Truncated text={item.data.norm2} />
                      </span>
                      <span className="print-result-status">
                        {item.data.equivalent
                          ? <span className={`eval-status ${item.passed ? "normal-form" : "did-not-terminate"}`}>equivalent</span>
                          : item.data.terminated
                            ? <span className={`eval-status ${item.passed ? "normal-form" : "did-not-terminate"}`}>not equivalent</span>
                            : <span className="eval-status did-not-terminate">no normal form</span>}
                      </span>
                    </code>
                  </div>
                ) : item.kind === "print-comp" ? (
                  <div key={i} className="print-entry print-comp-entry" onClick={() => jumpTo(item.data.offset)} title="Go to source">
                    <code className="print-src">
                      <span className="print-index">{item.data.line}:</span>
                      {" π "}{item.data.src}
                      <span className="comp-spec"> [{item.data.bindings.map(b => `${b.name}:={${b.values.join(",")}}`).join(", ")}]</span>
                    </code>
                    <div className="comp-rows">
                      {item.data.rows.map((row, ri) => (
                        <div key={ri} className="comp-row">
                          <span className="comp-bullet">•</span>
                          <div className="comp-row-content">
                            <code className="comp-subst-expr">{row.substExpr}</code>
                            <code className="print-result">
                              <span className="print-result-text"><Truncated text={row.result} /></span>
                              <span className="print-result-status">
                                {row.match && <span className="history-match"><span className="print-equiv">≡</span> {row.match}</span>}
                                {row.normal
                                  ? <><span className="eval-status normal-form">normal form</span>{row.steps > 0 && <span className="eval-status normal-form">in {row.steps} steps</span>}</>
                                  : row.size !== undefined
                                    ? <span className="eval-status did-not-terminate">exceeded {row.size} nodes after {row.steps} steps</span>
                                    : <span className="eval-status did-not-terminate">did not terminate in {row.steps} steps</span>}
                              </span>
                            </code>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="print-entry equiv-comp-entry" onClick={() => jumpTo(item.data.offset)} title="Go to source">
                    <code className="print-src">
                      <span className="print-index">{item.data.line}:</span>
                      {" "}{item.data.src1}
                      <span className={`equiv-op ${item.data.allPassed ? "equiv-pass" : "equiv-fail"}`}> {item.data.negated ? "≢" : "≡"} </span>
                      {item.data.src2}
                      <span className="comp-spec"> [{item.data.bindings.map(b => `${b.name}:={${b.values.join(",")}}`).join(", ")}]</span>
                    </code>
                    <div className="comp-rows">
                      {item.data.rows.map((row, ri) => {
                        const rowPassed = item.data.negated ? !row.equivalent : row.equivalent;
                        const rowClass = `equiv-op ${rowPassed ? "equiv-pass" : "equiv-fail"}`;
                        return (
                          <div key={ri} className="comp-row">
                            <span className="comp-bullet">•</span>
                            <div className="comp-row-content">
                              <code className="comp-subst-expr">
                                {row.substExpr1}
                                <span className={rowClass}> {item.data.negated ? "≢" : "≡"} </span>
                                {row.substExpr2}
                              </code>
                              <code className="print-result">
                                <span className="print-result-text">
                                  <Truncated text={row.norm1} />
                                  <span className={rowClass}> {item.data.negated ? "≢" : "≡"} </span>
                                  <Truncated text={row.norm2} />
                                </span>
                                <span className="print-result-status">
                                  {row.equivalent
                                    ? <span className={`eval-status ${rowPassed ? "normal-form" : "did-not-terminate"}`}>equivalent</span>
                                    : row.terminated
                                      ? <span className={`eval-status ${rowPassed ? "normal-form" : "did-not-terminate"}`}>not equivalent</span>
                                      : <span className="eval-status did-not-terminate">no normal form</span>}
                                </span>
                              </code>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })() : (
            <span className="placeholder">no π or ≡ statements in current program</span>
          )}
        </Panel>
        </div>
      </main>

      <footer />
    </div>
  );
}
