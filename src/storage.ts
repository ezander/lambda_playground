import { BUNDLED_CONTENT } from "./data/content";

// ── localStorage key constants ────────────────────────────────────────────────

export const SAVE_PREFIX = "lambda-playground:saved:";

// ── Saved slot helpers ────────────────────────────────────────────────────────

export function getSavedSlots(): string[] {
  const slots: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(SAVE_PREFIX)) slots.push(key.slice(SAVE_PREFIX.length));
  }
  return slots.sort();
}

export function getUserIncludePaths(): string[] {
  return getSavedSlots().map(name => "user/" + name);
}

// ── Content resolution ────────────────────────────────────────────────────────
// Single source of truth for resolving "type/name" paths to content.

export function resolveContent(path: string): string | null {
  if (path.startsWith("user/"))
    return localStorage.getItem(SAVE_PREFIX + path.slice("user/".length)) ?? null;
  return BUNDLED_CONTENT[path] ?? null;
}

export function contentExists(path: string): boolean {
  return resolveContent(path) !== null;
}
