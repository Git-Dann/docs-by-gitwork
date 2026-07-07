"use client";

/**
 * On Your Desk — a persistent, tabbed pull-up drawer docked at the bottom of the app shell.
 *
 * Internal-only, pure aggregator (no live AI): it reads per-current-user data other
 * modules already own and presents it in one always-available surface. Twilio-Workbench
 * interaction (docked handle → expanded tabbed panel) with Dia-style editorial polish
 * (serif masthead, italic section rails, a hand-lettered stamp), kept on brand (blue).
 *
 * Responsive: desktop expands to an inline bottom panel; mobile expands to a full-height
 * sheet (the shared <Modal>). Open state + last tab persist to localStorage.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/format";
import { useMyDay, useTaskAttention } from "@/hooks/use-tasks";
import { useUnreadCount } from "@/hooks/use-notifications";
import { usePermissions } from "@/hooks/use-permissions";
import { DeskHandle } from "./desk-shared";
import { DESK_TABS, DESK_TAB_LABELS, type DeskTab } from "@/types/desk";
import { DeskToday } from "./desk-today";
import { DeskTasks } from "./desk-tasks";
import { DeskMeetings } from "./desk-meetings";
import { DeskInbox } from "./desk-inbox";
import { DeskAlerts } from "./desk-alerts";
import { DeskRemindersMenu } from "./desk-reminders-menu";

const STORAGE_KEY = "gitwork.desk.v1"; // localStorage: remembers the last tab long-term
const OPEN_KEY = "gitwork.desk.open.v1"; // sessionStorage: open state, per browser session
const WORDMARK = "On Your Desk";

function useDeskState() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DeskTab>("TODAY");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      // Tab preference persists long-term.
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { tab?: string };
        if (p.tab && (DESK_TABS as readonly string[]).includes(p.tab)) setTab(p.tab as DeskTab);
      }
      // Open state is per-session (sessionStorage), so a fresh visit to Foundry always
      // starts CLOSED — it only stays open while you move around within one session.
      if (sessionStorage.getItem(OPEN_KEY) === "1") setOpen(true);
    } catch {
      /* ignore malformed / unavailable storage */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ tab }));
      sessionStorage.setItem(OPEN_KEY, open ? "1" : "0");
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

  // Collapse the drawer whenever the user navigates to another section, so it
  // never lingers open over an unrelated page. The first render is skipped so a
  // refresh (same path) still honours the restored-open state from sessionStorage.
  const pathname = usePathname();
  const firstNav = useRef(true);
  useEffect(() => {
    if (firstNav.current) {
      firstNav.current = false;
      return;
    }
    setOpen(false);
  }, [pathname, setOpen]);

  // ⌘J / Ctrl+J toggles the drawer from anywhere (⌘J is unused in macOS browsers).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  // Standup is a developer/staff workflow — admins & super-admins don't push one,
  // so don't nag them about it (or surface it in the summary).
  const { isAdminOrAbove } = usePermissions();
  const showStandup = !isAdminOrAbove;

  // Light, always-on queries drive the collapsed summary (shared cache with HQ /
  // the tab bodies — no extra Google calls until the drawer is opened).
  const attention = useTaskAttention({ mine: true });
  const myDay = useMyDay(undefined, { enabled: showStandup });
  const unread = useUnreadCount();

  const overdue = attention.data?.overdueCount ?? 0;
  const doing = attention.data?.doingCount ?? 0;
  const unreadCount = unread.data ?? 0;
  const standupPending =
    showStandup &&
    myDay.data != null &&
    (!myDay.data.update.amPushedAt || !myDay.data.update.pmPushedAt);

  const summaryParts: string[] = [];
  if (unreadCount > 0) summaryParts.push(`${unreadCount} UNREAD`);
  if (overdue > 0) summaryParts.push(`${overdue} OVERDUE`);
  summaryParts.push(`${doing} DOING`);
  if (standupPending) summaryParts.push("STANDUP PENDING");
  const summary = summaryParts.join("  ·  ");

  const showPanel = open && isDesktop;
  const showSheet = open && !isDesktop;

  return (
    <>
      {/* ── Collapsed dock (both breakpoints) — click anywhere (incl. the grab handle) to open ── */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Open ${WORDMARK}`}
          className="group fixed bottom-0 left-0 right-0 z-40 flex h-12 items-center justify-between gap-3 border-t border-[var(--border-2)] bg-[var(--surface-0)] px-5 text-left shadow-[0_-4px_16px_-8px_rgba(10,13,18,0.15)] transition hover:bg-[var(--surface-canvas)] lg:left-[280px]"
        >
          {/* grab handle */}
          <span className="absolute left-1/2 top-1.5 h-1 w-10 origin-center -translate-x-1/2 transform-gpu rounded-full bg-[var(--border-1)] transition-all duration-300 ease-out group-hover:scale-x-[1.4] group-hover:bg-[var(--brand-500)] motion-reduce:transition-none" />
          <span className="flex shrink-0 items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-600)]" />
            <span
              className="text-[12px] font-medium uppercase tracking-[1.6px] text-[var(--text-2)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {WORDMARK}
            </span>
          </span>
          <span
            className="min-w-0 flex-1 truncate text-right text-[11px] uppercase tracking-[0.6px] text-[var(--text-4)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {summary}
          </span>
        </button>
      )}

      {/* ── Desktop expanded panel ── */}
      {showPanel && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 flex flex-col border-t border-[var(--border-2)] bg-[var(--surface-canvas)] shadow-[0_-16px_40px_-12px_rgba(10,13,18,0.22)] lg:left-[280px]"
          style={{ height: "min(66vh, 640px)" }}
          role="region"
          aria-label={WORDMARK}
        >
          <DeskHandle onClick={() => setOpen(false)} label={`Close ${WORDMARK}`} />
          <DeskHeader tab={tab} onSelect={setTab} onClose={() => setOpen(false)} />
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="mx-auto max-w-5xl px-6 py-2">
              <DeskBody tab={tab} onNavigate={setTab} />
              <DeskFooter />
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile full-height sheet ── */}
      <Modal
        open={showSheet}
        onClose={() => setOpen(false)}
        labelledById="desk-sheet-title"
        panelClassName="flex h-[92vh] w-full max-w-none flex-col bg-[var(--surface-canvas)]"
      >
        <DeskHandle onClick={() => setOpen(false)} label={`Close ${WORDMARK}`} />
        <DeskHeader
          tab={tab}
          onSelect={setTab}
          onClose={() => setOpen(false)}
          titleId="desk-sheet-title"
        />
        <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
          <DeskBody tab={tab} onNavigate={setTab} />
          <DeskFooter />
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
    <div className="flex h-12 shrink-0 items-center gap-4 border-b border-[var(--border-2)] bg-[var(--surface-0)] px-5">
      <span
        id={titleId}
        className="hidden shrink-0 items-center gap-2 sm:flex"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-600)]" />
        <span
          className="text-[12px] font-medium uppercase tracking-[1.6px] text-[var(--text-2)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {WORDMARK}
        </span>
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-0.5 sm:justify-start sm:gap-1">
        {DESK_TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onSelect(t)}
            className={cn(
              "relative shrink-0 px-1 py-1 text-[11px] uppercase tracking-normal transition sm:px-2.5 sm:tracking-[1px]",
              tab === t ? "text-[var(--text-1)]" : "text-[var(--text-4)] hover:text-[var(--text-2)]",
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
      {/* Your personal clipboard — the daily to-dos you set yourself. Slack /desk
          items are kept out of here (they surface in "Needs you today" instead). */}
      <DeskRemindersMenu />
      {/* Mobile keeps an explicit close (X); desktop closes via the grab handle. */}
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close ${WORDMARK}`}
        className="shrink-0 text-[var(--text-4)] transition hover:text-[var(--text-1)] lg:hidden"
      >
        <XMarkIcon className="h-5 w-5" />
      </button>
    </div>
  );
}

function DeskFooter() {
  return (
    <div className="mt-4 border-t border-[var(--border-2)] py-4 text-center">
      <p
        className="text-[11px] tracking-[0.3px] text-[var(--text-4)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {WORDMARK} — your tasks, meetings &amp; mail, in one place.
      </p>
    </div>
  );
}

function DeskBody({ tab, onNavigate }: { tab: DeskTab; onNavigate: (t: DeskTab) => void }) {
  switch (tab) {
    case "TODAY":
      return <DeskToday onNavigate={onNavigate} />;
    case "TASKS":
      return <DeskTasks />;
    case "MEETINGS":
      return <DeskMeetings />;
    case "INBOX":
      return <DeskInbox />;
    case "ALERTS":
      return <DeskAlerts />;
    default:
      return null;
  }
}
