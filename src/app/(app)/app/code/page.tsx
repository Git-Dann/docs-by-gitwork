import { AppShell } from "@/components/app-shell";
import { CodeClearOverview } from "@/components/codeclear/codeclear-overview";
import { DevSignalEntryBanner } from "@/components/codeclear/devsignal/devsignal-entry-banner";

/**
 * Canonical Code overview. The legacy /app/codeclear copy of this page rendered
 * <DevSignalEntryBanner /> and this one did not, so the banner was only visible on the
 * route the sidebar does not link to — the entry point to DevSignal was effectively
 * hidden on the canonical page. The subtitle here is also the one the sidebar
 * description matches.
 *
 * The remaining /app/codeclear/* subtrees (candidates, pipeline, devsignal) still live
 * only under that prefix and are a separate move — see the handover notes.
 */
export default function CodePage() {
  return (
    <AppShell
      title="Code"
      subtitle="Verification workflows, developer scoring, GitHub analysis, and pipeline health in one Gitwork workspace."
    >
      <DevSignalEntryBanner />
      <CodeClearOverview />
    </AppShell>
  );
}
