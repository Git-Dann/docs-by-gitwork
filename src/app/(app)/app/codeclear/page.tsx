import { AppShell } from "@/components/app-shell";
import { CodeClearOverview } from "@/components/codeclear/codeclear-overview";
import { DevSignalEntryBanner } from "@/components/codeclear/devsignal/devsignal-entry-banner";

export default function CodeClearOverviewPage() {
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
