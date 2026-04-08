import { AppShell } from "@/components/app-shell";
import { CodeClearOverview } from "@/components/codeclear/codeclear-overview";

export default function CodeClearOverviewPage() {
  return (
    <AppShell
      title="CodeClear"
      subtitle="Verification workflows, candidate scoring, GitHub analysis, and pipeline health in one Gitwork workspace."
    >
      <CodeClearOverview />
    </AppShell>
  );
}
