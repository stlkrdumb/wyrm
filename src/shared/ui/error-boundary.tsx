"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
    console.error("[ErrorBoundary] Caught error:", error.message, errorInfo.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <div className="flex items-center justify-center p-8 min-h-[100px]">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="text-[12px] font-mono font-bold tracking-widest uppercase text-rose-400">
              Component Error
            </span>
            <span className="text-[11px] font-mono text-zinc-500 max-w-[300px]">
              {this.state.error?.message || "An unexpected error occurred"}
            </span>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-3 py-1.5 text-[11px] font-mono font-bold tracking-widest uppercase bg-obsidian-lighter border border-obsidian-border rounded text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
