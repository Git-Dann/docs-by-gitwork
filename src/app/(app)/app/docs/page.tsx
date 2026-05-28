import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { ProposalList } from "@/components/proposals/proposal-list";

export default function DocsPage() {
  return (
    <AppShell
      title="Docs"
      subtitle="Draft, structure, and ship proposals, SLAs, SOWs, and other client documents."
    >
      <Suspense fallback={<p className="text-sm text-[var(--text-3)]">Loading proposals...</p>}>
        <ProposalList />
      </Suspense>
    </AppShell>
  );
}
