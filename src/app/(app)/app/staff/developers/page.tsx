import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DevelopersViews } from "@/components/staff/developers-views";

export const dynamic = "force-dynamic";

export default function CodeClearCandidatesPage() {
  return (
    <AppShell
      title="Staff"
      subtitle="Search, filter, review, and promote developers through the Gitwork verification pipeline."
    >
      <Suspense>
        <DevelopersViews />
      </Suspense>
    </AppShell>
  );
}
