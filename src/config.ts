// ── Shared Config type and defaults ──────────────────────────────────────────
// Imported by App.tsx and SettingsModal.tsx.

import type { TraceLevel } from "./trace";

export type Config = {
  maxStepsPrint:   number;
  maxStepsRun:     number;
  maxStepsIdent:   number;
  maxHistory:      number;
  maxHistorySize:  number;
  maxSize:         number;
  showPassingEquiv: boolean;
  wrapWidth:       number;
  autoSave:        boolean;
  autoRun:         boolean;
  traceLevel:      TraceLevel;
};

export const DEFAULT_CONFIG: Config = {
  maxStepsPrint:   10000,
  maxStepsRun:     1000,
  maxStepsIdent:   10000,
  maxHistory:      200,
  maxHistorySize:  200000,
  maxSize:         30000,
  showPassingEquiv: true,
  wrapWidth:       80,
  autoSave:        true,
  autoRun:         true,
  traceLevel:      "off",
};
