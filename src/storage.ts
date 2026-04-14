import { BUNDLED_CONTENT } from "./data/content";

// ── localStorage key constants ────────────────────────────────────────────────

export const SAVE_PREFIX     = "lambda-playground:saved:";
export const KEY_CONFIG      = "lambda-playground:config";
export const KEY_SOURCE      = "lambda-playground:source";
export const KEY_KINO        = "lambda-playground:kino";
export const KEY_KINO_SPLIT  = "lambda-playground:kino-split";
export const KEY_PANEL_STEPS = "lambda-playground:panel:steps";
export const KEY_PANEL_PRINT = "lambda-playground:panel:print";
export const KEY_PRINT_DESC  = "lambda-playground:print:desc";

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
  const bundled = BUNDLED_CONTENT[path] ?? null;
  if (bundled !== null) return bundled;
  // Localhost fallback: resolve e.g. "doc/Foo" from user buffer named "doc/Foo"
  if (window.location.hostname === "localhost")
    return localStorage.getItem(SAVE_PREFIX + path) ?? null;
  return null;
}

export function contentExists(path: string): boolean {
  return resolveContent(path) !== null;
}
