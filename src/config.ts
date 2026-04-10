// ── Shared Config type and defaults ──────────────────────────────────────────
// Imported by App.tsx and SettingsModal.tsx.

export type Config = {
  maxStepsPrint:   number;
  maxStepsRun:     number;
  maxStepsIdent:   number;
  maxHistory:      number;
  maxSize:         number;
  showPassingEquiv: boolean;
  wrapWidth:       number;
  autoSave:        boolean;
};

export const DEFAULT_CONFIG: Config = {
  maxStepsPrint:   1000,
  maxStepsRun:     1000,
  maxStepsIdent:   1000,
  maxHistory:      200,
  maxSize:         10000,
  showPassingEquiv: false,
  wrapWidth:       80,
  autoSave:        false,
};
