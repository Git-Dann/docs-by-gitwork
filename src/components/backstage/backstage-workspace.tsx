"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { BackstageOverview, type BackstageArea } from "@/components/backstage/backstage-overview";
import { LeaveTab } from "@/components/backstage/leave-tab";
import { ExpensesTab } from "@/components/backstage/expenses-tab";
import { ApprovalsTab } from "@/components/backstage/approvals-tab";
import { useBackstageAccess } from "@/components/backstage/access";

const AREA_LABEL: Record<BackstageArea, string> = {
  leave: "Leave",
  expenses: "Expenses",
  approvals: "Approvals",
};

const AREAS = new Set<BackstageArea>(["leave", "expenses", "approvals"]);

export function BackstageWorkspace() {
  const { canManageExpenses, canApprove } = useBackstageAccess();
  const [area, setArea] = useState<BackstageArea | null>(null);

  // `?area=approvals` lets the "requested leave" notification land straight on
  // the queue.
  //
  // Read in an effect rather than via useSearchParams: that hook opts the page
  // out of static prerendering unless it's wrapped in a Suspense boundary, and
  // without one `next build` fails outright on /app/backstage — which is exactly
  // how this shipped broken the first time. Reading after mount also means the
  // server and first client render agree (both the overview), so there's no
  // hydration mismatch. Applied once, so returning to the overview isn't
  // immediately undone by the still-present query param.
  const appliedDeepLink = useRef(false);
  useEffect(() => {
    if (appliedDeepLink.current) return;
    appliedDeepLink.current = true;
    const requested = new URLSearchParams(window.location.search).get("area");
    if (requested && AREAS.has(requested as BackstageArea)) {
      setArea(requested as BackstageArea);
    }
  }, []);

  // Landing: the bento card grid (HQ pattern). Cards open their area.
  if (!area) {
    return <BackstageOverview onOpen={setArea} />;
  }

  // Guard: if a non-permitted area is somehow selected, fall back to overview.
  if ((area === "expenses" && !canManageExpenses) || (area === "approvals" && !canApprove)) {
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
      {area === "approvals" ? <ApprovalsTab /> : null}
    </div>
  );
}
