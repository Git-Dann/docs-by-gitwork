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
    <main className="min-h-screen bg-[var(--surface-canvas)] px-4 py-6 sm:px-8">
      <ProposalPreview
        proposal={data.proposal}
        showTableOfContents={false}
        frame
        className="mx-auto w-full max-w-[880px]"
      />
    </main>
  );
}
