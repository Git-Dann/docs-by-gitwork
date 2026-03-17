"use client";

import Link from "next/link";
import { ArrowTopRightOnSquareIcon, ClipboardDocumentIcon, DocumentArrowDownIcon, PrinterIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { Button, buttonStyles } from "@/components/ui/button";
import { useExportProposal } from "@/hooks/use-proposals";

export function ExportToolbar({ proposalId }: { proposalId: string }) {
  const exportMutation = useExportProposal(proposalId);
  const [copied, setCopied] = useState(false);

  async function handleShareLink() {
    const result = await exportMutation.mutateAsync({
      format: "SHARE_LINK",
    });

    if (typeof window !== "undefined" && result.export.url) {
      const shareUrl = `${window.location.origin}${result.export.url}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--border-1)] bg-white p-4">
      <header>
        <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-3)] uppercase">Export & Share</p>
        <p className="mt-1 text-xs text-[var(--text-3)]">Print-ready output with PDF/share-link foundation.</p>
      </header>

      <div className="mt-3 grid grid-cols-1 gap-2">
        <Link
          href={`/app/proposals/${proposalId}/preview`}
          className={buttonStyles({
            variant: "secondary",
            size: "sm",
            className: "w-full justify-center text-xs font-semibold tracking-wide uppercase",
          })}
        >
          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
          Open preview
        </Link>
        <Link
          href={`/app/proposals/${proposalId}/print`}
          className={buttonStyles({
            variant: "secondary",
            size: "sm",
            className: "w-full justify-center text-xs font-semibold tracking-wide uppercase",
          })}
        >
          <PrinterIcon className="h-3.5 w-3.5" />
          Print-friendly view
        </Link>
        <Button
          type="button"
          onClick={handleShareLink}
          loading={exportMutation.isPending}
          variant="primary"
          size="sm"
          className="w-full justify-center text-xs font-semibold tracking-wide uppercase"
          leadingIcon={<ClipboardDocumentIcon className="h-3.5 w-3.5" />}
        >
          {copied ? "Link copied" : "Copy share link"}
        </Button>
        <Button
          type="button"
          onClick={() => exportMutation.mutate({ format: "PDF" })}
          loading={exportMutation.isPending}
          variant="secondary"
          size="sm"
          className="w-full justify-center text-xs font-semibold tracking-wide uppercase"
          leadingIcon={<DocumentArrowDownIcon className="h-3.5 w-3.5" />}
        >
          PDF foundation
        </Button>
      </div>

      <p className="mt-3 text-xs text-[var(--text-3)]">
        {exportMutation.isPending
          ? "Preparing export..."
          : exportMutation.isError
            ? (exportMutation.error as Error).message
            : "Print and PDF-ready layout enabled"}
      </p>
    </section>
  );
}
