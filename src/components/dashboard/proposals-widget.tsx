"use client";

import Link from "next/link";
import { useProposalList } from "@/hooks/use-proposals";
import type { WidgetSize } from "@/components/app-overview";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-[var(--surface-1)] text-[var(--text-3)]",
  IN_REVIEW: "bg-blue-100 text-blue-700",
  PRODUCT_SIGN_OFF: "bg-purple-100 text-purple-700",
  TECH_SIGN_OFF: "bg-purple-100 text-purple-700",
  APPROVED: "bg-green-100 text-green-700",
  SENT: "bg-green-100 text-green-700",
  ARCHIVED: "bg-[var(--surface-1)] text-[var(--text-3)]",
};

export default function ProposalsWidget({ size }: { size: WidgetSize }) {
  const { data, isLoading } = useProposalList({});

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
  }

  const proposals = data?.proposals ?? [];
  const inReview = proposals.filter((p) =>
    ["IN_REVIEW", "PRODUCT_SIGN_OFF", "TECH_SIGN_OFF"].includes(p.status),
  ).length;
  const draft = proposals.filter((p) => p.status === "DRAFT").length;

  if (size.cols === 1 && size.rows === 1) {
    return (
      <div className="flex h-full flex-col justify-between p-1">
        <div className="flex items-start justify-between">
          <span className="text-xs font-medium text-[var(--text-2)]">Docs</span>
          {inReview > 0 && (
            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
              {inReview} review
            </span>
          )}
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold tabular-nums text-[var(--text-1)]">{proposals.length}</p>
          <p className="text-[11px] text-[var(--text-3)]">proposals</p>
        </div>
        <p className="text-center text-[11px] text-[var(--text-3)]">{draft} draft</p>
      </div>
    );
  }

  const displayCount = size.rows >= 2 ? 8 : 4;

  return (
    <div className="flex h-full flex-col gap-2 p-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-2)]">Docs — Proposals</span>
        <Link href="/app/proposals" className="text-[11px] text-[var(--text-3)] hover:text-[var(--text-1)]">
          View all →
        </Link>
      </div>

      <div className="flex gap-3">
        <div className="text-center">
          <p className="text-2xl font-bold tabular-nums text-[var(--text-1)]">{proposals.length}</p>
          <p className="text-[10px] text-[var(--text-3)]">total</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold tabular-nums text-blue-600">{inReview}</p>
          <p className="text-[10px] text-[var(--text-3)]">in review</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold tabular-nums text-[var(--text-2)]">{draft}</p>
          <p className="text-[10px] text-[var(--text-3)]">draft</p>
        </div>
      </div>

      {size.rows >= 2 && (
        <div className="flex-1 space-y-1 overflow-y-auto">
          {proposals.slice(0, displayCount).map((p) => (
            <Link
              key={p.id}
              href={`/app/proposals/${p.id}`}
              className="flex items-center justify-between rounded-[6px] px-2 py-1.5 hover:bg-[var(--surface-1)]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-[var(--text-1)]">{p.title}</p>
                {p.clientName && (
                  <p className="truncate text-[10px] text-[var(--text-3)]">{p.clientName}</p>
                )}
              </div>
              <span
                className={`ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLOR[p.status] ?? STATUS_COLOR.DRAFT}`}
              >
                {p.status.replace(/_/g, " ")}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
