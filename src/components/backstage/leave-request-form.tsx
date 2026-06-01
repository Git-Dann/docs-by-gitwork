"use client";

import { useState } from "react";
import { useCreateLeaveRequest } from "@/hooks/use-backstage";
import type { LeaveType } from "@/types/backstage";

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
  onSubmitted,
  onCancel,
}: {
  onSubmitted: () => void;
  onCancel: () => void;
}) {
  const create = useCreateLeaveRequest();
  const [type, setType] = useState<LeaveType>("ANNUAL");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [halfDayStart, setHalfDayStart] = useState(false);
  const [halfDayEnd, setHalfDayEnd] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (new Date(endDate) < new Date(startDate)) {
      setError("End date must be on or after start date.");
      return;
    }
    try {
      await create.mutateAsync({
        type,
        startDate,
        endDate,
        halfDayStart,
        halfDayEnd,
        reason: reason.trim() || undefined,
      });
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[10px] border border-[var(--border-2)] bg-white p-5 shadow-[var(--shadow-xs)]"
    >
      <h3 className="text-base font-semibold text-[var(--text-1)]">New leave request</h3>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-[var(--text-2)]">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as LeaveType)}
            className="mt-1 block w-full rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)]"
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
              className="mt-1 block w-full rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)]"
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
              className="mt-1 block w-full rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)]"
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
            className="mt-1 block w-full rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)]"
            placeholder="Family commitment, conference, etc."
          />
        </label>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      ) : null}

      <div className="mt-5 flex items-center gap-2">
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-[6px] bg-[var(--brand-600)] px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-xs)] transition hover:bg-[var(--brand-700)] disabled:opacity-60"
        >
          {create.isPending ? "Submitting…" : "Submit request"}
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
  );
}
