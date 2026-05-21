"use client";

import Link from "next/link";
import { useProofDocuments } from "@/hooks/use-proof";
import type { WidgetSize } from "@/components/app-overview";

export default function ProofWidget({ size }: { size: WidgetSize }) {
  const { data, isLoading } = useProofDocuments();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
  }

  const docs = data?.documents ?? [];

  if (size.cols === 1 && size.rows === 1) {
    return (
      <div className="flex h-full flex-col justify-between p-1">
        <span className="text-xs font-medium text-[var(--text-2)]">Proof</span>
        <div className="text-center">
          <p className="text-3xl font-bold tabular-nums text-[var(--text-1)]">{docs.length}</p>
          <p className="text-[11px] text-[var(--text-3)]">documents</p>
        </div>
        <p className="text-center text-[11px] text-[var(--text-3)]">
          {docs.length === 0 ? "No documents" : "Collaborative drafts"}
        </p>
      </div>
    );
  }

  const displayCount = size.rows >= 2 ? 6 : 3;

  return (
    <div className="flex h-full flex-col gap-2 p-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-2)]">Proof</span>
        <Link href="/app/proof" className="text-[11px] text-[var(--text-3)] hover:text-[var(--text-1)]">
          View all →
        </Link>
      </div>

      {docs.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-[11px] text-[var(--text-3)]">
          No documents yet
        </div>
      ) : (
        <div className="flex-1 space-y-1 overflow-y-auto">
          {docs.slice(0, displayCount).map((doc) => (
            <Link
              key={doc.id}
              href={`/app/proof/${doc.id}`}
              className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 hover:bg-[var(--surface-1)]"
            >
              <span className="flex-1 truncate text-xs text-[var(--text-1)]">{doc.title}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
