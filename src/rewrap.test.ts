import { describe, it, expect } from "vitest";
import { rewrapAt } from "./rewrap";

// Helper: place cursor on the first occurrence of `marker` in `text`
function cur(text: string, marker: string): number {
  const i = text.indexOf(marker);
  if (i < 0) throw new Error(`marker not found: ${marker}`);
  return i;
}

// Helper: apply a rewrapAt result to the text
function apply(text: string, pos: number, width: number): string {
  const r = rewrapAt(text, pos, width);
  if (!r) return text;
  return text.slice(0, r.from) + r.insert + text.slice(r.to);
}

describe("rewrapAt", () => {
  it("does nothing outside a block comment", () => {
    const text = "x := foo bar baz\n";
    expect(rewrapAt(text, cur(text, "foo"), 10)).toBeNull();
  });

  it("does nothing on a blank line inside a comment", () => {
    const text = "#*\n  hello world\n\n  other para\n*#\n";
    expect(rewrapAt(text, cur(text, "\n\n") + 1, 20)).toBeNull();
  });

  it("does nothing on the #* delimiter line", () => {
    const text = "#*\n  hello world\n*#\n";
    expect(rewrapAt(text, 1, 20)).toBeNull();
  });

  it("does nothing on the *# delimiter line", () => {
    const text = "#*\n  hello world\n*#\n";
    expect(rewrapAt(text, cur(text, "*#") + 1, 20)).toBeNull();
  });

  it("reflows a paragraph to the given width", () => {
    const text = "#*\n  one two three four five six seven eight\n*#\n";
    const result = apply(text, cur(text, "one"), 20);
    // Each line should be ≤ 20 chars
    const inner = result.split("\n").slice(1, -2); // skip #* and *#
    for (const line of inner) expect(line.length).toBeLessThanOrEqual(20);
    // All words preserved
    expect(result.replace(/\s+/g, " ")).toContain("one two three four five six seven eight");
  });

  it("preserves leading whitespace from the first paragraph line", () => {
    const text = "#*\n    indented word one two three four five\n*#\n";
    const result = apply(text, cur(text, "indented"), 30);
    const lines = result.split("\n").filter(l => l.trim() && l.trim() !== "#*" && l.trim() !== "*#");
    for (const line of lines) expect(line.startsWith("    ")).toBe(true);
  });

  it("only rewraps the paragraph containing the cursor, not the whole comment", () => {
    const text = "#*\n  para one long text here\n\n  para two stays untouched\n*#\n";
    const result = apply(text, cur(text, "para one"), 15);
    expect(result).toContain("para two stays untouched");
  });

  it("does not split [...] link groups across lines", () => {
    const text = "#*\n  click [doc/Some Long Name] to read more about it or visit [user/My Buffer]\n*#\n";
    const result = apply(text, cur(text, "click"), 40);
    // Both links must appear intact on a single line each
    expect(result).toMatch(/\[doc\/Some Long Name\]/);
    expect(result).toMatch(/\[user\/My Buffer\]/);
    // Neither link should be split by a newline
    expect(result).not.toMatch(/\[doc\/Some Long\s*\n/);
    expect(result).not.toMatch(/\[user\/My\s*\n/);
  });

  it("returns null when text is already correctly wrapped", () => {
    const text = "#*\n  short line\n*#\n";
    expect(rewrapAt(text, cur(text, "short"), 80)).toBeNull();
  });
});
