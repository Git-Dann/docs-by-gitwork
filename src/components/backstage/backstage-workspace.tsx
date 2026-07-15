"use client";

import { useState } from "react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { BackstageOverview, type BackstageArea } from "@/components/backstage/backstage-overview";
import { LeaveTab } from "@/components/backstage/leave-tab";
import { ExpensesTab } from "@/components/backstage/expenses-tab";
import { useBackstageAccess } from "@/components/backstage/access";

const AREA_LABEL: Record<BackstageArea, string> = {
  leave: "Leave",
  expenses: "Expenses",
};

export function BackstageWorkspace() {
  const { canManageExpenses } = useBackstageAccess();
  const [area, setArea] = useState<BackstageArea | null>(null);

  // Landing: the bento card grid (HQ pattern). Cards open their area.
  if (!area) {
    return <BackstageOverview onOpen={setArea} />;
  }

  // Guard: if a non-permitted area is somehow selected, fall back to overview.
  if (area === "expenses" && !canManageExpenses) {
    setArea(null);
    return null;
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setArea(null)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-3)] transition hover:text-[var(--text-1)]"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Backstage
        <span className="text-[var(--text-4)]">/ {AREA_LABEL[area]}</span>
      </button>

      {area === "leave" ? <LeaveTab /> : null}
      {area === "expenses" ? <ExpensesTab /> : null}
    </div>
  );
}
