"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import type { ExpenseDTO } from "@/types/backstage";
import { formatDay, formatMoney } from "@/components/backstage/format";

export function ReceiptViewer({
  expense,
  onClose,
}: {
  expense: ExpenseDTO;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-auto rounded-[10px] bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-2)] px-5 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text-1)]">
              {formatMoney(expense.amount, expense.currency)} · {expense.category.toLowerCase()}
            </p>
            <p className="text-xs text-[var(--text-3)]">
              {expense.vendor ? `${expense.vendor} · ` : ""}
              {formatDay(expense.occurredOn)}
              {expense.receiptResolved ? " · thumbnail (full image dropped on review)" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-[6px] p-1 text-[var(--text-3)] transition hover:bg-[var(--surface-1)]"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="bg-zinc-50 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/backstage/expenses/${expense.id}/receipt`}
            alt="Receipt"
            className="mx-auto max-h-[70vh] w-auto rounded-[6px] border border-[var(--border-2)] bg-white"
          />
        </div>
      </div>
    </div>
  );
}
