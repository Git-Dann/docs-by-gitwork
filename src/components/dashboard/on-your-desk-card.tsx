"use client";

/**
 * 01 // ON YOUR DESK — the consolidated "what needs your attention today" card.
 *
 * Replaces the four-card attention row (Approvals, Overdue, Sign-off — plus the
 * Daily Roll-up which stays separate at slot 02 because it's a publishing UI
 * for tasks.publish holders, not a personal-to-do).
 *
 * Sections render only when populated. If every section is empty, the whole
 * card collapses to nothing — keeps the dashboard scannable for someone with
 * nothing waiting on them. Permission gating mirrors the old per-card gating
 * (see dashboard-config.ts).
 */

import Link from "next/link";
import { ArrowRightIcon, CheckIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { formatCurrency, formatDate, taskRef } from "@/lib/format";
import {
  useApproveLeaveRequest,
  useExpenses,
  useLeaveRequests,
  useRejectLeaveRequest,
  useReviewExpense,
} from "@/hooks/use-backstage";
import { useTaskAttention } from "@/hooks/use-tasks";
import { useProposalList } from "@/hooks/use-proposals";
import type { LeaveType } from "@/types/backstage";

const LEAVE_LABEL: Record<LeaveType, string> = {
  ANNUAL: "Annual leave",
  SICK: "Sick",
  UNPAID: "Unpaid",
  OTHER: "Leave",
};

const SIGN_OFF = ["IN_REVIEW", "PRODUCT_SIGN_OFF", "TECH_SIGN_OFF"];
const SIGN_OFF_LABEL: Record<string, string> = {
  IN_REVIEW: "In review",
  PRODUCT_SIGN_OFF: "Sign-off",
  TECH_SIGN_OFF: "Tech sign-off",
};

const APPROVALS_CAP = 4;
const TASKS_CAP = 6;
const SIGNOFF_CAP = 5;

interface OnYourDeskCardProps {
  canApprove: boolean;
  canSeeTasks: boolean;
  canSeeSignoff: boolean;
}

export function OnYourDeskCard({ canApprove, canSeeTasks, canSeeSignoff }: OnYourDeskCardProps) {
  // Tasks — the "On Your Plate" stream. Server hook already filters to the
  // current user's overdue + due-soon + in-progress.
  const taskAttention = useTaskAttention();
  const overdueTasks = canSeeTasks ? taskAttention.data?.overdue ?? [] : [];
  const doingCount = canSeeTasks ? taskAttention.data?.doingCount ?? 0 : 0;
  const dueSoonCount = canSeeTasks ? taskAttention.data?.dueSoonCount ?? 0 : 0;
  const overdueTotal = canSeeTasks ? taskAttention.data?.overdueCount ?? overdueTasks.length : 0;

  // Approvals — leave + expenses pending.
  const leaveQuery = useLeaveRequests("all", "PENDING");
  const expensesQuery = useExpenses("all", "SUBMITTED");
  const leave = canApprove ? leaveQuery.data ?? [] : [];
  const expenses = canApprove ? expensesQuery.data ?? [] : [];
  const approveLeave = useApproveLeaveRequest();
  const rejectLeave = useRejectLeaveRequest();
  const reviewExpense = useReviewExpense();
  const approvalsBusy =
    approveLeave.isPending || rejectLeave.isPending || reviewExpense.isPending;

  // Sign-offs — proposals awaiting review / sign-off.
  const proposalQuery = useProposalList({});
  const awaitingSignoff = canSeeSignoff
    ? (proposalQuery.data?.proposals ?? []).filter((p) => SIGN_OFF.includes(p.status))
    : [];

  const hasTasks = overdueTasks.length > 0 || doingCount > 0 || dueSoonCount > 0;
  const hasApprovals = leave.length + expenses.length > 0;
  const hasSignoff = awaitingSignoff.length > 0;
  const hasAnything = hasTasks || hasApprovals || hasSignoff;

  if (!hasAnything) return null;

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">01</span>
          {" // ON YOUR DESK"}
        </span>
        <span
          className="widget-header__status"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {[
            hasTasks ? `${doingCount} doing` : null,
            hasTasks && overdueTotal > 0 ? `${overdueTotal} overdue` : null,
            hasApprovals ? `${leave.length + expenses.length} to approve` : null,
            hasSignoff ? `${awaitingSignoff.length} sign-off` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>

      <div className="widget-body space-y-5">
        {/* ─── Tasks ──────────────────────────────────────────────────────── */}
        {hasTasks ? (
          <SectionHeader title="Tasks" href="/app/portal" hrefLabel="Open Portal" />
        ) : null}
        {overdueTasks.length > 0 ? (
          <div className="space-y-1.5">
            <p
              className="text-[10px] font-medium uppercase tracking-[0.8px] text-red-600"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Overdue ({overdueTotal})
            </p>
            {overdueTasks.slice(0, TASKS_CAP).map((t) => (
              <Link
                key={t.id}
                href={`/app/portal/${t.client.slug}/tasks?task=${encodeURIComponent(t.id)}`}
                className="flex items-center justify-between gap-2 rounded-[8px] border border-red-100 bg-red-50/50 px-3 py-2 transition hover:bg-red-50"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="shrink-0 text-[10px] text-[var(--text-4)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {taskRef(t.id)}
                  </span>
                  <span className="truncate text-sm font-medium text-[var(--text-1)]">
                    {t.title}
                  </span>
                  <span className="shrink-0 truncate text-[11px] text-[var(--text-4)]">
                    · {t.client.name}
                  </span>
                </div>
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-red-600">
                  {t.dueDate ? formatDate(t.dueDate) : ""}
                </span>
              </Link>
            ))}
            {overdueTotal > TASKS_CAP ? (
              <p className="text-center text-[11px] text-[var(--text-4)]">
                +{overdueTotal - TASKS_CAP} more overdue
              </p>
            ) : null}
          </div>
        ) : null}

        {/* ─── Approvals ──────────────────────────────────────────────────── */}
        {hasApprovals ? (
          <SectionHeader title="Approvals" href="/app/backstage" hrefLabel="Backstage" />
        ) : null}
        {leave.length > 0 ? (
          <div className="space-y-1.5">
            <p
              className="text-[10px] font-medium uppercase tracking-[0.8px] text-[var(--text-4)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Leave
            </p>
            {leave.slice(0, APPROVALS_CAP).map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-2 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-1)]">
                    {l.user.name}
                  </p>
                  <p className="truncate text-[11px] text-[var(--text-4)]">
                    {LEAVE_LABEL[l.type]} · {formatDate(l.startDate)}–{formatDate(l.endDate)} · {l.workingDays}d
                  </p>
                </div>
                <ActionBtns
                  disabled={approvalsBusy}
                  onApprove={() => approveLeave.mutate({ id: l.id })}
                  onReject={() => rejectLeave.mutate({ id: l.id })}
                />
              </div>
            ))}
          </div>
        ) : null}
        {expenses.length > 0 ? (
          <div className="space-y-1.5">
            <p
              className="text-[10px] font-medium uppercase tracking-[0.8px] text-[var(--text-4)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Expenses
            </p>
            {expenses.slice(0, APPROVALS_CAP).map((x) => (
              <div
                key={x.id}
                className="flex items-center gap-2 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-1)]">
                    {x.user.name} · <span className="tabular-nums">{formatCurrency(x.amount, x.currency)}</span>
                  </p>
                  <p className="truncate text-[11px] text-[var(--text-4)]">
                    {x.vendor ? `${x.vendor} · ` : ""}
                    {x.category.toLowerCase()}
                  </p>
                </div>
                <ActionBtns
                  disabled={approvalsBusy}
                  onApprove={() => reviewExpense.mutate({ id: x.id, status: "APPROVED" })}
                  onReject={() => reviewExpense.mutate({ id: x.id, status: "REJECTED" })}
                />
              </div>
            ))}
          </div>
        ) : null}

        {/* ─── Sign-offs ──────────────────────────────────────────────────── */}
        {hasSignoff ? (
          <SectionHeader title="Sign-offs" href="/app/docs" hrefLabel="Docs" />
        ) : null}
        {awaitingSignoff.length > 0 ? (
          <div className="space-y-1.5">
            {awaitingSignoff.slice(0, SIGNOFF_CAP).map((p) => (
              <Link
                key={p.id}
                href={`/app/proposals/${p.id}`}
                className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2 transition hover:bg-[var(--surface-1)]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--text-1)]">{p.title}</p>
                  {p.clientName ? (
                    <p className="truncate text-[11px] text-[var(--text-4)]">{p.clientName}</p>
                  ) : null}
                </div>
                <span className="shrink-0 rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                  {SIGN_OFF_LABEL[p.status] ?? p.status.replace(/_/g, " ")}
                </span>
              </Link>
            ))}
            {awaitingSignoff.length > SIGNOFF_CAP ? (
              <p className="text-center text-[11px] text-[var(--text-4)]">
                +{awaitingSignoff.length - SIGNOFF_CAP} more →
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SectionHeader({
  title,
  href,
  hrefLabel,
}: {
  title: string;
  href: string;
  hrefLabel: string;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-[var(--border-3)] pb-1.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-2)]">
        {title}
      </h4>
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--text-4)] transition-colors hover:text-[var(--brand-700)]"
      >
        {hrefLabel} <ArrowRightIcon className="h-3 w-3" />
      </Link>
    </div>
  );
}

function ActionBtns({
  onApprove,
  onReject,
  disabled,
}: {
  onApprove: () => void;
  onReject: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onApprove();
        }}
        disabled={disabled}
        title="Approve"
        className="flex h-6 w-6 items-center justify-center rounded-[6px] border border-emerald-300 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
      >
        <CheckIcon className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onReject();
        }}
        disabled={disabled}
        title="Reject"
        className="flex h-6 w-6 items-center justify-center rounded-[6px] border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:opacity-50"
      >
        <XMarkIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
