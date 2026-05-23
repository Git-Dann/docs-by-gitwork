import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { ProposalList } from "@/components/proposals/proposal-list";

export default function DocsPage() {
  return (
    <AppShell
      title="WIP"
      subtitle="Work in progress — draft, structure, and ship documents for clients."
    >
      <Suspense fallback={<p className="text-sm text-[var(--text-3)]">Loading proposals...</p>}>
        <ProposalList />
      </Suspense>
    </AppShell>
  );
}
