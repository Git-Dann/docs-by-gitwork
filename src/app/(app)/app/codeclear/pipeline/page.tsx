import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { CodeClearPipelineWorkspace } from "@/components/codeclear/codeclear-pipeline-workspace";

export const dynamic = "force-dynamic";

export default function CodeClearPipelinePage() {
  return (
    <AppShell
      title="Code"
      subtitle="Move developers through sourcing, assessment, verification, placement, and re-check stages."
    >
      <Suspense>
        <CodeClearPipelineWorkspace />
      </Suspense>
    </AppShell>
  );
}
