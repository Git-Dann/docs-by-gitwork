import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { CodeClearPipelineWorkspace } from "@/components/codeclear/codeclear-pipeline-workspace";
import { DevSignalEntryBanner } from "@/components/codeclear/devsignal/devsignal-entry-banner";

export const dynamic = "force-dynamic";

export default function CodeClearPipelinePage() {
  return (
    <AppShell
      title="Hiring"
      subtitle="Move developers through sourcing, assessment, verification, placement, and re-check stages."
    >
      {/* Hiring opens here now; its old Overview became Developers → Insights (Staff audit). */}
      <DevSignalEntryBanner />
      <Suspense>
        <CodeClearPipelineWorkspace />
      </Suspense>
    </AppShell>
  );
}
