import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { HandbookLibrary } from "@/components/handbook/handbook-library";

export default function HandbookPage() {
  return (
    <AppShell
      title="Handbook"
      subtitle="The canonical way Gitwork builds — standards, playbooks and process, searchable in one place."
    >
      <Suspense fallback={null}>
        <HandbookLibrary />
      </Suspense>
    </AppShell>
  );
}
