import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { ProposalList } from "@/components/proposals/proposal-list";

export default function ProposalsPage() {
  return (
    <AppShell
      title="Proposals"
      subtitle="Create, edit, duplicate, archive, and export proposal documents."
    >
      <Suspense fallback={<p className="text-sm text-[var(--text-3)]">Loading proposals...</p>}>
        <ProposalList />
      </Suspense>
    </AppShell>
  );
}
