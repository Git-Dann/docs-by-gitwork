"use client";

import { useState } from "react";
import { DocumentTextIcon, PhotoIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useExpenses } from "@/hooks/use-backstage";
import { ExpenseForm } from "@/components/backstage/expense-form";
import { StatusPill } from "@/components/backstage/status-pill";
import { ReceiptViewer } from "@/components/backstage/receipt-viewer";
import { BackstagePanel, PanelAction } from "@/components/backstage/panel";
import { formatDay, formatMoney, formatRelative } from "@/components/backstage/format";
import type { ExpenseDTO } from "@/types/backstage";

export function ExpensesTab() {
  const [showForm, setShowForm] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<ExpenseDTO | null>(null);
  const expenses = useExpenses("me");

  return (
    <div className="space-y-6">
      {showForm ? (
        <ExpenseForm
          onSubmitted={() => setShowForm(false)}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      <BackstagePanel
        number="01"
        title="MY EXPENSES"
        bodyClassName="p-0"
        action={
          <PanelAction
            leadingIcon={<PlusIcon className="h-3.5 w-3.5" />}
            onClick={() => setShowForm(true)}
          >
            New expense
          </PanelAction>
        }
      >
        {expenses.isLoading ? (
          <div className="p-6 text-sm text-[var(--text-3)]">Loading…</div>
        ) : (expenses.data ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <DocumentTextIcon className="h-8 w-8 text-[var(--text-4)]" />
            <p className="text-sm text-[var(--text-3)]">No expenses filed yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-2)]">
            {(expenses.data ?? []).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-1)]">
                    {formatMoney(e.amount, e.currency)}{" "}
                    <span className="font-normal text-[var(--text-3)]">
                      · {e.category.toLowerCase()}
                      {e.vendor ? ` · ${e.vendor}` : ""}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-4)]">
                    {formatDay(e.occurredOn)} · filed {formatRelative(e.createdAt)}
                    {e.reviewedBy ? ` · reviewed by ${e.reviewedBy.name}` : null}
                  </p>
                  {e.notes ? (
                    <p className="mt-0.5 text-xs text-[var(--text-3)]">{e.notes}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {e.hasReceipt ? (
                    <button
                      type="button"
                      onClick={() => setViewingReceipt(e)}
                      className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                    >
                      <PhotoIcon className="h-3.5 w-3.5" />
                      Receipt
                    </button>
                  ) : null}
                  <StatusPill status={e.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </BackstagePanel>

      {viewingReceipt ? (
        <ReceiptViewer
          expense={viewingReceipt}
          onClose={() => setViewingReceipt(null)}
        />
      ) : null}
    </div>
  );
}
