"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon, PlayIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { buttonStyles } from "@/components/ui/button-styles";
import { ProposalPreview } from "@/components/proposals/proposal-preview";
import { PresentationMode } from "@/components/proposals/presentation-mode";
import { useProposal } from "@/hooks/use-proposals";

type PreviewMode = "paged" | "flow" | "present";

function ModeTab({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition",
        active ? "bg-[var(--brand-600)] text-white" : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
      )}
    >
      {children}
    </Link>
  );
}

export default function ProposalPreviewPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data, isPending, error } = useProposal(id);

  // Default to "paged" — the internal review point for what print/client-sharing will actually
  // look like (real A4 pages), not the old endless-scroll "flow" view. `?mode=` overrides it.
  const rawMode = searchParams.get("mode");
  const mode: PreviewMode = rawMode === "flow" || rawMode === "present" ? rawMode : "paged";

  if (isPending) {
    return <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">Loading document...</main>;
  }

  if (error || !data?.proposal) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <p className="text-sm text-rose-700">{(error as Error)?.message ?? "Document not found."}</p>
      </main>
    );
  }

  if (mode === "present") {
    return (
      <PresentationMode proposal={data.proposal} onClose={() => router.push(`/app/docs/${id}/preview`)} />
    );
  }

  // Only surface the public client-facing link when the document is actually shared. The old
  // "Shared preview" button pointed at the deprecated /preview/[id] "link expired" page; the live
  // client view is the tokenised /docs/[token] route minted by the editor's Share control.
  const publicHref =
    data.proposal.isShared && data.proposal.shareToken ? `/docs/${data.proposal.shareToken}` : null;

  return (
    <main className="min-h-screen bg-white px-4 py-6 sm:px-8">
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-30 flex justify-center sm:inset-x-auto sm:right-8 sm:bottom-8">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-[10px] border border-[var(--border-2)] bg-white/92 p-2 shadow-[var(--shadow-lg)] backdrop-blur-md">
          <Link
            href={`/app/docs/${id}`}
            className={buttonStyles({ variant: "secondary", size: "md" })}
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to editor
          </Link>

          {/* Paged / Flow / Present — two views of the same document (per the "clean builder" +
              "not optimised for sharing" feedback: paged is the real A4 client-facing look, flow
              is the old endless-scroll builder view, present fills the viewport for screen-share). */}
          <div className="flex items-center gap-0.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5">
            <ModeTab active={mode === "paged"} href={`/app/docs/${id}/preview?mode=paged`}>
              Paged
            </ModeTab>
            <ModeTab active={mode === "flow"} href={`/app/docs/${id}/preview?mode=flow`}>
              Flow
            </ModeTab>
            <Link
              href={`/app/docs/${id}/preview?mode=present`}
              className="inline-flex items-center gap-1 rounded-[7px] px-3 py-1.5 text-[13px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
            >
              <PlayIcon className="h-3.5 w-3.5" />
              Present
            </Link>
          </div>

          {publicHref ? (
            <Link
              href={publicHref}
              target="_blank"
              rel="noreferrer"
              className={buttonStyles({ variant: "secondary", size: "md" })}
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              Open client link
            </Link>
          ) : null}
          <Link
            href={`/app/docs/${id}/print`}
            className={buttonStyles({ variant: "primary", size: "md" })}
          >
            Open print view
          </Link>
        </div>
      </div>

      <ProposalPreview
        proposal={data.proposal}
        showTableOfContents={false}
        frame={mode !== "paged"}
        pageMode={mode === "paged" ? "paged" : "flow"}
        className={mode === "paged" ? "mx-auto w-full max-w-none" : "mx-auto w-full max-w-[880px]"}
      />
    </main>
  );
}
