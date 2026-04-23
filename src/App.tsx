import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { parseProgram, PragmaConfig, EquivInfo, PrintComprehensionInfo, EquivComprehensionInfo, LambdaError, ProgramResult } from "./parser/parser";
import { prettyPrint, assertRoundTrip } from "./parser/pretty";
import { HelpModal } from "./HelpModal";
import { SettingsModal } from "./SettingsModal";
import { step, etaStep, buildNormDefs, findMatch, termSize } from "./evaluator/eval";
import { Term } from "./parser/ast";
import CodeMirror, { EditorView, EditorState, ViewUpdate } from "@uiw/react-codemirror";
import { lineNumbers } from "@codemirror/view";
import { undo, redo, undoDepth, redoDepth, history as cmHistory } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import { lambdaTheme, lambdaKeymap, GREEK_SYMBOLS, LOGIC_SYMBOLS } from "./editor";
import { makeWrapExtensions, wrapCompartment } from "./rewrap";
import { lambdaComplete, lambdaCompleteKeymap, autocompleteWheelPlugin } from "./autocomplete";
import { Settings, Share2, Maximize2, Minimize2 } from "lucide-react";
import { lambdaHighlight, lambdaDiagnosticTooltip, setParsed, parsedField } from "./highlight";
import { lambdaLinks, LinkHandler } from "./links";
import "./App.css";
import LZString from "lz-string";
import JSZip from "jszip";
import { DOCS, EXAMPLES, TUTORIALS, DEFAULT_SCRATCH } from "./data/content";
import { SAVE_PREFIX, getSavedSlots, resolveContent, KEY_CONFIG, KEY_SOURCE, KEY_KINO, KEY_KINO_SPLIT, KEY_PANEL_STEPS, KEY_PANEL_PRINT, KEY_PRINT_DESC } from "./storage";
import { Config, DEFAULT_CONFIG } from "./config";
import { useFocusTrap } from "./useFocusTrap";

function loadConfig(): Config {
  try {
    const s = localStorage.getItem(KEY_CONFIG);
    if (s) return { ...DEFAULT_CONFIG, ...JSON.parse(s) };
  } catch {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(c: Config) {
  localStorage.setItem(KEY_CONFIG, JSON.stringify(c));
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

const TRUNCATE_LEN      = 200;
const PARSE_DEBOUNCE_MS = 250;
const SAVE_DEBOUNCE_MS  = 1000;

function offsetToLineCol(source: string, offset: number): string {
  const line = (source.slice(0, offset).match(/\n/g)?.length ?? 0) + 1;
  const col  = offset - source.lastIndexOf("\n", offset - 1);
  return `${line}:${col}`;
}

function formatError(e: LambdaError, source: string): string {
  const pos = e.location ?? (e.offset !== undefined ? offsetToLineCol(source, e.offset) : null);
  return `${e.message}${e.source ? ` in "${e.source}"` : ""}${pos ? ` at (${pos})` : ""}${e.via ? `, via "${e.via}"` : ""}`;
}

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

type Loaded = { term: Term; done: boolean; sizeLimited?: boolean; stepNum: number; effectiveConfig: Config } | null;
type HistoryEntry = { label: string; text: string; match?: string; status?: "normalForm" | "stepLimit" | "sizeLimit"; steps?: number; size?: number };


function buildEntry(term: Term, stepNum: number, nd: Map<string, string>, suffix = "", normal = true, status?: HistoryEntry["status"]): HistoryEntry {
  return {
    label: `${stepNum}:`,
    text: prettyPrint(term) + suffix,
    match: normal ? findMatch(term, nd) : undefined,
    status,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EditorHeaderBar({ cursorPos, canUndo, canRedo, onUndo, onRedo, onFind, showCopied, copiedKey, onShare, onSettings, onHelp, kinoLayout, isFullscreen, onToggleTheater, onToggleFullscreen }: {
  cursorPos: { line: number; col: number } | null;
  canUndo: boolean; canRedo: boolean;
  onUndo: () => void; onRedo: () => void; onFind: () => void;
  showCopied: boolean; copiedKey: number; onShare: () => void;
  onSettings: () => void; onHelp: () => void;
  kinoLayout: boolean; isFullscreen: boolean;
  onToggleTheater: () => void; onToggleFullscreen: () => void;
}) {
  return (
    <div className="editor-label-row">
      <span className="editor-meta">
        {cursorPos && <span className="cursor-pos">{cursorPos.line}:{cursorPos.col}</span>}
        <button className="clear-btn" tabIndex={-1} onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">undo</button>
        <button className="clear-btn" tabIndex={-1} onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">redo</button>
        <button className="clear-btn" tabIndex={-1} onClick={onFind} title="Find and replace (Ctrl-F)">find</button>
        <button className="share-btn" onClick={onShare} title="Copy share link to clipboard">
          <Share2 size={16} />
          {showCopied && <span key={copiedKey} className="share-copied">copied!</span>}
        </button>
        <button className="help-btn" onClick={onSettings} title="Settings"><Settings size={16} /></button>
        <button className="help-btn" onClick={onHelp} title="Show help">?</button>
        <button className="help-btn" onClick={onToggleTheater} title={kinoLayout ? "Exit theater mode" : "Theater mode"}><span style={{ display: "inline-block", transform: "scale(1.3, 0.85)" }}>⛶</span></button>
        <button className="help-btn" onClick={onToggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
          {isFullscreen ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}
        </button>
      </span>
    </div>
  );
}

function LambdaEditor({ source, extensions, onChange, onCreateEditor, onUpdate }: {
  source: string;
  extensions: import("@codemirror/state").Extension[];
  onChange: (val: string) => void;
  onCreateEditor: (view: EditorView) => void;
  onUpdate: (update: ViewUpdate) => void;
}) {
  return (
    <CodeMirror
      basicSetup={{ lineNumbers: false }}
      value={source}
      extensions={extensions}
      onChange={onChange}
      onCreateEditor={onCreateEditor}
      onUpdate={onUpdate}
    />
  );
}

function BuffersToolbar({ loadedSlotName, showDirty, programResult, autoSave, saveBtnRef, saveNameInputRef, onSaveOverwrite, saveName, onSaveNameChange, onSaveNameKeyDown, slotPickerRef, slotOpen, onToggleSlotOpen, savedSlots, onSwitchToScratch, onSwitchToSlot, onSaveSlotAs, onNewBuffer, onDeleteSlot, onDownload, onExport, importInputRef, onImportPick }: {
  loadedSlotName: string | null; showDirty: boolean; programResult: ProgramResult; autoSave: boolean;
  saveBtnRef: React.RefObject<HTMLButtonElement | null>; saveNameInputRef: React.RefObject<HTMLInputElement | null>;
  onSaveOverwrite: () => void; saveName: string;
  onSaveNameChange: (v: string) => void; onSaveNameKeyDown: (e: React.KeyboardEvent) => void;
  slotPickerRef: React.RefObject<HTMLDivElement | null>; slotOpen: boolean; onToggleSlotOpen: () => void;
  savedSlots: string[]; onSwitchToScratch: () => void; onSwitchToSlot: (name: string) => void;
  onSaveSlotAs: () => void; onNewBuffer: () => void; onDeleteSlot: () => void;
  onDownload: () => void; onExport: () => void;
  importInputRef: React.RefObject<HTMLInputElement | null>; onImportPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const hasErrors = !programResult.ok || programResult.errors.some(e => e.kind !== "warning");
  const hasWarnings = programResult.errors.some(e => e.kind === "warning");
  const dirtyCls = hasErrors ? "dirty-indicator dirty-indicator-error"
    : hasWarnings ? "dirty-indicator dirty-indicator-warning" : "dirty-indicator dirty-indicator-ok";
  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <span className="row-label">buffers</span>
        <span className="current-buffer" title={loadedSlotName
          ? (showDirty ? `${loadedSlotName} (modified)` : loadedSlotName)
          : "Scratch buffer (auto-saved)"}>
          {loadedSlotName ?? "*scratch*"}<span className={showDirty ? dirtyCls : "dirty-indicator dirty-indicator-hidden"}> ●</span>
        </span>
        {autoSave && loadedSlotName
          ? <span className="autosave-indicator" title="auto-save is on">auto</span>
          : <button className="ex-btn" ref={saveBtnRef} onClick={onSaveOverwrite}
              disabled={!loadedSlotName || !showDirty}
              title="Save changes to current buffer (Ctrl-S)">save</button>}
        <span className="toolbar-sep" />
        <div className="storage-combo">
          <input className="save-name-input" type="text" ref={saveNameInputRef} placeholder="name…"
            value={saveName} onChange={e => onSaveNameChange(e.target.value)} onKeyDown={onSaveNameKeyDown} />
          <div className="slot-picker" ref={slotPickerRef}>
            <button className="tool-select slot-picker-btn" onClick={onToggleSlotOpen} title="Select a buffer">▾</button>
            {slotOpen && (
              <div className="slot-picker-menu">
                <button className={`slot-picker-item${loadedSlotName === null ? " slot-picker-item-active" : ""}`}
                  onClick={onSwitchToScratch}>*scratch*</button>
                {savedSlots.map(name => (
                  <button key={name} className={`slot-picker-item${name === loadedSlotName ? " slot-picker-item-active" : ""}`}
                    onClick={() => onSwitchToSlot(name)}>{name}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="toolbar-group">
        <button className="ex-btn" onClick={onSaveSlotAs}
          disabled={!saveName.trim() || saveName.trim() === loadedSlotName}
          title="Save current content as a named buffer">save&nbsp;as</button>
        <button className="ex-btn" onClick={onNewBuffer}
          disabled={!saveName.trim() || saveName.trim() === loadedSlotName}
          title="Create a new empty buffer with this name">new</button>
        <button className="ex-btn" onClick={onDeleteSlot}
          disabled={!savedSlots.includes(saveName.trim())}
          title="Delete this buffer">delete</button>
      </div>
      <div className="toolbar-group">
        <button className="ex-btn" onClick={onDownload}
          title={`Download as ${(saveName.trim() || "lambda") + ".txt"}`}>download</button>
        <button className="ex-btn" onClick={onExport}
          disabled={savedSlots.length === 0}
          title="Export all named buffers to a zip file">export</button>
        <button className="ex-btn" onClick={() => importInputRef.current?.click()}
          title="Import buffers from a zip file">import</button>
        <input ref={importInputRef} type="file" accept=".zip" style={{ display: "none" }} onChange={onImportPick} />
      </div>
    </div>
  );
}

function ContentToolbar({ onLoadExample, symPickerRef, symOpen, onToggleSymOpen, onInsertSym }: {
  onLoadExample: (src: string) => void;
  symPickerRef: React.RefObject<HTMLDivElement | null>; symOpen: boolean; onToggleSymOpen: () => void;
  onInsertSym: (sym: string) => void;
}) {
  return (
    <div className="toolbar">
      {DOCS.length > 0 && <><div className="toolbar-group">
        <span className="row-label">docs</span>
        <div className="select-wrap">
          <select className="tool-select" value="" onChange={e => { const d = DOCS.find(x => x.label === e.target.value); if (d) onLoadExample(d.src.trimStart()); }}>
            <option value="" disabled>— pick —</option>
            {DOCS.map(d => <option key={d.label} value={d.label}>{d.label}</option>)}
          </select>
        </div>
      </div><span className="toolbar-sep" /></>}
      {TUTORIALS.length > 0 && <><div className="toolbar-group">
        <span className="row-label">tutorials</span>
        <div className="select-wrap">
          <select className="tool-select" value="" onChange={e => { const t = TUTORIALS.find(x => x.label === e.target.value); if (t) onLoadExample(t.src.trimStart()); }}>
            <option value="" disabled>— pick —</option>
            {TUTORIALS.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
          </select>
        </div>
      </div><span className="toolbar-sep" /></>}
      <div className="toolbar-group">
        <span className="row-label">examples</span>
        <div className="select-wrap">
          <select className="tool-select" value="" onChange={e => { const ex = EXAMPLES.find(x => x.label === e.target.value); if (ex) onLoadExample(ex.src.trimStart()); }}>
            <option value="" disabled>— pick —</option>
            {EXAMPLES.map(ex => <option key={ex.label} value={ex.label}>{ex.label}</option>)}
          </select>
        </div>
      </div>
      <span className="toolbar-sep" />
      <div className="toolbar-group">
        <span className="row-label">sym</span>
        <div className="sym-picker" ref={symPickerRef}>
          <button className="tool-select slot-picker-btn" onClick={onToggleSymOpen} title="Insert symbol (or type \name then Space)">Ω ▾</button>
          {symOpen && (
            <div className="sym-picker-menu">
              <div className="sym-section-label">logic</div>
              <div className="sym-row">
                {LOGIC_SYMBOLS.map(g => (
                  <button key={g.name} className={`sym-item${g.reserved ? " sym-item-reserved" : ""}`}
                    title={g.reserved ? `\\${g.name} (reserved)` : g.shortcut ? `\\${g.name}  (${g.shortcut})` : `\\${g.name}`}
                    onClick={() => { onInsertSym(g.sym); onToggleSymOpen(); }}>{g.sym}</button>
                ))}
              </div>
              <div className="sym-section-label">lowercase</div>
              <div className="sym-row">
                {GREEK_SYMBOLS.filter(g => g.sym === g.sym.toLowerCase()).map(g => (
                  <button key={g.name} className={`sym-item${g.reserved ? " sym-item-reserved" : ""}`}
                    title={g.reserved ? `\\${g.name} (reserved)` : g.shortcut ? `\\${g.name}  (${g.shortcut})` : `\\${g.name}`}
                    onClick={() => { onInsertSym(g.sym); onToggleSymOpen(); }}>{g.sym}</button>
                ))}
              </div>
              <div className="sym-section-label">uppercase</div>
              <div className="sym-row">
                {GREEK_SYMBOLS.filter(g => g.sym !== g.sym.toLowerCase()).map(g => (
                  <button key={g.name} className={`sym-item${g.reserved ? " sym-item-reserved" : ""}`}
                    title={g.reserved ? `\\${g.name} (reserved)` : g.shortcut ? `\\${g.name}  (${g.shortcut})` : `\\${g.name}`}
                    onClick={() => { onInsertSym(g.sym); onToggleSymOpen(); }}>{g.sym}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IssuesPanel({ errors, roundTripError, source, onJumpTo }: {
  errors: LambdaError[]; roundTripError: string | null;
  source: string; onJumpTo: (offset: number) => void;
}) {
  const count = errors.length + (roundTripError ? 1 : 0);
  if (count === 0) return null;
  return (
    <section className="panel issues-panel">
      <div className="issues-header">
        <span className="panel-label">issues ({count})</span>
      </div>
      <ul className="issues-list">
        {errors.map((e, i) => (
          <li key={i}
            className={[e.kind === "warning" ? "issue-warning" : "", e.offset !== undefined ? "issue-link" : ""].join(" ").trim()}
            onClick={() => e.offset !== undefined && onJumpTo(e.offset)}
          >{formatError(e, source)}</li>
        ))}
        {roundTripError && <li>{roundTripError}</li>}
      </ul>
    </section>
  );
}

function EvalPanel({ open, onToggle, currentTerm, hasExpr, canStep, canEtaStep, onRun, onReset, onStep, onEtaStep, onContinue, showSubst, onSetShowSubst, history, maxStepsRun }: {
  open: boolean; onToggle: () => void;
  currentTerm: Term | null | undefined; hasExpr: boolean;
  canStep: boolean; canEtaStep: boolean;
  onRun: () => void; onReset: () => void; onStep: () => void; onEtaStep: () => void; onContinue: () => void;
  showSubst: boolean; onSetShowSubst: (v: boolean) => void;
  history: HistoryEntry[]; maxStepsRun: number;
}) {
  return (
    <Panel label="eval" open={open} onToggle={onToggle}>
      <div className="output">
        {currentTerm
          ? <pre>{prettyPrint(currentTerm)}</pre>
          : <span className="placeholder">parse result will appear here</span>}
      </div>
      <div className="eval-controls">
        <button className="load-btn" onClick={onRun}      disabled={!hasExpr}   title="Load and beta-reduce to normal form (F5)">run <kbd>F5</kbd></button>
        <button className="load-btn" onClick={onReset}    disabled={!hasExpr}   title="Reset to step 0 (F6)">reset <kbd>F6</kbd></button>
        <button               onClick={onStep}     disabled={!canStep}   title="Perform one beta-reduction step (F10)">β-step <kbd>F10</kbd></button>
        <button               onClick={onEtaStep}  disabled={!canEtaStep} title="Perform one eta-reduction step: λx. f x → f (F11)">η-step <kbd>F11</kbd></button>
        <button               onClick={onContinue} disabled={!canStep}   title={`Continue beta-reducing up to ${maxStepsRun} steps (F9)`}>continue <kbd>F9</kbd></button>
        <label className="subst-toggle" title="Show substitution as an intermediate step before beta-reducing">
          <input type="checkbox" checked={showSubst} onChange={e => onSetShowSubst(e.target.checked)} />
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
  );
}

function PrintPanel({ open, onToggle, printDesc, onTogglePrintDesc, programResult, showPassingEquiv, onJumpTo }: {
  open: boolean; onToggle: () => void;
  printDesc: boolean; onTogglePrintDesc: () => void;
  programResult: ProgramResult; showPassingEquiv: boolean;
  onJumpTo: (offset: number) => void;
}) {
  const hasContent = programResult.printInfos.length > 0 || programResult.equivInfos.length > 0
    || programResult.printComprehensionInfos.length > 0 || programResult.equivComprehensionInfos.length > 0;
  type PrintItem     = { kind: "print";      data: typeof programResult.printInfos[number] };
  type EquivItem     = { kind: "equiv";      data: EquivInfo; passed: boolean; opSym: string };
  type PrintCompItem = { kind: "print-comp"; data: PrintComprehensionInfo };
  type EquivCompItem = { kind: "equiv-comp"; data: EquivComprehensionInfo };
  const items: (PrintItem | EquivItem | PrintCompItem | EquivCompItem)[] = !hasContent ? [] : [
    ...programResult.printInfos.map(d => ({ kind: "print" as const, data: d })),
    ...programResult.equivInfos.map(d => ({ kind: "equiv" as const, data: d, passed: d.negated ? !d.equivalent : d.equivalent, opSym: d.negated ? "≢" : "≡" })).filter(d => showPassingEquiv || !d.passed),
    ...programResult.printComprehensionInfos.map(d => ({ kind: "print-comp" as const, data: d })),
    ...programResult.equivComprehensionInfos.filter(d => showPassingEquiv || !d.allPassed).map(d => ({ kind: "equiv-comp" as const, data: d })),
  ].sort((a, b) => printDesc ? b.data.offset - a.data.offset : a.data.offset - b.data.offset);

  return (
    <Panel label="output" open={open} onToggle={onToggle}
      headerExtra={<button className="panel-sort-btn" onClick={onTogglePrintDesc} title="Toggle sort order">sort {printDesc ? "↑" : "↓"}</button>}>
      {hasContent ? (
        <div className="print-section">
          {items.map((item, i) => item.kind === "print" ? (
            <div key={i} className="print-entry" onClick={() => onJumpTo(item.data.offset)} title="Go to source">
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
            <div key={i} className="print-entry equiv-entry" onClick={() => onJumpTo(item.data.offset)} title="Go to source">
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
            <div key={i} className="print-entry print-comp-entry" onClick={() => onJumpTo(item.data.offset)} title="Go to source">
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
            <div key={i} className="print-entry equiv-comp-entry" onClick={() => onJumpTo(item.data.offset)} title="Go to source">
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
      ) : (
        <span className="placeholder">no π or ≡ statements in current program</span>
      )}
    </Panel>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const editorViewRef   = useRef<EditorView | null>(null);
  const editorExtRef    = useRef<import("@codemirror/state").Extension[]>([]);
  const linkHandlerRef  = useRef<LinkHandler | null>(null);
  const slotPickerRef   = useRef<HTMLDivElement | null>(null);
  const symPickerRef    = useRef<HTMLDivElement | null>(null);
  const [showHelp, setShowHelp]         = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const anyModalOpenRef = useRef(false);
  const [source, setSource]           = useState(() => {
    const p = new URLSearchParams(window.location.search).get("s");
    if (p) try { return LZString.decompressFromEncodedURIComponent(p) ?? undefined; } catch {}
    return localStorage.getItem(KEY_SOURCE) ?? DEFAULT_SCRATCH;
  });
  // Debounced copy of source — drives parsing so it doesn't run on every keystroke.
  const [debouncedSource, setDebouncedSource] = useState(source);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSource(source), PARSE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [source]);
  const [loaded, setLoaded]           = useState<Loaded>(null);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [normDefs, setNormDefs]       = useState<Map<string, string>>(new Map());
  const [history, setHistory]         = useState<HistoryEntry[]>([]);
  const [cursorPos, setCursorPos]     = useState<{ line: number; col: number } | null>(null);
  const [canUndo, setCanUndo]         = useState(false);
  const [canRedo, setCanRedo]         = useState(false);
  const [kinoLayout, setKinoLayout]   = useState(() => localStorage.getItem(KEY_KINO) === "1");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const kinoActive = kinoLayout || isFullscreen;
  const [kinoSplitPct, setKinoSplitPct] = useState(() => Number(localStorage.getItem(KEY_KINO_SPLIT)) || 40);
  const mainRef = useRef<HTMLElement>(null);
  const [showSubst, setShowSubst]     = useState(false);
  const [saveName, setSaveName]       = useState("");
  const [savedSlots, setSavedSlots]   = useState<string[]>(getSavedSlots);
  const [loadedSlotName, setLoadedSlotName] = useState<string | null>(null);
  const loadedSlotRef = useRef<string | null>(null);
  const isDirty = loadedSlotName !== null &&
    source !== (localStorage.getItem(SAVE_PREFIX + loadedSlotName) ?? "");
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const showHelpRef = useRef(false);
  showHelpRef.current = showHelp;
  const showSettingsRef = useRef(false);
  showSettingsRef.current = showSettings;
  anyModalOpenRef.current = showHelp || showSettings;
  const [slotOpen, setSlotOpen]       = useState(false);
  const [symOpen, setSymOpen]         = useState(false);
  const [showCopied, setShowCopied]   = useState(false);
  const [copiedKey,  setCopiedKey]    = useState(0);
  const [config, setConfig]         = useState<Config>(loadConfig);
  const [stepsOpen, setStepsOpen]   = useState(() => localStorage.getItem(KEY_PANEL_STEPS) !== "0");
  const [printOpen, setPrintOpen]   = useState(() => localStorage.getItem(KEY_PANEL_PRINT) !== "0");
  const [printDesc, setPrintDesc]   = useState(() => localStorage.getItem(KEY_PRINT_DESC) === "1");
  const updateConfig = useCallback((patch: Partial<Config>) => {
    setConfig(c => { const next = { ...c, ...patch }; saveConfig(next); return next; });
  }, []);

  const toggleSteps = useCallback(() => setStepsOpen(o => { const n = !o; localStorage.setItem(KEY_PANEL_STEPS, n ? "1" : "0"); return n; }), []);
  const togglePrint = useCallback(() => setPrintOpen(o => { const n = !o; localStorage.setItem(KEY_PANEL_PRINT, n ? "1" : "0"); return n; }), []);

  const autoSaveRef = useRef(config.autoSave);
  autoSaveRef.current = config.autoSave;
  const showDirty = isDirty;

  // Auto-save with its own longer debounce — triggers re-render so dirty indicator clears
  const [saveGen, setSaveGen] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => {
      if (loadedSlotRef.current === null)
        localStorage.setItem(KEY_SOURCE, source);
      else if (autoSaveRef.current)
        localStorage.setItem(SAVE_PREFIX + loadedSlotRef.current, source);
      setSaveGen(g => g + 1);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [source]);

  const includeResolver = useCallback((path: string): string | null => resolveContent(path), []);

  const programResult = useMemo(() => parseProgram(debouncedSource, config, includeResolver), [debouncedSource, config, includeResolver]);
  const programResultRef = useRef(programResult);
  programResultRef.current = programResult;

  // Push parse result into the CodeMirror StateField for syntax highlighting
  useEffect(() => {
    editorViewRef.current?.dispatch({ effects: setParsed.of(programResult) });
  }, [programResult]);

  // Warn before page unload when a named buffer has unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Reconfigure wrap width (ruler + Ctrl-R keymap) when it changes
  useEffect(() => {
    editorViewRef.current?.dispatch({ effects: wrapCompartment.reconfigure(makeWrapExtensions(config.wrapWidth)) });
  }, [config.wrapWidth]);

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
    if (!programResult.expr) return;
    const term = programResult.expr;
    const d = new Map([...programResult.defs].filter(([, e]) => !e.quiet).map(([k, e]) => [k, e.term] as const));
    const effectiveConfig = mergeConfig(programResult.pragmaConfig);
    const nd = buildNormDefs(d, { maxSteps: effectiveConfig.maxStepsIdent, maxSize: effectiveConfig.maxSize });
    setNormDefs(nd);
    const done = step(term) === null;
    setLoaded({ term, done, stepNum: 0, effectiveConfig });
    setLoadedSource(source);
    setHistory([{ label: "0:", text: prettyPrint(term), match: findMatch(term, nd), status: done ? "normalForm" : undefined }]);
  }, [programResult, source, mergeConfig]);

  // Auto-reload when source changes or showSubst toggles
  useEffect(() => {
    if (!programResult.expr) { setLoaded(null); setHistory([]); return; }
    handleLoad();
  }, [handleLoad, showSubst]); // handleLoad changes when programResult/source changes

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
    setLoaded({ term: current, done, sizeLimited: sizeLimitHit || undefined, stepNum, effectiveConfig: loaded.effectiveConfig });
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
    view.dispatch({ effects: [EditorView.scrollIntoView(0), setParsed.of(programResultRef.current)] });
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
    const scratch = localStorage.getItem(KEY_SOURCE) ?? "";
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
      const scratch = localStorage.getItem(KEY_SOURCE) ?? "";
      loadedSlotRef.current = null;
      setLoadedSlotName(null);
      setSource(scratch);
      resetEditorContent(scratch);
    }
  }, [saveName, resetEditorContent]);

  const loadExample = useCallback((exSrc: string) => {
    const view = editorViewRef.current;
    // Switch to scratch buffer
    loadedSlotRef.current = null;
    setLoadedSlotName(null);
    setSaveName("");
    // Push new content onto the existing undo stack so Ctrl-Z navigates back through link history.
    // Skip if content is already identical (avoids a no-op history entry).
    if (view && view.state.doc.toString() !== exSrc) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: exSrc },
                      effects: EditorView.scrollIntoView(0) });
    }
    const newSrc = exSrc;
    setSource(newSrc);
    localStorage.setItem(KEY_SOURCE, newSrc);
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
        const src = resolveContent(path);
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

  const [importItems, setImportItems] = useState<{ name: string; content: string; conflict: boolean; loaded: boolean; checked: boolean }[]>([]);
  const [showImport, setShowImport]   = useState(false);
  const showImportRef   = useRef(false);
  showImportRef.current = showImport;
  anyModalOpenRef.current = anyModalOpenRef.current || showImport;
  const importInputRef   = useRef<HTMLInputElement>(null);
  const importModalRef   = useRef<HTMLDivElement>(null);
  useFocusTrap(importModalRef, showImport);
  const saveNameInputRef = useRef<HTMLInputElement>(null);
  const saveBtnRef       = useRef<HTMLButtonElement>(null);

  const handleImportPick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const zip = await JSZip.loadAsync(file);
      const items: typeof importItems = [];
      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir || !path.endsWith(".txt")) continue;
        const content = await entry.async("string");
        const name = path.slice(0, -4);  // "foo/bar.txt" → "foo/bar"
        const conflict = savedSlots.includes(name);
        const loaded   = name === loadedSlotName;
        items.push({ name, content, conflict, loaded, checked: !conflict && !loaded });
      }
      if (items.length === 0) { alert("No .txt files found in zip."); return; }
      items.sort((a, b) => a.name.localeCompare(b.name));
      setImportItems(items);
      setShowImport(true);
    } catch { alert("Could not read zip file."); }
  }, [savedSlots, loadedSlotName]);

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
    if (!loaded || loaded.sizeLimited) return;
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
    if (!programResult.expr) return;
    const term = programResult.expr;
    const d = new Map([...programResult.defs].filter(([, e]) => !e.quiet).map(([k, e]) => [k, e.term] as const));
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
    setLoaded({ term: current, done, sizeLimited: sizeLimitHit || undefined, stepNum, effectiveConfig });
    setHistory(entries.slice(-effectiveConfig.maxHistory).reverse());
  }, [programResult, source, showSubst, mergeConfig]);

  const editorExtensions = useMemo(() => {
    const exts = [
      cmHistory(),
      lineNumbers({ formatNumber: n => String(n).padStart(4, "\u00a0") }),
      lambdaTheme, lambdaKeymap, lambdaCompleteKeymap, parsedField, lambdaHighlight, lambdaDiagnosticTooltip, lambdaComplete, autocompleteWheelPlugin,
      lambdaLinks(linkHandlerRef),
      wrapCompartment.of(makeWrapExtensions(loadConfig().wrapWidth ?? DEFAULT_CONFIG.wrapWidth)),
    ];
    editorExtRef.current = exts;
    return exts;
  }, []);

  const toggleTheater   = useCallback(() => setKinoLayout(v => { const next = !v; localStorage.setItem(KEY_KINO, next ? "1" : "0"); return next; }), []);
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement)
      document.documentElement.requestFullscreen().catch(() => {});
    else
      document.exitFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showImportRef.current)  { setShowImport(false);   return; }
        if (showHelpRef.current)    { setShowHelp(false);     return; }
        if (showSettingsRef.current){ setShowSettings(false); return; }
        if (e.defaultPrevented) return; // CM6 handled it (e.g. closed autocomplete/search)
        if (!anyModalOpenRef.current) {
          const view = editorViewRef.current;
          if (view?.hasFocus) {
            view.contentDOM.blur();
            if (isDirtyRef.current && saveBtnRef.current) saveBtnRef.current.focus();
            else saveNameInputRef.current?.focus();
          }
          else view?.focus();
          return;
        }
        return;
      }
      if (e.key === "r" && e.ctrlKey) e.preventDefault(); // prevent browser reload; CM handles rewrap when editor focused
      if (e.key === "s" && e.ctrlKey) { e.preventDefault(); handleSaveOverwrite(); }
      if (e.key === "F5")  { e.preventDefault(); handleLoadRun(); }
      if (e.key === "F6")  { e.preventDefault(); handleLoad(); }
      if (e.key === "F9")  { e.preventDefault(); handleRun(); }
      if (e.key === "F10") { e.preventDefault(); handleStep(); }
      if (e.key === "F11") { e.preventDefault(); handleEtaStep(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleLoad, handleStep, handleRun, handleLoadRun, handleSaveOverwrite, toggleFullscreen]);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMouseMove = (ev: MouseEvent) => {
      if (!mainRef.current) return;
      const rect = mainRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(20, Math.min(75, pct));
      localStorage.setItem(KEY_KINO_SPLIT, String(clamped));
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
  const canEtaStep = loaded !== null && !loaded.sizeLimited && source === loadedSource && etaStep(loaded.term) !== null;
  const currentTerm = programResult.expr;



  return (
    <div className={kinoActive ? "app kino" : "app"}>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showImport && (
        <div className="modal-backdrop" onClick={() => setShowImport(false)}>
          <div className="modal import-modal" ref={importModalRef} onClick={e => e.stopPropagation()}>
            <h2>IMPORT BUFFERS</h2>
            <div className="import-actions">
              <button className="ex-btn" onClick={() => setImportItems(items => items.map(i => ({ ...i, checked: i.loaded ? false : true })))}>check all</button>
              <button className="ex-btn" onClick={() => setImportItems(items => items.map(i => ({ ...i, checked: false })))}>uncheck all</button>
            </div>
            <ul className="import-list">
              {importItems.map((item, i) => (
                <li key={item.name}>
                  <label style={item.loaded ? { cursor: "default", opacity: 0.6 } : undefined}>
                    <input type="checkbox" checked={item.checked} disabled={item.loaded}
                      onChange={e => setImportItems(items => items.map((it, j) => j === i ? { ...it, checked: e.target.checked } : it))} />
                    {" "}{item.name}
                    {item.loaded   ? <span className="import-loaded-tag"> (currently loaded — cannot import)</span> :
                     item.conflict ? <span className="import-conflict-tag"> (exists — overwrite?)</span> : ""}
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
          onApply={c => {
            if (c.autoSave && !config.autoSave && loadedSlotName && isDirty)
              localStorage.setItem(SAVE_PREFIX + loadedSlotName, source);
            updateConfig(c);
            setShowSettings(false);
          }}
          onCancel={() => setShowSettings(false)}
        />
      )}

      <header>
        <h1>λ playground</h1>
        <p className="subtitle">an interactive lambda calculus environment</p>
      </header>

      <main ref={mainRef} style={kinoActive ? { gridTemplateColumns: `${kinoSplitPct}% 6px 1fr` } : undefined}>
        <section className="editor-section">
          <EditorHeaderBar
            cursorPos={cursorPos} canUndo={canUndo} canRedo={canRedo}
            onUndo={() => editorViewRef.current && undo(editorViewRef.current)}
            onRedo={() => editorViewRef.current && redo(editorViewRef.current)}
            onFind={() => editorViewRef.current && openSearchPanel(editorViewRef.current)}
            showCopied={showCopied} copiedKey={copiedKey} onShare={handleShare}
            onSettings={() => setShowSettings(true)} onHelp={() => setShowHelp(true)}
            kinoLayout={kinoLayout} isFullscreen={isFullscreen}
            onToggleTheater={toggleTheater} onToggleFullscreen={toggleFullscreen}
          />
          <LambdaEditor
            source={source} extensions={editorExtensions}
            onChange={setSource}
            onCreateEditor={view => { editorViewRef.current = view; view.dispatch({ effects: setParsed.of(programResult) }); view.focus(); }}
            onUpdate={update => {
              if (update.selectionSet) {
                const pos = update.state.selection.main.head;
                const line = update.state.doc.lineAt(pos);
                setCursorPos({ line: line.number, col: pos - line.from + 1 });
              }
              setCanUndo(undoDepth(update.state) > 0);
              setCanRedo(redoDepth(update.state) > 0);
            }}
          />
          <BuffersToolbar
            loadedSlotName={loadedSlotName} showDirty={showDirty} programResult={programResult}
            autoSave={config.autoSave} saveBtnRef={saveBtnRef} saveNameInputRef={saveNameInputRef}
            onSaveOverwrite={handleSaveOverwrite} saveName={saveName}
            onSaveNameChange={setSaveName} onSaveNameKeyDown={e => { if (e.key === "Enter") handleSaveSlot(); }}
            slotPickerRef={slotPickerRef} slotOpen={slotOpen} onToggleSlotOpen={() => setSlotOpen(o => !o)}
            savedSlots={savedSlots} onSwitchToScratch={() => { switchToScratch(); setSlotOpen(false); }}
            onSwitchToSlot={name => { switchToSlot(name); setSlotOpen(false); }}
            onSaveSlotAs={handleSaveSlot} onNewBuffer={handleNewBuffer} onDeleteSlot={handleDeleteSlot}
            onDownload={handleDownload} onExport={handleExport}
            importInputRef={importInputRef} onImportPick={handleImportPick}
          />
          <ContentToolbar
            onLoadExample={loadExample}
            symPickerRef={symPickerRef} symOpen={symOpen} onToggleSymOpen={() => setSymOpen(o => !o)}
            onInsertSym={handleInsertSym}
          />
          {!kinoActive && <IssuesPanel errors={programResult.errors} roundTripError={roundTripError} source={source} onJumpTo={jumpTo} />}
        </section>

        {kinoActive && <div className="kino-divider" onMouseDown={handleDividerMouseDown} />}

        <div className="panels-right">
          {kinoActive && <IssuesPanel errors={programResult.errors} roundTripError={roundTripError} source={source} onJumpTo={jumpTo} />}
          <EvalPanel
            open={stepsOpen} onToggle={toggleSteps}
            currentTerm={currentTerm} hasExpr={!!programResult.expr}
            canStep={canStep} canEtaStep={canEtaStep}
            onRun={handleLoadRun} onReset={handleLoad} onStep={handleStep} onEtaStep={handleEtaStep} onContinue={handleRun}
            showSubst={showSubst} onSetShowSubst={setShowSubst}
            history={history} maxStepsRun={loaded?.effectiveConfig.maxStepsRun ?? config.maxStepsRun}
          />
          <PrintPanel
            open={printOpen} onToggle={togglePrint}
            printDesc={printDesc} onTogglePrintDesc={() => setPrintDesc(d => { const n = !d; localStorage.setItem(KEY_PRINT_DESC, n ? "1" : "0"); return n; })}
            programResult={programResult} showPassingEquiv={config.showPassingEquiv}
            onJumpTo={jumpTo}
          />
        </div>
      </main>

      <footer />
    </div>
  );
}
