"use client";

import { useParams } from "next/navigation";
import { PrintToolbar } from "@/components/proposals/print-toolbar";
import { ProposalPreview } from "@/components/proposals/proposal-preview";
import { useProposal } from "@/hooks/use-proposals";

export default function ProposalPrintPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { data, isPending, error } = useProposal(id);

  if (isPending) {
    return <p className="p-8 text-sm text-[var(--text-3)]">Loading proposal...</p>;
  }

  if (error || !data?.proposal) {
    return <p className="p-8 text-sm text-rose-700">{(error as Error)?.message ?? "Proposal not found."}</p>;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-3 px-4 py-4 print:max-w-none print:px-0 print:py-0">
      <PrintToolbar proposalId={id} />
      <ProposalPreview proposal={data.proposal} showTableOfContents={false} frame={false} />
    </main>
  );
}
