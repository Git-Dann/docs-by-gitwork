"use client";

/**
 * Error boundary for the demo. The demo reuses the REAL app components fed by
 * mock data; when the app evolves (a component starts reading a new field the
 * canned data lacks) a reused component can throw. Without a boundary that
 * white-screens the whole page ("Application error…"). This contains the failure
 * to the affected surface and keeps the rest of the demo usable.
 */

import { Component, type ReactNode } from "react";

export class DemoErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <div className="mx-auto max-w-md rounded-[12px] border border-dashed border-[var(--border-2)] bg-[var(--surface-0)] px-6 py-10 text-center">
          <p
            className="text-[11px] uppercase tracking-[1.4px] text-[var(--text-4)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Demo · sample data
          </p>
          <p className="mt-2 text-sm text-[var(--text-2)]">
            This section is showing sample data and isn&apos;t interactive in the demo.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
