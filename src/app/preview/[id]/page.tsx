"use client";

import { useParams } from "next/navigation";
import { ProposalPreview } from "@/components/proposals/proposal-preview";
import { useProposal } from "@/hooks/use-proposals";

export default function PublicPreviewPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { data, isPending, error } = useProposal(id);

  if (isPending) {
    return <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">Loading preview...</main>;
  }

  if (error || !data?.proposal) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <p className="text-sm text-rose-700">{(error as Error)?.message ?? "Proposal not found."}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-4 rounded-lg border border-[var(--border-1)] bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">Shared proposal</p>
        <h1 className="text-base font-semibold">{data.proposal.title}</h1>
      </div>
      <ProposalPreview proposal={data.proposal} />
    </main>
  );
}
