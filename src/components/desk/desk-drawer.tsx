"use client";

/**
 * The Desk — a persistent, tabbed pull-up drawer docked at the bottom of the app shell.
 *
 * Internal-only, pure aggregator (no live AI): it reads per-current-user data other
 * modules already own and presents it in one always-available surface. Twilio-Workbench
 * interaction (docked handle → expanded tabbed panel); light Dia-style editorial polish
 * on the Today tab, kept on brand (blue, not yellow).
 *
 * Responsive: desktop expands to an inline bottom panel; mobile expands to a full-height
 * sheet (the shared <Modal>). Open state + last tab persist to localStorage.
 */

import { useEffect, useState } from "react";
import { ChevronUpIcon, ChevronDownIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/format";
import { useMyDay, useTaskAttention } from "@/hooks/use-tasks";
import { DESK_TABS, DESK_TAB_LABELS, type DeskTab } from "@/types/desk";
import { DeskToday } from "./desk-today";
import { DeskTasks } from "./desk-tasks";
import { DeskMeetings } from "./desk-meetings";
import { DeskInbox } from "./desk-inbox";

const STORAGE_KEY = "gitwork.desk.v1";

function useDeskState() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DeskTab>("TODAY");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { open?: boolean; tab?: string };
        if (typeof p.open === "boolean") setOpen(p.open);
        if (p.tab && (DESK_TABS as readonly string[]).includes(p.tab)) setTab(p.tab as DeskTab);
      }
    } catch {
      /* ignore malformed storage */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ open, tab }));
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }, [open, tab, ready]);

  return { open, setOpen, tab, setTab };
}

/** Track the lg breakpoint in JS so we drive the panel-vs-sheet choice from state
 *  (not just CSS) — otherwise the <Modal>'s scroll-lock effect would fire on desktop. */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return isDesktop;
}

export function DeskDrawer() {
  const { open, setOpen, tab, setTab } = useDeskState();
  const isDesktop = useIsDesktop();

  // Light, always-on queries drive the collapsed summary (shared cache with HQ /
  // the tab bodies — no extra Google calls until the drawer is opened).
  const attention = useTaskAttention({ mine: true });
  const myDay = useMyDay();

  const overdue = attention.data?.overdueCount ?? 0;
  const doing = attention.data?.doingCount ?? 0;
  const standupPending =
    myDay.data != null &&
    (!myDay.data.update.amPushedAt || !myDay.data.update.pmPushedAt);

  const summaryParts: string[] = [];
  if (overdue > 0) summaryParts.push(`${overdue} OVERDUE`);
  summaryParts.push(`${doing} DOING`);
  if (standupPending) summaryParts.push("STANDUP PENDING");
  const summary = summaryParts.join("  ·  ");

  const showPanel = open && isDesktop;
  const showSheet = open && !isDesktop;

  return (
    <>
      {/* ── Collapsed dock (both breakpoints) ── */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open The Desk"
          className="fixed bottom-0 left-0 right-0 z-40 flex h-11 items-center justify-between gap-3 border-t border-[var(--border-2)] bg-[var(--surface-0)] px-4 text-left transition hover:bg-[var(--surface-1)] lg:left-[280px]"
        >
          <span
            className="shrink-0 text-[11px] font-medium uppercase tracking-[1.4px] text-[var(--text-2)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            The Desk
          </span>
          <span
            className="min-w-0 flex-1 truncate text-[11px] uppercase tracking-[0.6px] text-[var(--text-4)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {summary}
          </span>
          <ChevronUpIcon className="h-4 w-4 shrink-0 text-[var(--text-4)]" />
        </button>
      )}

      {/* ── Desktop expanded panel ── */}
      {showPanel && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 flex flex-col border-t border-[var(--border-2)] bg-[var(--surface-0)] shadow-[var(--shadow-lg)] lg:left-[280px]"
          style={{ height: "min(60vh, 560px)" }}
          role="region"
          aria-label="The Desk"
        >
          <DeskHeader tab={tab} onSelect={setTab} onClose={() => setOpen(false)} />
          <div className="min-h-0 flex-1 overflow-auto p-5">
            <DeskBody tab={tab} />
          </div>
        </div>
      )}

      {/* ── Mobile full-height sheet ── */}
      <Modal
        open={showSheet}
        onClose={() => setOpen(false)}
        labelledById="desk-sheet-title"
        panelClassName="flex h-[92vh] w-full max-w-none flex-col"
      >
        <DeskHeader
          tab={tab}
          onSelect={setTab}
          onClose={() => setOpen(false)}
          titleId="desk-sheet-title"
        />
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <DeskBody tab={tab} />
        </div>
      </Modal>
    </>
  );
}

function DeskHeader({
  tab,
  onSelect,
  onClose,
  titleId,
}: {
  tab: DeskTab;
  onSelect: (t: DeskTab) => void;
  onClose: () => void;
  titleId?: string;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-4 border-b border-[var(--border-2)] px-4">
      <span
        id={titleId}
        className="hidden shrink-0 text-[11px] font-medium uppercase tracking-[1.4px] text-[var(--text-2)] sm:inline"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        The Desk
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {DESK_TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onSelect(t)}
            className={cn(
              "relative shrink-0 px-2.5 py-1 text-[11px] uppercase tracking-[1px] transition",
              tab === t
                ? "text-[var(--text-1)]"
                : "text-[var(--text-4)] hover:text-[var(--text-2)]",
            )}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {DESK_TAB_LABELS[t]}
            {tab === t ? (
              <span className="absolute inset-x-2 -bottom-[1px] h-[2px] rounded-full bg-[var(--brand-600)]" />
            ) : null}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close The Desk"
        className="shrink-0 text-[var(--text-4)] transition hover:text-[var(--text-1)]"
      >
        <span className="lg:hidden">
          <XMarkIcon className="h-5 w-5" />
        </span>
        <span className="hidden lg:inline">
          <ChevronDownIcon className="h-5 w-5" />
        </span>
      </button>
    </div>
  );
}

function DeskBody({ tab }: { tab: DeskTab }) {
  switch (tab) {
    case "TODAY":
      return <DeskToday />;
    case "TASKS":
      return <DeskTasks />;
    case "MEETINGS":
      return <DeskMeetings />;
    case "INBOX":
      return <DeskInbox />;
    default:
      return null;
  }
}
