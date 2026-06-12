"use client";

import Link from "next/link";
import { DocumentTextIcon } from "@heroicons/react/24/solid";
import { useProposalList } from "@/hooks/use-proposals";
import type { WidgetSize } from "@/components/app-overview";

const STATUS_STYLES: Record<string, string> = {
  DRAFT:            "bg-[var(--surface-2)] text-[#475569]",
  IN_REVIEW:        "bg-blue-50 text-blue-700",
  PRODUCT_SIGN_OFF: "bg-purple-50 text-purple-700",
  TECH_SIGN_OFF:    "bg-purple-50 text-purple-700",
  APPROVED:         "bg-emerald-50 text-emerald-700",
  SENT:             "bg-emerald-50 text-emerald-700",
  ARCHIVED:         "bg-[var(--surface-2)] text-[#475569]",
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
    return <div className="h-full animate-pulse rounded-[6px] bg-[var(--surface-1)]" />;
  }

  const proposals = data?.proposals ?? [];
  const inReview = proposals.filter((p) =>
    ["IN_REVIEW", "PRODUCT_SIGN_OFF", "TECH_SIGN_OFF"].includes(p.status),
  ).length;
  const draft = proposals.filter((p) => p.status === "DRAFT").length;

  if (size === "sm") {
    return (
      <div className="flex h-full flex-col">
        {/* Widget header */}
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
          <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>
            08 // DOCS
          </span>
          {inReview > 0 && (
            <span className="text-xs font-medium text-blue-600">
              {inReview} review
            </span>
          )}
        </div>
        {/* Body */}
        <div className="flex flex-1 flex-col overflow-hidden p-4">
          <div className="flex flex-1 flex-col items-center justify-center">
            <p className="text-3xl tabular-nums text-[#0F172A]" style={{ fontFamily: "var(--font-display)" }}>{proposals.length}</p>
            <p className="text-xs text-[#475569]">proposals</p>
          </div>
          <p className="text-center text-xs text-[#475569]">{draft} draft</p>
        </div>
      </div>
    );
  }

  const displayCount = 8;

  return (
    <div className="flex h-full flex-col">
      {/* Widget header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[rgba(0,0,0,0.08)] px-4">
        <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[#94A3B8]" style={{ fontFamily: "var(--font-mono)" }}>
          08 // DOCS
        </span>
        <Link href="/app/docs" className="text-xs text-[#475569] transition-colors hover:text-[#0F172A]">
          View all
        </Link>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        {/* Stats row */}
        <div className="flex items-center gap-3">
          <div className="rounded-[6px] bg-[var(--surface-1)] px-3 py-1.5 text-center">
            <p className="text-xl tabular-nums leading-none text-[#0F172A]" style={{ fontFamily: "var(--font-display)" }}>{proposals.length}</p>
            <p className="mt-0.5 text-xs text-[#475569]">total</p>
          </div>
          <div className="rounded-[6px] bg-blue-50 px-3 py-1.5 text-center">
            <p className="text-xl tabular-nums leading-none text-blue-600" style={{ fontFamily: "var(--font-display)" }}>{inReview}</p>
            <p className="mt-0.5 text-xs text-blue-400">in review</p>
          </div>
          <div className="rounded-[6px] bg-[var(--surface-1)] px-3 py-1.5 text-center">
            <p className="text-xl tabular-nums leading-none text-[#475569]" style={{ fontFamily: "var(--font-display)" }}>{draft}</p>
            <p className="mt-0.5 text-xs text-[#475569]">draft</p>
          </div>
        </div>

        {/* List */}
        <div className="mt-2 flex-1 overflow-y-auto">
          {proposals.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1.5">
              <DocumentTextIcon className="h-6 w-6 text-[#94A3B8]" />
              <p className="text-xs text-[#475569]">No proposals yet</p>
              <Link href="/app/docs" className="text-xs font-medium text-[#1D4ED8] hover:underline">
                Create one →
              </Link>
            </div>
          ) : (
            <div className="space-y-0.5">
              {proposals.slice(0, displayCount).map((p) => (
                <Link
                  key={p.id}
                  href={`/app/docs/${p.id}`}
                  className="flex items-center justify-between rounded-[6px] px-2 py-1.5 transition-colors hover:bg-[var(--surface-1)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#0F172A]">{p.title}</p>
                    {p.clientName && (
                      <p className="truncate text-xs text-[#475569]">{p.clientName}</p>
                    )}
                  </div>
                  <span
                    className={`ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[p.status] ?? STATUS_STYLES.DRAFT}`}
                  >
                    {STATUS_LABEL[p.status] ?? p.status.replace(/_/g, " ")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
