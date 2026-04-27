// Lightweight performance tracing. Gated by user setting (off / summary /
// detail). summary entries → console.info (visible by default); detail
// entries → console.debug (DevTools "Verbose" only). Filter by "λp" in the
// console to isolate.

export type TraceLevel = "off" | "summary" | "detail";

const RANK: Record<TraceLevel, number> = { off: 0, summary: 1, detail: 2 };
let current: TraceLevel = "off";

export function setTraceLevel(level: TraceLevel): void { current = level; }
export function getTraceLevel(): TraceLevel { return current; }
export function isDetailEnabled(): boolean { return RANK[current] >= RANK.detail; }

const PREFIX = "[λp]";
const LABEL_WIDTH = 30;

function format(label: string, ms: number, indent: number, meta?: string): string {
  const indented = " ".repeat(indent) + label;
  const padded   = indented.padEnd(LABEL_WIDTH);
  const dur      = (ms.toFixed(1) + "ms").padStart(8);
  const tail     = meta ? "  " + meta : "";
  return `${PREFIX} ${padded}${dur}${tail}`;
}

export function traceSummary(label: string, ms: number, meta?: string): void {
  if (RANK[current] >= RANK.summary) console.info(format(label, ms, 0, meta));
}

export function traceDetail(label: string, ms: number, meta?: string): void {
  if (RANK[current] >= RANK.detail) console.debug(format(label, ms, 2, meta));
}
