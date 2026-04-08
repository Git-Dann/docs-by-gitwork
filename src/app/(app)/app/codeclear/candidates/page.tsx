import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { CodeClearCandidatesWorkspace } from "@/components/codeclear/codeclear-candidates-workspace";

export const dynamic = "force-dynamic";

export default function CodeClearCandidatesPage() {
  return (
    <AppShell
      title="CodeClear"
      subtitle="Search, filter, review, and promote candidates through the Gitwork verification pipeline."
    >
      <Suspense>
        <CodeClearCandidatesWorkspace />
      </Suspense>
    </AppShell>
  );
}
