"use client";

/**
 * HQ's "Needs you": one line per source (§157), opening out in place, from one inbox of what every watcher found (outages, slipping
 * delivery, suggested commitments, customers waiting, new client requests, stalled documents,
 * Pulse regressions). Rules in src/lib/needs-you.ts; the full list, filters and keyboard live
 * at /app/inbox (§151).
 *
 * Each row can be acted on in place, through the source's own route, with only the actions that
 * person's own page would offer. Snooze and dismiss are the person's own and kept on the server,
 * so they follow them between browsers; an item comes back early if it gets worse, and an outage
 * can't be snoozed at all.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRightIcon, CheckIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { StatusDot } from "@/components/ui/motion/status-dot";
import { useNeedsYou } from "@/hooks/use-desk";
import { TileHeader } from "@/components/dashboard/tile-header";
import { Skeleton } from "@/components/ui/motion/skeleton";
import { NeedsYouLine } from "@/components/needs-you/needs-you-row";
import {
  LEGACY_HIDDEN_KEY,
  SEVERITY_LABEL,
  SOURCE_LABEL,
  allClearLine,
  countInbox,
  groupBySource,
  groupHeadline,
  groupNames,
  type NeedsYouGroup,
  type NeedsYouSource,
} from "@/lib/needs-you";

const MONO = { fontFamily: "var(--font-mono)" } as const;

/** The inbox page for where we are (the demo has its own). */
export function useInboxHref(): string {
  const pathname = usePathname() ?? "";
  return pathname.startsWith("/demo") ? "/demo/inbox" : "/app/inbox";
}

export function NeedsYouCard({ index, onVisibilityChange }: { index: number; onVisibilityChange?: (visible: boolean) => void }) {
  const query = useNeedsYou();
  const reduce = useReducedMotion();
  const inboxHref = useInboxHref();
  // Which sources are opened out. Urgent ones start open; the rest stay one line each.
  const [opened, setOpened] = useState<Set<NeedsYouSource> | null>(null);

  // The old browser-only hide list is replaced by snoozes kept on the server. Clear it once.
  useEffect(() => {
    try {
      window.localStorage.removeItem(LEGACY_HIDDEN_KEY);
    } catch {
      // Storage blocked: nothing to clear.
    }
  }, []);

  const data = query.data;
  const visible = Boolean(data && (data.checked.length > 0 || data.failed.length > 0));
  useEffect(() => onVisibilityChange?.(visible || query.isPending), [visible, query.isPending, onVisibilityChange]);

  const now = useMemo(() => new Date(), [data?.readAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = useMemo(() => (data?.items ?? []).filter((i) => i.hold === null), [data]);
  const groups = useMemo(() => groupBySource(open), [open]);

  if (query.isPending) {
    return (
      <section className="widget-card" data-hq-card>
        <TileHeader index={index} label="Needs you" />
        <div className="space-y-2 p-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      </section>
    );
  }
  if (!data || !visible) return null;

  const counts = countInbox(data.items);
  const held = counts.snoozed + counts.dismissed;
  const critical = open.filter((i) => i.severity === "critical").length;
  const status =
    open.length === 0 ? "All clear" : critical > 0 ? `${critical} urgent · ${open.length} in all` : `${open.length} to look at`;
  const isOpen = (g: NeedsYouGroup) => (opened ? opened.has(g.source) : g.severity === "critical" && g.items.length <= 3);
  const toggle = (g: NeedsYouGroup) =>
    setOpened((prev) => {
      const next = new Set(prev ?? groups.filter(isOpen).map((x) => x.source));
      if (next.has(g.source)) next.delete(g.source);
      else next.add(g.source);
      return next;
    });

  return (
    <section className="widget-card" data-hq-card aria-label="Needs you">
      <TileHeader
        index={index}
        label="Needs you"
        status={status}
        statusTone={open.length === 0 ? "success" : critical > 0 ? "danger" : "warning"}
        href={inboxHref}
        hrefLabel="Open inbox"
      />

      {open.length === 0 ? (
        <AllClear line={allClearLine(data.checked)} reduce={Boolean(reduce)} />
      ) : (
        <ul className="divide-y divide-[var(--border-1)]" data-needs-you-groups>
          <AnimatePresence initial={false}>
            {groups.map((g) => (
              <motion.li
                key={g.source}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {g.items.length === 1 ? (
                  <NeedsYouLine item={g.items[0]} now={now} showSource />
                ) : (
                  <GroupRow group={g} now={now} open={isOpen(g)} onToggle={() => toggle(g)} inboxHref={inboxHref} />
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <Footer
        held={held}
        inboxHref={`${inboxHref}?view=${counts.snoozed > 0 ? "snoozed" : "dismissed"}`}
        failed={data.failed.map((s) => SOURCE_LABEL[s])}
      />
    </section>
  );
}

/** Items opened out under a group before "the rest are in the inbox". */
const GROUP_SHOWN = 8;

/** A source with several items: one line saying how many and whose, opening out in place. */
function GroupRow({
  group,
  now,
  open,
  onToggle,
  inboxHref,
}: {
  group: NeedsYouGroup;
  now: Date;
  open: boolean;
  onToggle: () => void;
  inboxHref: string;
}) {
  const tone = group.severity === "critical" ? "danger" : group.severity === "warn" ? "warning" : "neutral";
  const headline = groupHeadline(group.source, group.items.length);
  const names = groupNames(group.items);
  const shown = group.items.slice(0, GROUP_SHOWN);
  const rest = group.items.length - shown.length;
  const sourceHref = `${inboxHref}?source=${group.source}`;
  return (
    <div data-needs-you-group={group.source}>
      <div className="flex items-center gap-2 px-4 py-2 transition-colors hover:bg-[var(--surface-1)]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none"
          title={`${headline}: ${names}`}
        >
          <StatusDot tone={tone} motion={group.severity === "critical" ? "ping" : "none"} className="shrink-0" label={SEVERITY_LABEL[group.severity]} />
          <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-[var(--text-3)]" style={MONO}>
            {SOURCE_LABEL[group.source]}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="font-medium text-[var(--text-1)]">{headline}</span>
            <span className="text-[var(--text-3)]"> · {names}</span>
          </span>
          <ChevronDownIcon className={cn("h-4 w-4 shrink-0 text-[var(--text-3)] transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
        </button>
        <Link href={sourceHref} className="app-button app-button-tertiary app-button-xs shrink-0 text-[var(--brand-700)]">
          All
          <ArrowRightIcon className="h-3 w-3" aria-hidden />
        </Link>
      </div>
      {open ? (
        <ul className="divide-y divide-[var(--border-1)] border-t border-[var(--border-1)] bg-[var(--surface-1)]/40 pl-4">
          {shown.map((item) => (
            <li key={item.id}>
              <NeedsYouLine item={item} now={now} />
            </li>
          ))}
          {rest > 0 ? (
            <li className="px-4 py-2 text-xs">
              <Link href={sourceHref} className="app-button app-button-hyperlink">
                {rest} more in the inbox
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function AllClear({ line, reduce }: { line: string; reduce: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-4">
      <motion.span
        initial={reduce ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 18 }}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--success-50)] text-[var(--success-500)]"
      >
        <CheckIcon className="h-4 w-4" strokeWidth={2.5} />
      </motion.span>
      <p className="text-sm text-[var(--text-2)]">{line}</p>
    </div>
  );
}

function Footer({ held, inboxHref, failed }: { held: number; inboxHref: string; failed: string[] }) {
  if (held === 0 && failed.length === 0) return null;
  return (
    <div className="border-t border-[var(--border-1)] px-4 py-2.5 text-xs text-[var(--text-3)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {held > 0 ? (
          <Link href={inboxHref} className="hover:text-[var(--text-1)]">
            {held} snoozed or dismissed · See them
          </Link>
        ) : null}
        {failed.length > 0 ? <span className="text-[var(--text-2)]">Couldn&apos;t check {failed.join(", ")} just now</span> : null}
      </div>
    </div>
  );
}
