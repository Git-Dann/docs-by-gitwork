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
import { useTaskAttention, usePushDailyUpdate, useMyDay } from "@/hooks/use-tasks";
import { useProposalList } from "@/hooks/use-proposals";
import { useStaffingAlerts } from "@/hooks/use-backstage";
import type { LeaveType, StaffingAlert } from "@/types/backstage";
import { formatDateRange, formatDay } from "@/components/backstage/format";
import { CalendarDaysIcon, GlobeAltIcon } from "@heroicons/react/24/solid";
import { useState } from "react";

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
  // Tasks — scoped to the current user's assignments. A super admin/admin doesn't
  // want the whole workspace's 242 overdue bleeding into their "On your desk"
  // (that's a Portal-level concern); they want what THEY own.
  const taskAttention = useTaskAttention({ mine: true });
  const overdueTasks = canSeeTasks ? taskAttention.data?.overdue ?? [] : [];
  const doingTasks = canSeeTasks ? taskAttention.data?.doing ?? [] : [];
  const doingCount = canSeeTasks ? taskAttention.data?.doingCount ?? 0 : 0;
  const dueSoonCount = canSeeTasks ? taskAttention.data?.dueSoonCount ?? 0 : 0;
  const overdueTotal = canSeeTasks ? taskAttention.data?.overdueCount ?? overdueTasks.length : 0;

  // Upcoming team availability — pulled from BackstageWidget's data source so
  // the operator sees this team-level signal without a dedicated bento tile.
  const staffingAlerts = useStaffingAlerts();
  // Filter to genuinely upcoming events (the WhoIsOffToday strip handles today
  // already; this card shows what's coming).
  const upcomingAlerts = (staffingAlerts.data?.alerts ?? []).filter((a) => {
    const startISO = a.kind === "conflict" ? a.date : a.kind === "holiday" ? a.date : a.startDate;
    return startISO.slice(0, 10) >= new Date().toISOString().slice(0, 10);
  });

  // Standup push to Slack — same `pushDailyUpdate` API the devs use, but
  // surfaced here so admins (Dan) can post their own tasks for testing/dogfood.
  // Admins are excluded from the dev roster so this doesn't pollute the roll-up
  // count; it just posts a Block Kit card to the involved clients' channels.
  const myDay = useMyDay();
  const pushUpdate = usePushDailyUpdate();
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);
  const amPushed = Boolean(myDay.data?.update?.amPushedAt);
  const pmPushed = Boolean(myDay.data?.update?.pmPushedAt);
  async function handlePushStandup(phase: "AM" | "PM") {
    setPushFeedback(null);
    try {
      await pushUpdate.mutateAsync({ phase });
      setPushFeedback(`${phase} standup posted to Slack ✓`);
      setTimeout(() => setPushFeedback(null), 4000);
    } catch (err) {
      setPushFeedback((err as Error).message);
    }
  }

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

  const hasTasks = overdueTasks.length > 0 || doingTasks.length > 0 || dueSoonCount > 0;
  const hasApprovals = leave.length + expenses.length > 0;
  const hasSignoff = awaitingSignoff.length > 0;
  const hasUpcoming = upcomingAlerts.length > 0;
  const hasAnything = hasTasks || hasApprovals || hasSignoff || hasUpcoming;

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
            hasUpcoming ? `${upcomingAlerts.length} upcoming` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>

      <div className="widget-body space-y-5">
        {/* ─── Tasks ──────────────────────────────────────────────────────── */}
        {hasTasks ? (
          <div>
            <SectionHeader title="Tasks" href="/app/portal" hrefLabel="Open Portal" />
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-[var(--text-4)]">Standup →</span>
              <button
                type="button"
                onClick={() => void handlePushStandup("AM")}
                disabled={pushUpdate.isPending}
                className="rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-0.5 font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-40"
                title="Post your AM 'Doing' Block Kit card to each client's linked Slack channel"
              >
                {pushUpdate.isPending && pushUpdate.variables?.phase === "AM" ? "Posting…" : amPushed ? "Re-push AM" : "Push AM"}
              </button>
              <button
                type="button"
                onClick={() => void handlePushStandup("PM")}
                disabled={pushUpdate.isPending}
                className="rounded-[6px] border border-[var(--border-2)] bg-white px-2 py-0.5 font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-40"
                title="Post your PM 'Done today' Block Kit card to each client's linked Slack channel"
              >
                {pushUpdate.isPending && pushUpdate.variables?.phase === "PM" ? "Posting…" : pmPushed ? "Re-push PM" : "Push PM"}
              </button>
              {pushFeedback ? (
                <span className="text-[var(--text-3)]">{pushFeedback}</span>
              ) : null}
            </div>
          </div>
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

        {doingTasks.length > 0 ? (
          <div className="space-y-1.5">
            <p
              className="text-[10px] font-medium uppercase tracking-[0.8px] text-[var(--text-4)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Doing ({doingCount})
            </p>
            {doingTasks.slice(0, TASKS_CAP).map((t) => (
              <Link
                key={t.id}
                href={`/app/portal/${t.client.slug}/tasks?task=${encodeURIComponent(t.id)}`}
                className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2 transition hover:bg-[var(--surface-1)]"
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
                {t.dueDate ? (
                  <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-4)]">
                    {formatDate(t.dueDate)}
                  </span>
                ) : null}
              </Link>
            ))}
            {doingCount > TASKS_CAP ? (
              <p className="text-center text-[11px] text-[var(--text-4)]">
                +{doingCount - TASKS_CAP} more in progress
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

        {/* ─── Upcoming (team availability — folded in from the old Backstage tile) ── */}
        {hasUpcoming ? (
          <SectionHeader title="Upcoming" href="/app/backstage" hrefLabel="Backstage" />
        ) : null}
        {hasUpcoming ? (
          <ul className="space-y-1.5">
            {upcomingAlerts.slice(0, 6).map((a, i) => (
              <li key={i}>
                <UpcomingRow alert={a} />
              </li>
            ))}
            {upcomingAlerts.length > 6 ? (
              <li className="text-center text-[11px] text-[var(--text-4)]">
                +{upcomingAlerts.length - 6} more →
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

/** Compact row for a single staffing alert — leave / holiday / conflict. */
function UpcomingRow({ alert }: { alert: StaffingAlert }) {
  if (alert.kind === "leave") {
    return (
      <div className="flex items-start gap-2 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1.5">
        <CalendarDaysIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
        <p className="text-xs text-[var(--text-1)]">
          <span className="font-medium">{alert.user.name}</span>{" "}
          <span className="text-[var(--text-4)]">
            on leave · {formatDateRange(alert.startDate, alert.endDate)}
          </span>
        </p>
      </div>
    );
  }
  if (alert.kind === "holiday") {
    return (
      <div className="flex items-start gap-2 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1.5">
        <GlobeAltIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[var(--text-1)]">
            <span className="font-medium">{alert.country} holiday</span>{" "}
            <span className="text-[var(--text-4)]">· {alert.name} · {formatDay(alert.date)}</span>
          </p>
          {alert.affectedMembers.length > 0 ? (
            <p className="truncate text-[10px] text-[var(--text-4)]">
              Affects: {alert.affectedMembers.map((m) => m.name).join(", ")}
            </p>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-[6px] border border-red-200 bg-red-50 px-2.5 py-1.5">
      <CalendarDaysIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
      <p className="text-xs text-[var(--text-1)]">
        <span className="font-medium">Conflict</span>{" "}
        <span className="text-[var(--text-4)]">
          · {alert.users.map((u) => u.name).join(" + ")} off on {formatDay(alert.date)}
        </span>
      </p>
    </div>
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
