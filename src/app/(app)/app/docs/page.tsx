import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { ProposalList } from "@/components/proposals/proposal-list";

export default function DocsPage() {
  return (
    <AppShell
      title="Docs"
      subtitle="Your agency document library — proposals, SLAs, SOWs, MSAs, NDAs, change orders, and data sharing agreements."
    >
      <Suspense fallback={<p className="text-sm text-[var(--text-3)]">Loading documents…</p>}>
        <ProposalList />
      </Suspense>
    </AppShell>
  );
}
