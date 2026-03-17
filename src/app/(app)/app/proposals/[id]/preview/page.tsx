"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ProposalPreview } from "@/components/proposals/proposal-preview";
import { useProposal } from "@/hooks/use-proposals";

export default function ProposalPreviewPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { data, isPending, error } = useProposal(id);

  if (isPending) {
    return (
      <AppShell title="Proposal Preview" subtitle="Loading proposal preview.">
        <p className="text-sm text-[var(--text-3)]">Loading proposal...</p>
      </AppShell>
    );
  }

  if (error || !data?.proposal) {
    return (
      <AppShell title="Preview" subtitle="Proposal not found.">
        <p className="text-sm text-rose-700">{(error as Error)?.message ?? "Proposal not found."}</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Proposal Preview"
      subtitle="Client-facing proposal output preview with print-ready structure."
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/app/proposals/${id}`}
            className="inline-flex h-9 items-center rounded-md border border-[var(--border-1)] bg-white px-3 text-xs font-medium text-[var(--text-2)]"
          >
            Back to editor
          </Link>
          <Link
            href={`/app/proposals/${id}/print`}
            className="inline-flex h-9 items-center rounded-md bg-[var(--brand-600)] px-3 text-xs font-medium text-white"
          >
            Open print view
          </Link>
        </div>

        <ProposalPreview proposal={data.proposal} />
      </div>
    </AppShell>
  );
}
