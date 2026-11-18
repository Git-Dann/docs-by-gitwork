"use client";

import Link from "next/link";
import { DocumentTextIcon } from "@heroicons/react/24/solid";
import { useProposalList } from "@/hooks/use-proposals";
import type { WidgetSize } from "@/components/app-overview";
import { SkeletonWidget } from "@/components/ui/motion/skeleton";
import { TileHeader } from "@/components/dashboard/tile-header";
import { useCountUp } from "@/components/ui/motion/use-count-up";

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

export default function ProposalsWidget({ size, index }: { size: WidgetSize; index: number }) {
  const { data, isLoading } = useProposalList({});
  const count = useCountUp(isLoading ? null : (data?.proposals ?? []).length);

  if (isLoading) {
    return <SkeletonWidget />;
  }

  const proposals = data?.proposals ?? [];
  const inReview = proposals.filter((p) =>
    ["IN_REVIEW", "PRODUCT_SIGN_OFF", "TECH_SIGN_OFF"].includes(p.status),
  ).length;
  const draft = proposals.filter((p) => p.status === "DRAFT").length;

  if (size === "sm") {
    // Two most-recently-updated docs as quick links — matches the Pulse sm
    // treatment so the row feels consistent.
    const recent = [...proposals]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 2);
    return (
      <div className="flex h-full flex-col">
        <TileHeader
          index={index}
          label="DOCS"
          href="/app/docs"
          status={inReview > 0 ? `${inReview} IN REVIEW` : null}
          statusTone="brand"
        />
        <div className="flex flex-1 flex-col overflow-hidden px-4 pb-3 pt-3">
          <div className="flex items-baseline gap-2">
            <p className="text-2xl tabular-nums leading-none text-[var(--text-1)]" style={{ fontFamily: "var(--font-display)" }}>
              {count}
            </p>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
              docs
            </p>
          </div>
          <StatusSplit proposals={proposals} />
          {recent.length > 0 ? (
            <div className="mt-2 space-y-0.5">
              {recent.map((p) => (
                <Link
                  key={p.id}
                  href={`/app/docs/${p.id}`}
                  className="flex items-center justify-between gap-2 rounded-[6px] px-2 py-1 transition-colors hover:bg-[var(--surface-1)]"
                >
                  <span className="truncate text-xs text-[var(--text-1)]">{p.title}</span>
                  <span
                    className={`ml-2 shrink-0 rounded-[4px] px-1.5 py-0.5 text-[9px] font-medium ${STATUS_STYLES[p.status] ?? STATUS_STYLES.DRAFT}`}
                  >
                    {STATUS_LABEL[p.status] ?? p.status.replace(/_/g, " ")}
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const displayCount = 8;

  return (
    <div className="flex h-full flex-col">
      <TileHeader index={index} label="DOCS" href="/app/docs" />

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-hidden p-4">
        {/* Stats row */}
        <div className="flex items-center gap-3">
          <div className="rounded-[6px] bg-[var(--surface-1)] px-3 py-1.5 text-center">
            <p className="text-xl tabular-nums leading-none text-[var(--text-1)]" style={{ fontFamily: "var(--font-display)" }}>{proposals.length}</p>
            <p className="mt-0.5 text-xs text-[var(--text-3)]">total</p>
          </div>
          <div className="rounded-[6px] bg-blue-50 px-3 py-1.5 text-center">
            <p className="text-xl tabular-nums leading-none text-blue-600" style={{ fontFamily: "var(--font-display)" }}>{inReview}</p>
            <p className="mt-0.5 text-xs text-blue-400">in review</p>
          </div>
          <div className="rounded-[6px] bg-[var(--surface-1)] px-3 py-1.5 text-center">
            <p className="text-xl tabular-nums leading-none text-[var(--text-3)]" style={{ fontFamily: "var(--font-display)" }}>{draft}</p>
            <p className="mt-0.5 text-xs text-[var(--text-3)]">draft</p>
          </div>
        </div>

        {/* List */}
        <div className="mt-2 flex-1 overflow-y-auto">
          {proposals.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1.5">
              <DocumentTextIcon className="h-6 w-6 text-[var(--text-4)]" />
              <p className="text-xs text-[var(--text-3)]">No proposals yet</p>
              <Link href="/app/docs" className="text-xs font-medium text-[var(--brand-700)] hover:underline">
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
                    <p className="truncate text-sm font-medium text-[var(--text-1)]">{p.title}</p>
                    {p.clientName && (
                      <p className="truncate text-xs text-[var(--text-3)]">{p.clientName}</p>
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

const SPLIT: Array<{ key: string; label: string; match: string[]; colour: string }> = [
  { key: "draft", label: "Draft", match: ["DRAFT"], colour: "var(--border-1)" },
  { key: "review", label: "Review", match: ["IN_REVIEW", "PRODUCT_SIGN_OFF", "TECH_SIGN_OFF"], colour: "var(--brand-500)" },
  { key: "done", label: "Approved/sent", match: ["APPROVED", "SENT", "ACCEPTED"], colour: "var(--text-3)" },
];

/** Drafts, in review and approved/sent as one proportional bar with counts, so the pipeline reads at a glance. */
function StatusSplit({ proposals }: { proposals: Array<{ status: string }> }) {
  const counts = SPLIT.map((s) => ({ ...s, n: proposals.filter((p) => s.match.includes(p.status)).length }));
  const total = counts.reduce((n, c) => n + c.n, 0);
  if (total === 0) return null;
  return (
    <div className="mt-2.5">
      <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-[3px]" role="img" aria-label={counts.map((c) => `${c.n} ${c.label.toLowerCase()}`).join(", ")}>
        {counts.map((c) =>
          c.n > 0 ? <span key={c.key} className="h-full transition-[width] duration-500" style={{ width: `${(c.n / total) * 100}%`, background: c.colour }} /> : null,
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
        {counts.map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-[2px]" style={{ background: c.colour }} />
            {c.n} {c.label.toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
