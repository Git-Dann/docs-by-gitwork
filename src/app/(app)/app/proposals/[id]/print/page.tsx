"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { PrintToolbar } from "@/components/proposals/print-toolbar";
import { ProposalPreview } from "@/components/proposals/proposal-preview";
import { useProposal } from "@/hooks/use-proposals";

export default function ProposalPrintPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { data, isPending, error } = useProposal(id);

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
    <main className="mx-auto w-full max-w-[210mm] space-y-3 bg-white px-[12mm] py-[12mm] print:max-w-none print:px-0 print:py-0">
      <PrintToolbar proposalId={id} />
      <ProposalPreview proposal={data.proposal} showTableOfContents={false} frame={false} />
    </main>
  );
}
