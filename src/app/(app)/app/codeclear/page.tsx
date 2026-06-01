import { AppShell } from "@/components/app-shell";
import { CodeClearOverview } from "@/components/codeclear/codeclear-overview";

export default function CodeClearOverviewPage() {
  return (
    <AppShell
      title="Code"
      subtitle="Verification workflows, developer scoring, GitHub analysis, and pipeline health in one Gitwork workspace."
    >
      <CodeClearOverview />
    </AppShell>
  );
}
