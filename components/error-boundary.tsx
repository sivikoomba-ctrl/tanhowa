"use client";

import { Component, useEffect, type ReactNode } from "react";

// Report error to the API
function reportError(message: string, stack?: string, path?: string) {
  try {
    fetch("/api/error-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        stack: stack || "",
        path: path || (typeof window !== "undefined" ? window.location.pathname : ""),
        metadata: {
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          timestamp: new Date().toISOString(),
        },
      }),
    }).catch(() => {});
  } catch {
    // Silently fail
  }
}

// Global error handlers (unhandled JS errors + promise rejections)
export function GlobalErrorCatcher({ children }: { children: ReactNode }) {
  useEffect(() => {
    function isChunkLoadError(msg: string) {
      return msg.includes("Loading chunk") || msg.includes("ChunkLoadError") || msg.includes("Loading CSS chunk");
    }

    function handleError(event: ErrorEvent) {
      const msg = event.message || "Unhandled error";
      if (isChunkLoadError(msg)) {
        // Auto-reload on stale deployment chunks (once per session)
        const key = "chunk-reload";
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          window.location.reload();
          return;
        }
      }
      reportError(msg, event.error?.stack, window.location.pathname);
    }

    function handleRejection(event: PromiseRejectionEvent) {
      const message =
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason || "Unhandled promise rejection");
      const stack = event.reason instanceof Error ? event.reason.stack : "";
      if (isChunkLoadError(message)) {
        const key = "chunk-reload";
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          window.location.reload();
          return;
        }
      }
      reportError(message, stack, window.location.pathname);
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return <>{children}</>;
}

// React error boundary for component-level errors
interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    reportError(
      error.message || "React component error",
      error.stack,
      typeof window !== "undefined" ? window.location.pathname : ""
    );
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center">
            <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mb-4">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
