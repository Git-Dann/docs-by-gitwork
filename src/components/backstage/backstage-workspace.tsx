"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/format";
import { LeaveTab } from "@/components/backstage/leave-tab";
import { ExpensesTab } from "@/components/backstage/expenses-tab";
import { ApprovalsTab } from "@/components/backstage/approvals-tab";

type Tab = "leave" | "expenses" | "approvals";

export function BackstageWorkspace() {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "STAFF";
  const permissions = (session?.user?.permissions as string[] | undefined) ?? [];
  const canApprove = role === "ADMIN" || permissions.includes("backstage.approve");

  const [tab, setTab] = useState<Tab>("leave");

  const tabs: Array<{ key: Tab; label: string; visible: boolean }> = [
    { key: "leave", label: "Leave", visible: true },
    { key: "expenses", label: "Expenses", visible: true },
    { key: "approvals", label: "Approvals", visible: canApprove },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-1 border-b border-[var(--border-2)]">
        {tabs.filter((t) => t.visible).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 -mb-px border-b-2 text-sm font-medium transition",
              tab === t.key
                ? "border-[var(--brand-600)] text-[var(--brand-800)]"
                : "border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0">
        {tab === "leave" ? <LeaveTab /> : null}
        {tab === "expenses" ? <ExpensesTab /> : null}
        {tab === "approvals" && canApprove ? <ApprovalsTab /> : null}
      </div>
    </div>
  );
}
