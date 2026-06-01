"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useReport } from "@/hooks/use-support";
import { Button } from "@/components/ui/button";
import { buttonStyles } from "@/components/ui/button-styles";
import type { SupportReportPayload } from "@/types/support";

export default function SupportReportPrintPage() {
  const params = useParams<{ reportId: string }>();
  const reportId = params?.reportId ?? "";
  const { data, isPending, error } = useReport(reportId);

  if (isPending) {
    return <p className="p-8 text-sm text-[var(--text-3)]">Loading report…</p>;
  }

  if (error || !data?.report) {
    return <p className="p-8 text-sm text-rose-700">{(error as Error)?.message ?? "Report not found."}</p>;
  }

  const { report } = data;

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] px-4 py-6 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto w-full max-w-[210mm] space-y-3 bg-transparent print:max-w-none">
        {/* Toolbar */}
        <header className="app-card flex items-center justify-between p-4 print:hidden">
          <div>
            <p className="app-eyebrow">Report Preview</p>
            <p className="mt-0.5 text-sm font-medium text-[var(--text-1)]">{report.period}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => window.print()} variant="primary" size="sm">
              Print / Save PDF
            </Button>
            <Link href="/app/support" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Back to Care
            </Link>
          </div>
        </header>

        {/* Document */}
        <SupportReportDocument period={report.period} payload={report.payload} />
      </div>
    </main>
  );
}

function SupportReportDocument({ period, payload: p }: { period: string; payload: SupportReportPayload }) {
  const catTotal =
    (p.catCancellations ?? 0) +
    (p.catAccountQueries ?? 0) +
    (p.catRefunds ?? 0) +
    (p.catTechIssues ?? 0) +
    (p.catOther ?? 0);

  return (
    <article className="proposal-document mx-auto w-full max-w-[840px] app-surface p-6 sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0">
      {/* Cover */}
      <div className="mb-10 border-b border-[var(--border-2)] pb-10 print:pb-8">
        <p className="app-eyebrow mb-2">Care Report</p>
        <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.04em] text-[var(--text-1)]">
          {period}
        </h1>
        {(p.periodStart || p.periodEnd) && (
          <p className="mt-1 text-sm text-[var(--text-4)]">
            {p.periodStart}
            {p.periodStart && p.periodEnd ? " → " : ""}
            {p.periodEnd}
          </p>
        )}
        {p.author && <p className="mt-1 text-sm text-[var(--text-4)]">Prepared by {p.author}</p>}
      </div>

      <div className="space-y-10 print:space-y-8">
        {/* 01 — Overview */}
        {p.overviewText && (
          <section className="proposal-block-avoid space-y-4 border-b border-[var(--border-2)] pb-10 last:border-0 last:pb-0 print:pb-8">
            <p className="app-eyebrow">01 // Overview</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-2)]">{p.overviewText}</p>
          </section>
        )}

        {/* 02 — Ticket Volume */}
        <section className="proposal-block-avoid space-y-4 border-b border-[var(--border-2)] pb-10 last:border-0 last:pb-0 print:pb-8">
          <p className="app-eyebrow">02 // Ticket Volume</p>
          <div className="flex items-end gap-3">
            <span className="font-display text-[40px] leading-none text-[var(--text-1)]">{p.totalTickets ?? 0}</span>
            <span className="mb-1 text-sm text-[var(--text-4)]">total tickets this period</span>
          </div>
          {catTotal > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { label: "Cancellations", value: p.catCancellations },
                { label: "Account queries", value: p.catAccountQueries },
                { label: "Refunds", value: p.catRefunds },
                { label: "Tech issues", value: p.catTechIssues },
                { label: "Other", value: p.catOther },
              ]
                .filter((c) => (c.value ?? 0) > 0)
                .map((c) => (
                  <div key={c.label} className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-4)]">{c.label}</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--text-1)]">{c.value ?? 0}</p>
                  </div>
                ))}
            </div>
          )}
        </section>

        {/* 03 — Support Performance */}
        {p.performanceText && (
          <section className="proposal-block-avoid space-y-4 border-b border-[var(--border-2)] pb-10 last:border-0 last:pb-0 print:pb-8">
            <p className="app-eyebrow">03 // Support Performance</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-2)]">{p.performanceText}</p>
          </section>
        )}

        {/* 04 — Refund Requests */}
        {((p.catCancellations ?? 0) > 0 || p.refundTotalValue > 0 || p.refundNotes) && (
          <section className="proposal-block-avoid space-y-4 border-b border-[var(--border-2)] pb-10 last:border-0 last:pb-0 print:pb-8">
            <p className="app-eyebrow">04 // Refund Requests</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(p.catCancellations ?? 0) > 0 && (
                <div className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-4)]">Requests</p>
                  <p className="mt-1 text-xl font-semibold text-[var(--text-1)]">{p.catCancellations}</p>
                </div>
              )}
              {p.refundTotalValue > 0 && (
                <div className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-4)]">Total value</p>
                  <p className="mt-1 text-xl font-semibold text-[var(--text-1)]">£{p.refundTotalValue.toFixed(2)}</p>
                </div>
              )}
            </div>
            {p.refundNotes && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-2)]">{p.refundNotes}</p>
            )}
          </section>
        )}

        {/* 05 — Usage & Subscriptions */}
        {(p.usageTotalUsers > 0 || p.usageActiveSubscriptions > 0 || p.usageEventsTotal > 0) && (
          <section className="proposal-block-avoid space-y-4 border-b border-[var(--border-2)] pb-10 last:border-0 last:pb-0 print:pb-8">
            <p className="app-eyebrow">05 // Usage &amp; Subscriptions</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                { label: "Total users", value: p.usageTotalUsers },
                { label: "Verified users", value: p.usageVerifiedUsers },
                { label: "Active subs", value: p.usageActiveSubscriptions },
                { label: "iOS monthly", value: p.usageSubIosMonthly },
                { label: "iOS yearly", value: p.usageSubIosYearly },
                { label: "Android monthly", value: p.usageSubAndroidMonthly },
                { label: "Android yearly", value: p.usageSubAndroidYearly },
                { label: "Stripe monthly", value: p.usageSubStripeMonthly },
                { label: "Stripe yearly", value: p.usageSubStripeYearly },
                { label: "Events total", value: p.usageEventsTotal },
                { label: "Renewals", value: p.usageEventsRenewals },
                { label: "New events", value: p.usageEventsNew },
                { label: "iOS total", value: p.usageIosTotal },
                { label: "iOS new", value: p.usageIosNew },
                { label: "Android total", value: p.usageAndroidTotal },
                { label: "Android new", value: p.usageAndroidNew },
                { label: "Stripe total", value: p.usageStripeTotal },
                { label: "Stripe new", value: p.usageStripeNew },
              ]
                .filter((s) => (s.value ?? 0) > 0)
                .map((s) => (
                  <div key={s.label} className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-4)]">{s.label}</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--text-1)]">{s.value ?? 0}</p>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* 06 — Summary */}
        {p.summaryText && (
          <section className="proposal-block-avoid space-y-4 border-b border-[var(--border-2)] pb-10 last:border-0 last:pb-0 print:pb-8">
            <p className="app-eyebrow">06 // Summary</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-2)]">{p.summaryText}</p>
          </section>
        )}
      </div>
    </article>
  );
}
