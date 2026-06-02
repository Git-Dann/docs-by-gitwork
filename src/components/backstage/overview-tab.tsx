"use client";

import { useLeaveAllowance } from "@/hooks/use-backstage";
import { BackstagePanel } from "@/components/backstage/panel";
import { Stat } from "@/components/backstage/stat";
import { CalendarTab } from "@/components/backstage/calendar-tab";

// Backstage landing dashboard: leave-allowance stat cards on top, the team
// calendar below. Mirrors the HQ bento style — every surface is a widget-card
// with the `NN // SECTION` signature (see DESIGN.md).
export function OverviewTab() {
  const allowance = useLeaveAllowance();

  return (
    <div className="space-y-6">
      <BackstagePanel number="01" title="MY ALLOWANCE">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Allocated" value={allowance.data?.allocated ?? "—"} suffix="days/yr" />
          <Stat label="Used" value={allowance.data?.used ?? "—"} suffix="days" />
          <Stat label="Pending" value={allowance.data?.pending ?? "—"} suffix="days" />
          <Stat label="Remaining" value={allowance.data?.remaining ?? "—"} suffix="days" accent />
        </div>
      </BackstagePanel>

      <CalendarTab number="02" />
    </div>
  );
}
