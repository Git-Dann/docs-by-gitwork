"use client";

import { useEffect } from "react";
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("autoprint") !== "1") {
      return;
    }

    const timer = window.setTimeout(() => {
      window.print();
    }, 200);

    return () => window.clearTimeout(timer);
  }, []);

  if (isPending) {
    return <p className="p-8 text-sm text-[var(--text-3)]">Loading proposal...</p>;
  }

  if (error || !data?.proposal) {
    return <p className="p-8 text-sm text-rose-700">{(error as Error)?.message ?? "Proposal not found."}</p>;
  }

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] px-4 py-6 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto w-full max-w-[210mm] space-y-3 bg-transparent print:max-w-none">
        <PrintToolbar proposalId={id} />
        <ProposalPreview proposal={data.proposal} showTableOfContents={false} frame />
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
