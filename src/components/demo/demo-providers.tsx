"use client";

/**
 * Full-screen demo wrapper — providers only, no app chrome. For demo pages that
 * must look EXACTLY like the real (non-AppShell) surface, e.g. the client wiki,
 * which in production renders `<WikiWorkspace>` directly with no app sidebar.
 *
 * Provides: the /api/* fetch interceptor (via demo-fetch side-effect), a mock
 * SessionProvider, the /app→/demo link reroute, a post-hydration mount gate, and
 * an error boundary. See DemoShell for the sidebar-chrome variant.
 */

import { useEffect, useState, type ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import "@/lib/demo/demo-fetch";
import { demoSession } from "@/lib/demo/dev-demo-data";
import { DemoErrorBoundary } from "@/components/demo/demo-error-boundary";
import { useDemoLinkReroute } from "@/lib/demo/use-demo-nav";
import { readDemoColor, brandCssVars } from "@/lib/demo/demo-config";

export function DemoProviders({ children }: { children: ReactNode }) {
  const handleDemoNav = useDemoLinkReroute();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [brandColor] = useState(() => readDemoColor());

  return (
    <SessionProvider session={demoSession as never}>
      <div
        onClickCapture={handleDemoNav}
        className="min-h-[100dvh] bg-[var(--surface-canvas)] text-[var(--text-1)]"
      >
        {brandColor ? (
          <style dangerouslySetInnerHTML={{ __html: `:root{${brandCssVars(brandColor)}}` }} />
        ) : null}
        {mounted ? (
          <DemoErrorBoundary>{children}</DemoErrorBoundary>
        ) : (
          <div className="p-8">
            <div className="h-[80vh] animate-pulse rounded-[10px] bg-[var(--surface-1)]" />
          </div>
        )}
      </div>
    </SessionProvider>
  );
}
