import { useState, useMemo, useRef, useEffect } from "react";
import { useFocusTrap } from "./useFocusTrap";
import { convert, DEFAULT_DIALECT, DialectConfig, Unindent } from "./dialect";

export type DialectImportResult = {
  text: string;
  destination: "newBuffer" | "insertAtCursor";
  bufferName: string;
};

export function DialectImportModal({ existingNames, onConfirm, onCancel }: {
  existingNames: string[];
  onConfirm: (r: DialectImportResult) => void;
  onCancel: () => void;
}) {
  const [source, setSource]         = useState("");
  const [filename, setFilename]     = useState("");
  const [cfg, setCfg]               = useState<DialectConfig>(DEFAULT_DIALECT);
  const [destination, setDestination] = useState<"newBuffer" | "insertAtCursor">("newBuffer");
  const [bufferName, setBufferName] = useState("imported");

  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  const converted = useMemo(() => convert(source, cfg).text, [source, cfg]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const text = await file.text();
    setSource(text);
    setFilename(file.name);
    const stem = file.name.replace(/\.[^.]+$/, "");
    if (stem) setBufferName(stem);
  };

  const conflict = destination === "newBuffer" && existingNames.includes(bufferName.trim());
  const canConfirm = source.length > 0 && (destination === "insertAtCursor" || bufferName.trim().length > 0);

  type Flag = { [K in keyof DialectConfig]: DialectConfig[K] extends boolean ? K : never }[keyof DialectConfig];

  const setFlag = (k: Flag, v: boolean) =>
    setCfg(c => ({ ...c, [k]: v }));

  const Check = ({ k, label, tip }: { k: Flag; label: string; tip?: string }) => (
    <label className="dialect-check" title={tip}>
      <input type="checkbox" checked={cfg[k]} onChange={e => setFlag(k, e.target.checked)} />
      {" "}{label}
    </label>
  );

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal dialect-modal" ref={modalRef} onClick={e => e.stopPropagation()}>
        <h2>IMPORT FROM DIALECT</h2>
        <p className="dialect-note">
          Best-effort lexical helper for common dialect tweaks (lambda token,
          comment style, definition operator). Constructs like <code>let</code>,
          <code> where</code>, type signatures, or do-notation are not handled —
          clean those up by hand after import.
        </p>

        <div className="dialect-section">
          <div className="dialect-section-header">
            <span className="dialect-section-label">source</span>
            <div className="dialect-section-header-right">
              {filename && <span className="dialect-filename">{filename}</span>}
              <label className="dialect-file-btn ex-btn">
                upload…
                <input type="file" accept=".txt,.lc,.hs,.lean,.lam,.lambda" style={{ display: "none" }} onChange={handleFile} />
              </label>
            </div>
          </div>
          <textarea className="dialect-source" placeholder="…or paste source here"
            value={source} onChange={e => setSource(e.target.value)} />
        </div>

        <div className="dialect-section">
          <span className="dialect-section-label">transforms</span>
          <div className="dialect-checks">
            <Check k="lambdaBackslash"   label="\\ → λ" />
            <Check k="commentDoubleDash" label="-- → #" />
            <Check k="lambdaWord"        label="lambda → λ" />
            <Check k="commentSlashSlash" label="// → #" />
            <Check k="lambdaL"           label="L → λ (in lambda heads)" />
            <Check k="blockSlashStar"    label="/* */ → #* *#" />
            <Check k="bodyArrow"         label="-> as body separator" />
            <Check k="blockBraceStar"    label="{* *} → #* *#" />
            <Check k="bodyColonEq"       label=":= as body separator" />
            <Check k="defEquals"         label="= as definition" />
            <Check k="splitAdjacent"     label="split λxλy. → λx. λy."
              tip="Insert . between chained lambdas." />
            <Check k="splitCurrying"     label="split λxyz. → λx y z."
              tip="Destructive for multi-char identifiers in lambda heads — only enable if the source uses single-letter convention." />
          </div>
          <div className="dialect-unindent-row">
            <span className="dialect-row-label">unindent:</span>
            {(["none", "leading", "full"] as Unindent[]).map(mode => (
              <label key={mode} className="dialect-check" title={
                mode === "none"    ? "Leave indentation alone." :
                mode === "leading" ? "Strip the common leading indent shared by all non-empty lines." :
                                     "Strip all leading whitespace from every line."
              }>
                <input type="radio" checked={cfg.unindent === mode}
                  onChange={() => setCfg(c => ({ ...c, unindent: mode }))} />
                {" "}{mode}
              </label>
            ))}
          </div>
        </div>

        <div className="dialect-section">
          <span className="dialect-section-label">preview</span>
          <textarea className="dialect-preview" readOnly value={converted}
            placeholder="(converted output will appear here)" />
        </div>

        <div className="dialect-section">
          <span className="dialect-section-label">destination</span>
          <label className="dialect-radio">
            <input type="radio" checked={destination === "newBuffer"}
              onChange={() => setDestination("newBuffer")} />
            {" "}new buffer:
            <input type="text" className="dialect-name-input"
              value={bufferName} onChange={e => setBufferName(e.target.value)}
              disabled={destination !== "newBuffer"} />
            {conflict && <span className="dialect-conflict"> (overwrites existing)</span>}
          </label>
          <label className="dialect-radio">
            <input type="radio" checked={destination === "insertAtCursor"}
              onChange={() => setDestination("insertAtCursor")} />
            {" "}insert at cursor in current buffer
          </label>
        </div>

        <div className="modal-buttons">
          <button className="ex-btn" disabled={!canConfirm}
            onClick={() => onConfirm({ text: converted, destination, bufferName: bufferName.trim() })}>
            convert
          </button>
          <button className="ex-btn" onClick={onCancel}>cancel</button>
        </div>
      </div>
    </div>
  );
}
