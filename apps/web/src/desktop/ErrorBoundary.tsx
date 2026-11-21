import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorFallbackProps {
  error: Error;
  onReset: () => void;
}

/** Shown instead of a blank window when a page fails to render, so one bad
 * project or file never takes the whole app down. */
export function ErrorFallback({ error, onReset }: ErrorFallbackProps) {
  return (
    <div role="alert" data-testid="error-fallback" className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="text-xl font-bold text-ink-50">Something went wrong on this page</h1>
      <p className="mt-2 text-sm text-ink-400">
        Your projects are safe: nothing was changed. You can go back and carry on, or reload the app.
      </p>
      <p className="mt-4 break-words rounded-sm border border-ink-800 bg-ink-900 px-3 py-2 font-mono text-xs text-ink-400">
        {error.message}
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <a
          href="#/"
          onClick={onReset}
          className="rounded-sm bg-accent-500 px-4 py-2 text-sm font-medium text-chrome-950 hover:bg-accent-400"
        >
          Back to projects
        </a>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-sm border border-ink-700 px-4 py-2 text-sm text-ink-200 hover:border-ink-500"
        >
          Reload
        </button>
      </div>
    </div>
  );
}

interface ErrorBoundaryProps {
  /** When this changes (e.g. the route), a shown error is cleared. */
  resetKey: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  resetKey: string;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    // Navigating away clears the error, so the fallback never sticks to the next page.
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Desktop page failed to render:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error) return <ErrorFallback error={error} onReset={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}
