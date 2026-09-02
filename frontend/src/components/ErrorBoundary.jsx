import { Component } from "react";

// Without a boundary, any throw inside the tree — including from inside
// ConnectKit — unmounts everything and leaves a white page with no clue as to
// what happened. This at least puts the error on screen.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-dvh items-center justify-center bg-beige p-8">
        <div className="w-full max-w-lg rounded-doc border border-state-disputed/40 bg-white p-6 shadow-card">
          <p className="font-mono text-2xs uppercase text-state-disputed">Application error</p>
          <h1 className="mt-2 text-[22px] font-medium tracking-display text-navy">
            Something broke while loading STERN.
          </h1>
          <p className="mt-1.5 font-serif text-sm leading-relaxed text-ink-dim">
            Reload the page. If it keeps happening, send this to the team.
          </p>
          <pre className="mt-4 max-h-64 overflow-auto rounded-panel bg-beige px-3.5 py-3 font-mono text-2xs leading-relaxed text-ink-dim">
            {String(this.state.error?.stack || this.state.error)}
          </pre>
        </div>
      </div>
    );
  }
}
