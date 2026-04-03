import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { ProposalList } from "@/components/proposals/proposal-list";

export default function ProposalsPage() {
  return (
    <AppShell
      title="Docs"
      subtitle="Draft, structure, and ship proposal documents with Gitwork as the single source of truth."
    >
      <Suspense fallback={<p className="text-sm text-[var(--text-3)]">Loading proposals...</p>}>
        <ProposalList />
      </Suspense>
    </AppShell>
  );
}
