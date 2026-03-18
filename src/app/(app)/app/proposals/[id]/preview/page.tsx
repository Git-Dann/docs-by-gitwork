"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { buttonStyles } from "@/components/ui/button";
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
    <main className="min-h-screen bg-[#f6f8fc] px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-[1040px] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-1)]">Proposal preview</h1>
            <p className="mt-1 text-sm text-[var(--text-3)]">
              Client-facing output preview without the app chrome.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/preview/${id}`}
              target="_blank"
              rel="noreferrer"
              className={buttonStyles({ variant: "secondary", size: "md" })}
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              Open shared preview
            </Link>
          <Link
            href={`/app/proposals/${id}`}
            className={buttonStyles({ variant: "secondary", size: "md" })}
          >
            Back to editor
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
          frame={false}
          className="mx-auto max-w-[1040px]"
        />
      </div>
    </main>
  );
}
