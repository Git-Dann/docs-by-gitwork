"use client";

import PulseWidget from "@/components/dashboard/pulse-widget";
import CodeClearWidget from "@/components/dashboard/codeclear-widget";
import StudyWidget from "@/components/dashboard/study-widget";
import CareWidget from "@/components/dashboard/care-widget";
import BackstageWidget from "@/components/dashboard/backstage-widget";
import ProposalsWidget from "@/components/dashboard/proposals-widget";
import ClientsWidget from "@/components/dashboard/clients-widget";
import GmailWidget from "@/components/dashboard/gmail-widget";
import CalendarWidget from "@/components/dashboard/calendar-widget";

export type WidgetSize = "sm" | "md" | "lg";

type GridEntry = {
  component: React.ComponentType<{ size: WidgetSize }>;
  cols: 1 | 2 | 3;
  rows: 1 | 2 | 3;
  size: WidgetSize;
};

const ROW_HEIGHT = 220;

const GRID: GridEntry[] = [
  { component: PulseWidget,     cols: 2, rows: 1, size: "md" },
  { component: CodeClearWidget, cols: 1, rows: 1, size: "sm" },
  { component: StudyWidget,     cols: 1, rows: 1, size: "sm" },
  { component: CareWidget,      cols: 1, rows: 1, size: "sm" },
  { component: BackstageWidget, cols: 1, rows: 1, size: "sm" },
  { component: ProposalsWidget, cols: 2, rows: 2, size: "lg" },
  { component: ClientsWidget,   cols: 1, rows: 2, size: "md" },
  { component: GmailWidget,     cols: 1, rows: 2, size: "md" },
  { component: CalendarWidget,  cols: 2, rows: 2, size: "lg" },
];

export function AppOverview() {
  return (
    <div className="space-y-4">
      {/* Title hidden on mobile — AppShell already shows it in the mobile top bar */}
      <div className="hidden lg:block">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-1)]">Foundry HQ</h1>
        <p className="text-sm text-[var(--text-3)]">Your workspace at a glance</p>
      </div>

      {/*
        Mobile: flex-col — widgets stack vertically, minHeight gives each sensible space.
        lg+: grid kicks in with the 3-col layout and fixed row heights.
      */}
      <div
        className="flex flex-col gap-3 lg:grid lg:gap-3"
        style={{
          gridTemplateColumns: "repeat(3, 1fr)",
          gridAutoRows: `${ROW_HEIGHT}px`,
          gridAutoFlow: "dense",
        }}
      >
        {GRID.map(({ component: Widget, cols, rows, size }, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white"
            style={{
              gridColumn: `span ${cols}`,
              gridRow: `span ${rows}`,
              minHeight: rows === 1 ? ROW_HEIGHT : ROW_HEIGHT * rows + (rows - 1) * 12,
            }}
          >
            <Widget size={size} />
          </div>
        ))}
      </div>
    </div>
  );
}
