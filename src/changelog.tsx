// Tiny markdown renderer for CHANGELOG.md. Supports:
//   ## heading        → h3
//   ### heading       → h4
//   - list item       → grouped <ul><li>
//   blank line        → paragraph break
//   `code`            → <code>
//   *italic*          → <em>
//   [text](url)       → external <a> (opens in new tab)
// Anything else is treated as a paragraph.

import { ReactNode } from "react";

export function renderChangelog(src: string): ReactNode[] {
  const lines = src.split("\n");
  const out: ReactNode[] = [];
  let listBuf: ReactNode[] | null = null;
  let paraBuf: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listBuf) { out.push(<ul key={key++}>{listBuf}</ul>); listBuf = null; }
  };
  const flushPara = () => {
    if (paraBuf.length) {
      out.push(<p key={key++}>{renderInline(paraBuf.join(" "))}</p>);
      paraBuf = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("# ")) {
      flushPara(); flushList();
      // Top-level "# Changelog" — already shown by the modal title; skip.
      continue;
    }
    if (line.startsWith("### ")) {
      flushPara(); flushList();
      out.push(<h4 key={key++}>{renderInline(line.slice(4))}</h4>);
      continue;
    }
    if (line.startsWith("## ")) {
      flushPara(); flushList();
      out.push(<h3 key={key++}>{renderInline(line.slice(3))}</h3>);
      continue;
    }
    if (line.startsWith("- ")) {
      flushPara();
      if (!listBuf) listBuf = [];
      listBuf.push(<li key={key++}>{renderInline(line.slice(2))}</li>);
      continue;
    }
    if (line === "") {
      flushPara(); flushList();
      continue;
    }
    paraBuf.push(line);
  }
  flushPara(); flushList();
  return out;
}

// Inline: handle `code`, [text](url), and *italic* spans. Order matters —
// backticks bind tightest, so split on them first; links are parsed before
// italics so a link's text isn't mistaken for italics.
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const ctr = { n: 0 };
  // Split on backticks; even indices are non-code, odd are code.
  const parts = text.split("`");
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) out.push(<code key={ctr.n++}>{parts[i]}</code>);
    else pushNonCode(parts[i], out, ctr);
  }
  return out;
}

function pushNonCode(text: string, out: ReactNode[], ctr: { n: number }): void {
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > last) pushItalics(text.slice(last, m.index), out, ctr);
    out.push(
      <a key={ctr.n++} href={m[2]} target="_blank" rel="noopener noreferrer">{m[1]}</a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) pushItalics(text.slice(last), out, ctr);
}

function pushItalics(text: string, out: ReactNode[], ctr: { n: number }): void {
  const segs = text.split(/\*([^*]+)\*/g);
  for (let j = 0; j < segs.length; j++) {
    if (segs[j] === "") continue;
    if (j % 2 === 1) out.push(<em key={ctr.n++}>{segs[j]}</em>);
    else out.push(<span key={ctr.n++}>{segs[j]}</span>);
  }
}
