import { Component, ErrorInfo, ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "2rem", fontFamily: "monospace", color: "#f87171" }}>
          <h2 style={{ marginBottom: "1rem" }}>something went wrong</h2>
          <pre style={{ whiteSpace: "pre-wrap", marginBottom: "1.5rem", color: "#fca5a5", fontSize: "0.85rem" }}>
            {this.state.error.message}
          </pre>
          <button onClick={() => window.location.reload()}
            style={{ padding: "0.4rem 1rem", cursor: "pointer" }}>
            reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
