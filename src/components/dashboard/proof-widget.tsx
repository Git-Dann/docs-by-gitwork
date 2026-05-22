"use client";

import Link from "next/link";
import { ClipboardDocumentCheckIcon } from "@heroicons/react/24/solid";
import { useProofDocuments } from "@/hooks/use-proof";
import type { WidgetSize } from "@/components/app-overview";

export default function ProofWidget({ size }: { size: WidgetSize }) {
  const { data, isLoading } = useProofDocuments();

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[6px] bg-[var(--surface-1)]" />;
  }

  const docs = data?.documents ?? [];

  if (size === "sm") {
    return (
      <div className="flex h-full flex-col">
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          <ClipboardDocumentCheckIcon className="h-2.5 w-2.5" />
          Proof
        </span>
        <div className="flex flex-1 flex-col items-center justify-center">
          <p className="text-3xl font-bold tabular-nums text-[var(--text-1)]">{docs.length}</p>
          <p className="text-[11px] text-[var(--text-3)]">documents</p>
        </div>
        <p className="text-center text-[11px] text-[var(--text-3)]">
          {docs.length === 0 ? "No documents" : "Collaborative drafts"}
        </p>
      </div>
    );
  }

  const displayCount = 7;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          <ClipboardDocumentCheckIcon className="h-2.5 w-2.5" />
          Proof
        </span>
        <Link href="/app/proof" className="text-[11px] text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]">
          View all
        </Link>
      </div>

      {/* List */}
      <div className="mt-2 flex-1 overflow-y-auto">
        {docs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
            <ClipboardDocumentCheckIcon className="h-6 w-6 text-[var(--text-4)]" />
            <p className="text-[11px] text-[var(--text-3)]">No documents yet</p>
            <Link href="/app/proof" className="text-[11px] font-medium text-[var(--accent)] hover:underline">
              Create document →
            </Link>
          </div>
        ) : (
          <div className="space-y-0.5">
            {docs.slice(0, displayCount).map((doc) => (
              <Link
                key={doc.id}
                href={`/app/proof/${doc.id}`}
                className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 transition-colors hover:bg-[var(--surface-1)]"
              >
                <ClipboardDocumentCheckIcon className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" />
                <span className="flex-1 truncate text-xs text-[var(--text-1)]">{doc.title}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
