import { useState, useEffect } from "react";

type Config = { maxSteps: number; maxHistory: number };

function parsePositiveInt(s: string, fallback: number): number {
  const v = parseInt(s, 10);
  return v > 0 ? v : fallback;
}

export function SettingsModal({ config, onApply, onCancel }: {
  config: Config;
  onApply: (c: Config) => void;
  onCancel: () => void;
}) {
  const [maxSteps,   setMaxSteps]   = useState(String(config.maxSteps));
  const [maxHistory, setMaxHistory] = useState(String(config.maxHistory));

  const apply = () => onApply({
    maxSteps:   parsePositiveInt(maxSteps,   config.maxSteps),
    maxHistory: parsePositiveInt(maxHistory, config.maxHistory),
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
              <td>max steps</td>
              <td>
                <input className="config-input" type="number" min={1} max={100000}
                  value={maxSteps}
                  onChange={e => setMaxSteps(e.target.value)} />
              </td>
              <td className="settings-hint">beta reductions per run</td>
            </tr>
            <tr>
              <td>max history</td>
              <td>
                <input className="config-input" type="number" min={1} max={1000}
                  value={maxHistory}
                  onChange={e => setMaxHistory(e.target.value)} />
              </td>
              <td className="settings-hint">reduction steps shown</td>
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
