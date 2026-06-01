"use client";

import { useState } from "react";
import {
  useBackstageTeam,
  useCreateLeaveRequest,
  useUpdateLeaveRequest,
} from "@/hooks/use-backstage";
import { useBackstageAccess } from "@/components/backstage/access";
import { BackstagePanel } from "@/components/backstage/panel";
import type { LeaveRequestDTO, LeaveType } from "@/types/backstage";

const LEAVE_TYPES: Array<{ value: LeaveType; label: string }> = [
  { value: "ANNUAL", label: "Annual leave" },
  { value: "SICK", label: "Sick leave" },
  { value: "UNPAID", label: "Unpaid leave" },
  { value: "OTHER", label: "Other" },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LeaveRequestForm({
  editing,
  onSubmitted,
  onCancel,
}: {
  editing?: LeaveRequestDTO;
  onSubmitted: () => void;
  onCancel: () => void;
}) {
  const create = useCreateLeaveRequest();
  const update = useUpdateLeaveRequest();
  const { canApprove, userId } = useBackstageAccess();
  const team = useBackstageTeam();

  const isEdit = Boolean(editing);
  const [forUserId, setForUserId] = useState<string>(editing?.user.id ?? userId ?? "");
  const [type, setType] = useState<LeaveType>(editing?.type ?? "ANNUAL");
  const [startDate, setStartDate] = useState(editing?.startDate.slice(0, 10) ?? todayISO());
  const [endDate, setEndDate] = useState(editing?.endDate.slice(0, 10) ?? todayISO());
  const [halfDayStart, setHalfDayStart] = useState(editing?.halfDayStart ?? false);
  const [halfDayEnd, setHalfDayEnd] = useState(editing?.halfDayEnd ?? false);
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [error, setError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;
  // The "For" picker only matters when an approver files a NEW request for someone else.
  const showMemberPicker = canApprove && !isEdit;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (new Date(endDate) < new Date(startDate)) {
      setError("End date must be on or after start date.");
      return;
    }
    try {
      if (isEdit && editing) {
        await update.mutateAsync({
          id: editing.id,
          input: { type, startDate, endDate, halfDayStart, halfDayEnd, reason: reason.trim() || undefined },
        });
      } else {
        await create.mutateAsync({
          type,
          startDate,
          endDate,
          halfDayStart,
          halfDayEnd,
          reason: reason.trim() || undefined,
          // Only send userId when filing on behalf of someone else.
          userId: forUserId && forUserId !== userId ? forUserId : undefined,
        });
      }
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    }
  }

  return (
    <BackstagePanel title={isEdit ? "EDIT LEAVE" : "NEW LEAVE REQUEST"}>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {showMemberPicker ? (
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-[var(--text-2)]">For</span>
              <select
                value={forUserId}
                onChange={(e) => setForUserId(e.target.value)}
                className="app-input mt-1 block w-full"
              >
                {(team.data ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.id === userId ? " (me)" : ""}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-[var(--text-4)]">
                As an approver you can file leave on behalf of any team member.
              </span>
            </label>
          ) : isEdit && editing ? (
            <p className="text-sm text-[var(--text-3)] sm:col-span-2">
              Editing leave for <span className="font-medium text-[var(--text-1)]">{editing.user.name}</span>
            </p>
          ) : null}

          <label className="block">
            <span className="text-sm font-medium text-[var(--text-2)]">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as LeaveType)}
              className="app-input mt-1 block w-full"
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-sm font-medium text-[var(--text-2)]">Start</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="app-input mt-1 block w-full"
              />
              <label className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-3)]">
                <input
                  type="checkbox"
                  checked={halfDayStart}
                  onChange={(e) => setHalfDayStart(e.target.checked)}
                />
                Half day
              </label>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-[var(--text-2)]">End</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="app-input mt-1 block w-full"
              />
              <label className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-3)]">
                <input
                  type="checkbox"
                  checked={halfDayEnd}
                  onChange={(e) => setHalfDayEnd(e.target.checked)}
                />
                Half day
              </label>
            </label>
          </div>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-[var(--text-2)]">
              Reason <span className="text-[var(--text-4)]">(optional)</span>
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              className="app-input mt-1 block w-full"
              placeholder="Family commitment, conference, etc."
            />
          </label>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-[6px] bg-[var(--brand-600)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--brand-700)] disabled:opacity-60"
          >
            {pending ? "Saving…" : isEdit ? "Save changes" : "Submit request"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[6px] border border-[var(--border-2)] px-4 py-2 text-sm font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
          >
            Cancel
          </button>
        </div>
      </form>
    </BackstagePanel>
  );
}
