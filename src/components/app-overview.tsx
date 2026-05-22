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

const GRID: Array<{
  component: React.ComponentType<{ size: WidgetSize }>;
  size: WidgetSize;
  label: string;
}> = [
  { component: PulseWidget,          size: { cols: 2, rows: 1 }, label: "Pulse" },
  { component: CodeClearWidget,      size: { cols: 1, rows: 1 }, label: "Code" },
  { component: StudyWidget,          size: { cols: 1, rows: 1 }, label: "Study" },
  { component: CareWidget,           size: { cols: 1, rows: 1 }, label: "Care" },
  { component: ProposalsWidget,      size: { cols: 2, rows: 2 }, label: "Docs" },
  { component: ClientsWidget,        size: { cols: 1, rows: 2 }, label: "Portal" },
  { component: GmailWidget,          size: { cols: 2, rows: 2 }, label: "Gmail" },
  { component: CalendarWidget,       size: { cols: 1, rows: 2 }, label: "Calendar" },
  { component: MeetingSummaryWidget, size: { cols: 3, rows: 2 }, label: "Meetings" },
  { component: ProofWidget,          size: { cols: 1, rows: 1 }, label: "Proof" },
];

// ─── Signature header — THE SIGNATURE ────────────────────────────────────────
// 36px monospace header row per the Foundry design system

function WidgetSignatureHeader({ slot, label }: { slot: number; label: string }) {
  return (
    <div
      style={{
        height: 36,
        padding: "0 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#FAFAF9",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "1.2px",
          color: "#94A3B8",
          textTransform: "uppercase",
        }}
      >
        {`${String(slot).padStart(2, "0")} // ${label.toUpperCase()}`}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.8px",
          color: "#16A34A",
          textTransform: "uppercase",
        }}
      >
        LIVE
      </span>
    </div>
  );
}

export function AppOverview() {
  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: "repeat(3, 1fr)",
        gridAutoRows: ROW_HEIGHT,
        gridAutoFlow: "dense",
      }}
    >
      {GRID.map(({ component: Widget, size, label }, i) => (
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white"
          style={{ gridColumn: `span ${size.cols}`, gridRow: `span ${size.rows}` }}
        >
          <WidgetSignatureHeader slot={i + 1} label={label} />
          <div className="min-h-0 flex-1 overflow-hidden p-3">
            <Widget size={size} />
          </div>
        </div>
      ))}
    </div>
  );
}
