"use client";

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { CertificateOfCompletion } from "@/components/proposals/certificate-of-completion";
import { PrintToolbar } from "@/components/proposals/print-toolbar";
import { ProposalPreview } from "@/components/proposals/proposal-preview";
import { useProposal } from "@/hooks/use-proposals";
import { useSignatureRequests } from "@/hooks/use-signatures";

export default function ProposalPrintPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { data, isPending, error } = useProposal(id);
  const signaturesQuery = useSignatureRequests(id);

  // Append the Certificate of Completion appendix only when there's a COMPLETED request. Other
  // states (SENT / DECLINED / REVOKED / DRAFT) do not warrant a certificate.
  const completedRequest = (signaturesQuery.data ?? []).find((r) => r.status === "COMPLETED");

  // Auto-print once the document has loaded AND the client height pagination has settled (the
  // paged renderer sets window.__docPaginated) — otherwise print() fires mid-measure and the
  // pages are wrong. Hard fallback at 6s so a stuck signal never blocks the print dialog.
  const printedRef = useRef(false);
  const hasDoc = Boolean(data?.proposal);
  useEffect(() => {
    if (typeof window === "undefined" || !hasDoc || printedRef.current) return;
    if (new URLSearchParams(window.location.search).get("autoprint") !== "1") return;

    const start = Date.now();
    let timer = 0;
    const tick = () => {
      const paginated = (window as unknown as { __docPaginated?: boolean }).__docPaginated;
      if (paginated || Date.now() - start > 6000) {
        printedRef.current = true;
        window.print();
        return;
      }
      timer = window.setTimeout(tick, 150);
    };
    timer = window.setTimeout(tick, 300);
    return () => window.clearTimeout(timer);
  }, [hasDoc]);

  if (isPending) {
    return <p className="p-8 text-sm text-[var(--text-3)]">Loading document...</p>;
  }

  if (error || !data?.proposal) {
    return <p className="p-8 text-sm text-rose-700">{(error as Error)?.message ?? "Document not found."}</p>;
  }

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] px-4 py-6 print:bg-transparent print:px-0 print:py-0">
      <div className="mx-auto w-full max-w-[210mm] space-y-3 bg-transparent print:max-w-none print:space-y-0">
        <PrintToolbar proposalId={id} />
        <ProposalPreview proposal={data.proposal} showTableOfContents={false} pageMode="paged" />
        {completedRequest ? (
          <CertificateOfCompletion
            request={completedRequest}
            documentTitle={data.proposal.title}
            documentNumber={data.proposal.documentNumber ?? null}
          />
        ) : null}
      </div>
    </main>
  );
}
