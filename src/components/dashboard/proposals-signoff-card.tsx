"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@heroicons/react/16/solid";
import { useProposalList } from "@/hooks/use-proposals";

const SIGN_OFF = ["IN_REVIEW", "PRODUCT_SIGN_OFF", "TECH_SIGN_OFF"];
const STATUS_LABEL: Record<string, string> = {
  IN_REVIEW: "In review",
  PRODUCT_SIGN_OFF: "Sign-off",
  TECH_SIGN_OFF: "Tech sign-off",
};

export function ProposalsSignoffCard() {
  const { data, isLoading } = useProposalList({});
  const awaiting = (data?.proposals ?? []).filter((p) => SIGN_OFF.includes(p.status));

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">04</span>
          {" // SIGN-OFF"}
        </span>
        <Link
          href="/app/proposals"
          className="widget-header__status inline-flex items-center gap-1 transition-colors hover:text-[var(--brand-700)]"
        >
          {awaiting.length > 0 ? `${awaiting.length} waiting` : "Docs"} <ArrowRightIcon className="h-3 w-3" />
        </Link>
      </div>

      <div className="widget-body space-y-1.5">
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />
        ) : awaiting.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--text-4)]">Nothing awaiting sign-off.</p>
        ) : (
          <>
            {awaiting.slice(0, 6).map((p) => (
              <Link
                key={p.id}
                href={`/app/proposals/${p.id}`}
                className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2 transition hover:bg-[var(--surface-1)]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--text-1)]">{p.title}</p>
                  {p.clientName ? <p className="truncate text-[11px] text-[var(--text-4)]">{p.clientName}</p> : null}
                </div>
                <span className="shrink-0 rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                  {STATUS_LABEL[p.status] ?? p.status.replace(/_/g, " ")}
                </span>
              </Link>
            ))}
            {awaiting.length > 6 ? (
              <Link href="/app/proposals" className="block text-center text-[11px] font-medium text-[var(--brand-700)] hover:underline">
                +{awaiting.length - 6} more →
              </Link>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
