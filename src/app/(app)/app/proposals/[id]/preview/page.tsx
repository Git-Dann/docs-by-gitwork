"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { buttonStyles } from "@/components/ui/button-styles";
import { ProposalPreview } from "@/components/proposals/proposal-preview";
import { useProposal } from "@/hooks/use-proposals";

export default function ProposalPreviewPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { data, isPending, error } = useProposal(id);

  if (isPending) {
    return <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">Loading proposal...</main>;
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
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-30 flex justify-center sm:inset-x-auto sm:right-8 sm:bottom-8">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-[10px] border border-[var(--border-2)] bg-white/92 p-2 shadow-[var(--shadow-lg)] backdrop-blur-md">
          <Link
            href={`/app/proposals/${id}`}
            className={buttonStyles({ variant: "secondary", size: "md" })}
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to editor
          </Link>
          <Link
            href={`/preview/${id}`}
            target="_blank"
            rel="noreferrer"
            className={buttonStyles({ variant: "secondary", size: "md" })}
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            Shared preview
          </Link>
          <Link
            href={`/app/proposals/${id}/print`}
            className={buttonStyles({ variant: "primary", size: "md" })}
          >
            Open print view
          </Link>
        </div>
      </div>

      <ProposalPreview
        proposal={data.proposal}
        showTableOfContents={false}
        frame
        className="mx-auto w-full max-w-[880px]"
      />
    </main>
  );
}
