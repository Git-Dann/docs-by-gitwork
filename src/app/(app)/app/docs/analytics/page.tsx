import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { AppShell } from "@/components/app-shell";
import { DocsAnalyticsDashboard } from "@/components/proposals/docs-analytics-dashboard";

export default function DocsAnalyticsPage() {
  return (
    <AppShell
      title="Docs Analytics"
      subtitle="How your shared documents are performing — opens, time-on-section, and acceptance across every proposal and contract."
    >
      <div className="mb-4">
        <Link
          href="/app/docs"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to library
        </Link>
      </div>
      <Suspense fallback={<p className="text-sm text-[var(--text-3)]">Loading analytics…</p>}>
        <DocsAnalyticsDashboard />
      </Suspense>
    </AppShell>
  );
}
