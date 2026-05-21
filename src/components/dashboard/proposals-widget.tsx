"use client";

import Link from "next/link";
import { DocumentTextIcon } from "@heroicons/react/24/solid";
import { useProposalList } from "@/hooks/use-proposals";
import type { WidgetSize } from "@/components/app-overview";

const STATUS_STYLES: Record<string, string> = {
  DRAFT:            "bg-[var(--surface-2)] text-[var(--text-3)]",
  IN_REVIEW:        "bg-blue-50 text-blue-700",
  PRODUCT_SIGN_OFF: "bg-purple-50 text-purple-700",
  TECH_SIGN_OFF:    "bg-purple-50 text-purple-700",
  APPROVED:         "bg-emerald-50 text-emerald-700",
  SENT:             "bg-emerald-50 text-emerald-700",
  ARCHIVED:         "bg-[var(--surface-2)] text-[var(--text-3)]",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT:            "Draft",
  IN_REVIEW:        "In review",
  PRODUCT_SIGN_OFF: "Sign-off",
  TECH_SIGN_OFF:    "Tech sign-off",
  APPROVED:         "Approved",
  SENT:             "Sent",
  ARCHIVED:         "Archived",
};

export default function ProposalsWidget({ size }: { size: WidgetSize }) {
  const { data, isLoading } = useProposalList({});

  if (isLoading) {
    return <div className="h-full animate-pulse rounded-[8px] bg-[var(--surface-1)]" />;
  }

  const proposals = data?.proposals ?? [];
  const inReview = proposals.filter((p) =>
    ["IN_REVIEW", "PRODUCT_SIGN_OFF", "TECH_SIGN_OFF"].includes(p.status),
  ).length;
  const draft = proposals.filter((p) => p.status === "DRAFT").length;

  if (size.cols === 1 && size.rows === 1) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            <DocumentTextIcon className="h-2.5 w-2.5" />
            Docs
          </span>
          {inReview > 0 && (
            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
              {inReview} review
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center">
          <p className="text-3xl font-bold tabular-nums text-[var(--text-1)]">{proposals.length}</p>
          <p className="text-[11px] text-[var(--text-3)]">proposals</p>
        </div>
        <p className="text-center text-[11px] text-[var(--text-3)]">{draft} draft</p>
      </div>
    );
  }

  const displayCount = size.rows >= 2 ? 8 : 4;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
          <DocumentTextIcon className="h-2.5 w-2.5" />
          Docs
        </span>
        <Link href="/app/proposals" className="text-[11px] text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]">
          View all
        </Link>
      </div>

      {/* Stats row */}
      <div className="mt-3 flex items-center gap-3">
        <div className="rounded-[8px] bg-[var(--surface-1)] px-3 py-1.5 text-center">
          <p className="text-xl font-bold tabular-nums leading-none text-[var(--text-1)]">{proposals.length}</p>
          <p className="mt-0.5 text-[10px] text-[var(--text-3)]">total</p>
        </div>
        <div className="rounded-[8px] bg-blue-50 px-3 py-1.5 text-center">
          <p className="text-xl font-bold tabular-nums leading-none text-blue-600">{inReview}</p>
          <p className="mt-0.5 text-[10px] text-blue-400">in review</p>
        </div>
        <div className="rounded-[8px] bg-[var(--surface-1)] px-3 py-1.5 text-center">
          <p className="text-xl font-bold tabular-nums leading-none text-[var(--text-2)]">{draft}</p>
          <p className="mt-0.5 text-[10px] text-[var(--text-3)]">draft</p>
        </div>
      </div>

      {/* List */}
      {size.rows >= 2 && (
        <div className="mt-2 flex-1 overflow-y-auto">
          {proposals.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1.5">
              <DocumentTextIcon className="h-6 w-6 text-[var(--text-4)]" />
              <p className="text-[11px] text-[var(--text-3)]">No proposals yet</p>
              <Link href="/app/proposals" className="text-[11px] font-medium text-[var(--accent)] hover:underline">
                Create one →
              </Link>
            </div>
          ) : (
            <div className="space-y-0.5">
              {proposals.slice(0, displayCount).map((p) => (
                <Link
                  key={p.id}
                  href={`/app/proposals/${p.id}`}
                  className="flex items-center justify-between rounded-[6px] px-2 py-1.5 transition-colors hover:bg-[var(--surface-1)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-[var(--text-1)]">{p.title}</p>
                    {p.clientName && (
                      <p className="truncate text-[10px] text-[var(--text-3)]">{p.clientName}</p>
                    )}
                  </div>
                  <span
                    className={`ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLES[p.status] ?? STATUS_STYLES.DRAFT}`}
                  >
                    {STATUS_LABEL[p.status] ?? p.status.replace(/_/g, " ")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
