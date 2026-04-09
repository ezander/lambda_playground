import { useState, useEffect } from "react";
import { Config } from "./config";

function parsePositiveInt(s: string, fallback: number): number {
  const v = parseInt(s, 10);
  return v > 0 ? v : fallback;
}

export function SettingsModal({ config, onApply, onCancel }: {
  config: Config;
  onApply: (c: Config) => void;
  onCancel: () => void;
}) {
  const [maxStepsPrint, setMaxStepsPrint] = useState(String(config.maxStepsPrint));
  const [maxStepsRun,   setMaxStepsRun]   = useState(String(config.maxStepsRun));
  const [maxStepsIdent, setMaxStepsIdent] = useState(String(config.maxStepsIdent));
  const [maxHistory,    setMaxHistory]    = useState(String(config.maxHistory));
  const [maxSize,           setMaxSize]           = useState(String(config.maxSize));
  const [showPassingEquiv,  setShowPassingEquiv]  = useState(config.showPassingEquiv);

  const apply = () => onApply({
    maxStepsPrint:    parsePositiveInt(maxStepsPrint, config.maxStepsPrint),
    maxStepsRun:      parsePositiveInt(maxStepsRun,   config.maxStepsRun),
    maxStepsIdent:    parsePositiveInt(maxStepsIdent, config.maxStepsIdent),
    maxHistory:       parsePositiveInt(maxHistory,    config.maxHistory),
    maxSize:          parsePositiveInt(maxSize,       config.maxSize),
    showPassingEquiv,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") apply();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [apply, onCancel]);

  return (
    <div className="modal-backdrop" onClick={apply}>
      <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
        <h2>settings</h2>
        <table className="settings-table">
          <tbody>
            <tr>
              <td>max steps (print)</td>
              <td>
                <input className="config-input" type="number" min={1} max={100000}
                  value={maxStepsPrint}
                  onChange={e => setMaxStepsPrint(e.target.value)} />
              </td>
              <td className="settings-hint">β steps for π statements</td>
            </tr>
            <tr>
              <td>max steps (run)</td>
              <td>
                <input className="config-input" type="number" min={1} max={100000}
                  value={maxStepsRun}
                  onChange={e => setMaxStepsRun(e.target.value)} />
              </td>
              <td className="settings-hint">β steps per run in eval panel</td>
            </tr>
            <tr>
              <td>max steps (ident)</td>
              <td>
                <input className="config-input" type="number" min={1} max={100000}
                  value={maxStepsIdent}
                  onChange={e => setMaxStepsIdent(e.target.value)} />
              </td>
              <td className="settings-hint">β steps for definition matching</td>
            </tr>
            <tr>
              <td>max history</td>
              <td>
                <input className="config-input" type="number" min={1} max={1000}
                  value={maxHistory}
                  onChange={e => setMaxHistory(e.target.value)} />
              </td>
              <td className="settings-hint">reduction steps stored (panel scrolls)</td>
            </tr>
            <tr>
              <td>max term size</td>
              <td>
                <input className="config-input" type="number" min={100} max={1000000}
                  value={maxSize}
                  onChange={e => setMaxSize(e.target.value)} />
              </td>
              <td className="settings-hint">AST nodes before reduction halts (prevents memory overflow)</td>
            </tr>
            <tr>
              <td>show passing ≡</td>
              <td>
                <input type="checkbox" checked={showPassingEquiv}
                  onChange={e => setShowPassingEquiv(e.target.checked)} />
              </td>
              <td className="settings-hint">show passing assertions in output (default: only failures)</td>
            </tr>
          </tbody>
        </table>
        <div className="settings-buttons">
          <button className="settings-ok"     onClick={apply}>ok</button>
          <button className="settings-cancel" onClick={onCancel}>cancel</button>
        </div>
      </div>
    </div>
  );
}
