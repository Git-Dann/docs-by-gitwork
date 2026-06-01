"use client";

import { useState } from "react";
import { cn } from "@/lib/format";
import { CalendarTab } from "@/components/backstage/calendar-tab";
import { LeaveTab } from "@/components/backstage/leave-tab";
import { ExpensesTab } from "@/components/backstage/expenses-tab";
import { ApprovalsTab } from "@/components/backstage/approvals-tab";
import { useBackstageAccess } from "@/components/backstage/access";

type Tab = "calendar" | "leave" | "expenses" | "approvals";

export function BackstageWorkspace() {
  const { canApprove, canManageExpenses } = useBackstageAccess();

  const [tab, setTab] = useState<Tab>("calendar");

  const tabs: Array<{ key: Tab; label: string; visible: boolean }> = [
    { key: "calendar", label: "Calendar", visible: true },
    { key: "leave", label: "Leave", visible: true },
    { key: "expenses", label: "Expenses", visible: canManageExpenses },
    { key: "approvals", label: "Approvals", visible: canApprove },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-[var(--border-2)]">
        <nav className="-mb-px flex flex-wrap gap-0">
          {tabs.filter((t) => t.visible).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "px-4 pb-3 pt-1 text-sm font-semibold transition",
                tab === t.key
                  ? "border-b-2 border-[var(--brand-600)] text-[var(--brand-700)]"
                  : "border-b-2 border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-h-0">
        {tab === "calendar" ? <CalendarTab /> : null}
        {tab === "leave" ? <LeaveTab /> : null}
        {tab === "expenses" && canManageExpenses ? <ExpensesTab /> : null}
        {tab === "approvals" && canApprove ? <ApprovalsTab /> : null}
      </div>
    </div>
  );
}
