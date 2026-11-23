"use client";

/**
 * The "Needs you" inbox (/app/inbox, §151): every item HQ's card ranks, with filters by source
 * and severity, the person's own snoozed and dismissed items one switch away, and the keyboard:
 *
 *   j / k  move    ↵  open    e  deal with (the source's own way, else dismiss)    s  snooze
 *
 * Same data, same rules and same actions as the card (src/lib/needs-you.ts,
 * src/components/needs-you/needs-you-row.tsx). Nothing is acted on without a key or a click.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { useNeedsYou } from "@/hooks/use-desk";
import { useNeedsYouActions } from "@/hooks/use-needs-you";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/motion/skeleton";
import { NeedsYouRow } from "@/components/needs-you/needs-you-row";
import {
  NEEDS_YOU_SOURCES,
  SEVERITY_LABEL,
  SOURCE_LABEL,
  allClearLine,
  countInbox,
  filterInbox,
  holdChoices,
  resolveChoice,
  snoozePresets,
  type InboxView,
  type NeedsYouSeverity,
  type NeedsYouSource,
} from "@/lib/needs-you";

const VIEWS: InboxView[] = ["open", "snoozed", "dismissed"];
const VIEW_LABEL: Record<InboxView, string> = { open: "Open", snoozed: "Snoozed", dismissed: "Dismissed" };
const SEVERITIES: NeedsYouSeverity[] = ["critical", "warn", "info"];

function readView(v: string | null): InboxView {
  return v && (VIEWS as string[]).includes(v) ? (v as InboxView) : "open";
}

export function NeedsYouInbox() {
  const query = useNeedsYou();
  const router = useRouter();
  const params = useSearchParams();
  const { run, dismiss, snooze } = useNeedsYouActions();
  const [view, setView] = useState<InboxView>(() => readView(params?.get("view") ?? null));
  const [source, setSource] = useState<NeedsYouSource | "">("");
  const [severity, setSeverity] = useState<NeedsYouSeverity | "">("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const data = query.data;
  const now = useMemo(() => new Date(), [data?.readAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = useMemo(() => data?.items ?? [], [data]);
  const counts = countInbox(all);
  const items = useMemo(
    () => filterInbox(all, { view, source: source || null, severity: severity || null }),
    [all, view, source, severity],
  );
  const sourcesShown = NEEDS_YOU_SOURCES.filter((s) => data?.checked.includes(s) || all.some((i) => i.source === s));

  // Keep the cursor on a real row as the list changes under it (a row dealt with leaves).
  useEffect(() => {
    setCursor((c) => Math.max(0, Math.min(c, items.length - 1)));
  }, [items.length]);

  const focusRow = useCallback((i: number) => {
    const el = listRef.current?.querySelectorAll<HTMLElement>("[data-inbox-row]")[i];
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      // Never hijack typing, and leave dialogs and menus their own keys.
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (el?.closest("[role=dialog],[role=menu]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (items.length === 0) return;
      const item = items[cursor];
      const move = (d: number) => {
        e.preventDefault();
        const next = Math.max(0, Math.min(items.length - 1, cursor + d));
        setCursor(next);
        focusRow(next);
      };
      switch (e.key) {
        case "j":
        case "ArrowDown":
          return move(1);
        case "k":
        case "ArrowUp":
          return move(-1);
        case "Enter":
          if (item && el?.tagName !== "A" && el?.tagName !== "BUTTON") {
            e.preventDefault();
            router.push(item.href);
          }
          return;
        case "e": {
          if (!item || item.hold) return;
          const choice = resolveChoice(item);
          if (!choice) return;
          e.preventDefault();
          if (choice === "dismiss") void dismiss(item);
          else void run(item, choice);
          return;
        }
        case "s": {
          if (!item || item.hold || !holdChoices(item).snooze) return;
          e.preventDefault();
          const tomorrow = snoozePresets(new Date()).find((p) => p.id === "tomorrow")!;
          void snooze(item, tomorrow.until, tomorrow.label);
          return;
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, cursor, focusRow, router, run, dismiss, snooze]);

  if (query.isPending) {
    return (
      <section className="widget-card">
        <div className="widget-header shrink-0">
          <span className="widget-header__label">
            <span className="widget-header__label--number">01</span>{" // Inbox"}
          </span>
        </div>
        <div className="space-y-2 p-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-2/3" />
        </div>
      </section>
    );
  }

  if (query.isError || !data) {
    return (
      <section className="widget-card p-5 text-sm text-[var(--text-2)]">
        Couldn&apos;t load your inbox just now. {(query.error as Error | null)?.message ?? ""}
      </section>
    );
  }

  const critical = counts.open > 0 ? all.filter((i) => !i.hold && i.severity === "critical").length : 0;
  const status = counts.open === 0 ? "All clear" : critical > 0 ? `${critical} urgent · ${counts.open} open` : `${counts.open} open`;

  return (
    <div className="space-y-4">
      <section className="widget-card" aria-label="Inbox">
        <div className="widget-header shrink-0">
          <span className="widget-header__label">
            <span className="widget-header__label--number">01</span>{" // Inbox"}
          </span>
          <span
            className={cn(
              "widget-header__status truncate",
              counts.open === 0 ? "text-[var(--success-500)]" : critical > 0 ? "text-[var(--danger-500)]" : "text-[var(--warning-500)]",
            )}
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {status}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-1)] px-4 py-3">
          <Segmented
            label="Show"
            value={view}
            onChange={(v) => {
              setView(v);
              setCursor(0);
            }}
            options={VIEWS.map((v) => ({ value: v, label: VIEW_LABEL[v], count: counts[v] }))}
          />
          <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
            <select
              aria-label="Source"
              className="app-select app-select-chevron min-w-0 flex-1 pr-9 sm:w-auto sm:flex-none"
              value={source}
              onChange={(e) => {
                setSource(e.target.value as NeedsYouSource | "");
                setCursor(0);
              }}
            >
              <option value="">Every source</option>
              {sourcesShown.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </select>
            <select
              aria-label="Severity"
              className="app-select app-select-chevron min-w-0 flex-1 pr-9 sm:w-auto sm:flex-none"
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value as NeedsYouSeverity | "");
                setCursor(0);
              }}
            >
              <option value="">Any severity</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {items.length === 0 ? (
          <Empty view={view} filtered={Boolean(source || severity)} line={allClearLine(data.checked)} />
        ) : (
          <ul ref={listRef} className="divide-y divide-[var(--border-1)]">
            {items.map((item, i) => (
              <li key={item.id} data-inbox-row onMouseDown={() => setCursor(i)}>
                <NeedsYouRow item={item} now={now} active={i === cursor} />
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-[var(--border-1)] px-4 py-2.5 text-[11px] text-[var(--text-4)]">
          <span className="hidden sm:inline" style={{ fontFamily: "var(--font-mono)" }}>
            J / K MOVE · ↵ OPEN · E DEAL WITH · S SNOOZE TILL TOMORROW
          </span>
          {data.failed.length > 0 ? (
            <span className="block text-xs text-[var(--text-2)] sm:mt-1">
              Couldn&apos;t check {data.failed.map((s) => SOURCE_LABEL[s]).join(", ")} just now, so this list may be missing things from there.
            </span>
          ) : null}
        </div>
      </section>

      <section className="widget-card" aria-label="What was checked">
        <div className="widget-header shrink-0">
          <span className="widget-header__label">
            <span className="widget-header__label--number">02</span>{" // What was checked"}
          </span>
          <span className="widget-header__status" style={{ fontFamily: "var(--font-mono)" }}>
            {new Date(data.readAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <ul className="grid grid-cols-1 gap-px bg-[var(--border-1)] sm:grid-cols-2 lg:grid-cols-4">
          {sourcesShown.map((s) => {
            const n = all.filter((i) => i.source === s && i.hold === null).length;
            const failed = data.failed.includes(s);
            return (
              <li key={s} className="bg-[var(--surface-0)]">
                <button
                  type="button"
                  onClick={() => {
                    setSource(source === s ? "" : s);
                    setView("open");
                    setCursor(0);
                  }}
                  aria-pressed={source === s}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-1)]",
                    source === s && "bg-[var(--surface-1)]",
                  )}
                >
                  <span className="text-sm text-[var(--text-2)]">{SOURCE_LABEL[s]}</span>
                  <span
                    className={cn("text-[11px] uppercase tracking-[0.1em]", failed ? "text-[var(--danger-500)]" : n > 0 ? "text-[var(--text-1)]" : "text-[var(--text-4)]")}
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {failed ? "Couldn't check" : n > 0 ? `${n} open` : "Clear"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Empty({ view, filtered, line }: { view: InboxView; filtered: boolean; line: string }) {
  const text =
    view === "snoozed"
      ? "Nothing snoozed."
      : view === "dismissed"
        ? "Nothing dismissed."
        : filtered
          ? "Nothing here with these filters."
          : line;
  return (
    <div className="flex items-center gap-3 px-4 py-6">
      {view === "open" && !filtered ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--success-50)] text-[var(--success-500)]">
          <CheckIcon className="h-4 w-4" strokeWidth={2.5} />
        </span>
      ) : null}
      <p className="text-sm text-[var(--text-2)]">{text}</p>
    </div>
  );
}
