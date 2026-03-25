import { useState } from "react";
import { Term } from "./parser/ast";

function AstNode({ term }: { term: Term }) {
  const [open, setOpen] = useState(true);

  switch (term.kind) {
    case "Var":
      return (
        <div className="ast-node">
          <div className="ast-row ast-leaf">
            <span className="ast-toggle">·</span>
            <span className="ast-label">Variable <span className="ast-name">{term.name}</span></span>
          </div>
        </div>
      );

    case "Abs":
      return (
        <div className="ast-node">
          <div className="ast-row" onClick={() => setOpen(o => !o)}>
            <span className="ast-toggle">{open ? "▼" : "▶"}</span>
            <span className="ast-label">Abstraction <span className="ast-name">{term.param}</span></span>
          </div>
          {open && (
            <div className="ast-children">
              <AstNode term={term.body} />
            </div>
          )}
        </div>
      );

    case "App":
      return (
        <div className="ast-node">
          <div className="ast-row" onClick={() => setOpen(o => !o)}>
            <span className="ast-toggle">{open ? "▼" : "▶"}</span>
            <span className="ast-label">Application</span>
          </div>
          {open && (
            <div className="ast-children">
              <AstNode term={term.func} />
              <AstNode term={term.arg} />
            </div>
          )}
        </div>
      );
  }
}

export function AstView({ term }: { term: Term }) {
  return (
    <div className="ast-view">
      <AstNode term={term} />
    </div>
  );
}
