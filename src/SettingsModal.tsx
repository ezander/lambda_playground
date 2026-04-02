import { useState, useEffect } from "react";

type Config = { maxSteps: number; maxHistory: number };

export function SettingsModal({ config, onApply, onCancel }: {
  config: Config;
  onApply: (c: Config) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Config>(config);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onApply(draft);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [draft, onApply, onCancel]);

  return (
    <div className="modal-backdrop" onClick={() => onApply(draft)}>
      <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
        <h2>settings</h2>
        <table className="settings-table">
          <tbody>
            <tr>
              <td>max steps</td>
              <td>
                <input className="config-input" type="number" min={1} max={100000}
                  value={draft.maxSteps}
                  onChange={e => { const v = parseInt(e.target.value); if (v > 0) setDraft(d => ({ ...d, maxSteps: v })); }} />
              </td>
              <td className="settings-hint">beta reductions per run</td>
            </tr>
            <tr>
              <td>max history</td>
              <td>
                <input className="config-input" type="number" min={1} max={1000}
                  value={draft.maxHistory}
                  onChange={e => { const v = parseInt(e.target.value); if (v > 0) setDraft(d => ({ ...d, maxHistory: v })); }} />
              </td>
              <td className="settings-hint">reduction steps shown</td>
            </tr>
          </tbody>
        </table>
        <div className="settings-buttons">
          <button className="settings-ok"     onClick={() => onApply(draft)}>ok</button>
          <button className="settings-cancel" onClick={onCancel}>cancel</button>
        </div>
      </div>
    </div>
  );
}
