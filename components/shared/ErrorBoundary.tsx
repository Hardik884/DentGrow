"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * ErrorBoundary
 *
 * React error boundary that prevents AI component errors from
 * propagating to the parent page.
 *
 * Wraps all AI components (InsightsPanel, CopilotChat, PatientSummaryCard,
 * PatientAssistant) and chart components.
 *
 * Per CLAUDE.md §13.11: AI errors must never block or error the surrounding page.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error) {
    // TODO: structured error logging (replace console.error with logger)
    // Per CLAUDE.md §13.1: no console.log in production paths
    void error;
  }

  override render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="border rounded-lg p-4 bg-surface-secondary text-sm text-text-secondary">
            This section is temporarily unavailable.
          </div>
        )
      );
    }

    return this.props.children;
  }
}
