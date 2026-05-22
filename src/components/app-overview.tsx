"use client";

import PulseWidget from "@/components/dashboard/pulse-widget";
import CodeClearWidget from "@/components/dashboard/codeclear-widget";
import StudyWidget from "@/components/dashboard/study-widget";
import CareWidget from "@/components/dashboard/care-widget";
import ProposalsWidget from "@/components/dashboard/proposals-widget";
import ClientsWidget from "@/components/dashboard/clients-widget";
import GmailWidget from "@/components/dashboard/gmail-widget";
import CalendarWidget from "@/components/dashboard/calendar-widget";
import MeetingSummaryWidget from "@/components/dashboard/meeting-summary-widget";
import ProofWidget from "@/components/dashboard/proof-widget";

export type WidgetSize = { cols: 1 | 2 | 3; rows: 1 | 2 | 3 };

const ROW_HEIGHT = 180;

const GRID: Array<{ component: React.ComponentType<{ size: WidgetSize }>; size: WidgetSize }> = [
  { component: PulseWidget,          size: { cols: 2, rows: 1 } },
  { component: CodeClearWidget,      size: { cols: 1, rows: 1 } },
  { component: StudyWidget,          size: { cols: 1, rows: 1 } },
  { component: CareWidget,           size: { cols: 1, rows: 1 } },
  { component: ProposalsWidget,      size: { cols: 2, rows: 2 } },
  { component: ClientsWidget,        size: { cols: 1, rows: 2 } },
  { component: GmailWidget,          size: { cols: 2, rows: 2 } },
  { component: CalendarWidget,       size: { cols: 1, rows: 2 } },
  { component: MeetingSummaryWidget, size: { cols: 3, rows: 2 } },
  { component: ProofWidget,          size: { cols: 1, rows: 1 } },
];

export function AppOverview() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-[var(--text-1)]">Foundry HQ</h1>
        <p className="text-xs text-[var(--text-4)]">Your workspace at a glance</p>
      </div>

      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: "repeat(3, 1fr)",
          gridAutoRows: ROW_HEIGHT,
          gridAutoFlow: "dense",
        }}
      >
        {GRID.map(({ component: Widget, size }, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-[12px] border border-[var(--border-2)] bg-white p-3 shadow-[var(--shadow-xs)]"
            style={{ gridColumn: `span ${size.cols}`, gridRow: `span ${size.rows}` }}
          >
            <Widget size={size} />
          </div>
        ))}
      </div>
    </div>
  );
}
