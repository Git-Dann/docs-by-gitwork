"use client";

/**
 * HQ's "Needs you": one ranked list of what every watcher found (outages, slipping delivery,
 * customers waiting, new client requests, stalled documents, Pulse regressions). Each row links to
 * where it's dealt with; nothing is done from here. Rules in src/lib/needs-you.ts.
 *
 * A row can be hidden until tomorrow (per browser, with Undo), and comes back sooner if it gets
 * worse. An outage can't be hidden.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckIcon, EyeSlashIcon, ArrowRightIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { useNeedsYou } from "@/hooks/use-desk";
import { useToast } from "@/components/ui/toast";
import { TileHeader } from "@/components/dashboard/tile-header";
import { StatusDot } from "@/components/ui/motion/status-dot";
import { Skeleton } from "@/components/ui/motion/skeleton";
import {
  HIDDEN_KEY,
  SOURCE_LABEL,
  allClearLine,
  hideUntilTomorrow,
  isHidden,
  parseHidden,
  pruneHidden,
  type HiddenMap,
  type NeedsYouItem,
} from "@/lib/needs-you";

const MONO = { fontFamily: "var(--font-mono)" } as const;
/** Rows shown before "Show more". */
const FIRST = 5;

function readStored(): HiddenMap {
  try {
    return parseHidden(window.localStorage.getItem(HIDDEN_KEY));
  } catch {
    return {};
  }
}

function writeStored(map: HiddenMap) {
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(map));
  } catch {
    // Storage blocked: hiding just lasts until the page is reloaded.
  }
}

export function NeedsYouCard({ index, onVisibilityChange }: { index: number; onVisibilityChange?: (visible: boolean) => void }) {
  const query = useNeedsYou();
  const { undo } = useToast();
  const reduce = useReducedMotion();
  const [hidden, setHidden] = useState<HiddenMap>({});
  const [showAll, setShowAll] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  // Read after mount so the server render and the first client render match.
  useEffect(() => setHidden(readStored()), []);

  const data = query.data;
  const visible = Boolean(data && (data.checked.length > 0 || data.failed.length > 0));
  useEffect(() => onVisibilityChange?.(visible || query.isPending), [visible, query.isPending, onVisibilityChange]);

  const now = useMemo(() => new Date(), [data?.readAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = data?.items ?? [];
  const shown = items.filter((i) => !isHidden(i, hidden, now));
  const hiddenItems = items.filter((i) => isHidden(i, hidden, now));

  // Forget hidden entries whose item has gone or whose day has passed.
  useEffect(() => {
    if (!data) return;
    const pruned = pruneHidden(hidden, data.items, now);
    if (Object.keys(pruned).length !== Object.keys(hidden).length) {
      setHidden(pruned);
      writeStored(pruned);
    }
  }, [data, hidden, now]);

  if (query.isPending) {
    return (
      <section className="widget-card" data-hq-card>
        <TileHeader index={index} label="Needs you" />
        <div className="space-y-2 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      </section>
    );
  }
  if (!data || !visible) return null;

  function hide(item: NeedsYouItem) {
    const next = { ...hidden, [item.id]: { fingerprint: item.fingerprint, until: hideUntilTomorrow(new Date()) } };
    setHidden(next);
    writeStored(next);
    undo("Hidden until tomorrow", () => {
      setHidden((cur) => {
        const { [item.id]: _gone, ...rest } = cur;
        void _gone;
        writeStored(rest);
        return rest;
      });
    });
  }

  function unhideAll() {
    const rest = { ...hidden };
    for (const i of hiddenItems) delete rest[i.id];
    setHidden(rest);
    writeStored(rest);
    setShowHidden(false);
  }

  const critical = shown.filter((i) => i.severity === "critical").length;
  const list = showAll ? shown : shown.slice(0, FIRST);
  const status =
    shown.length === 0
      ? "All clear"
      : critical > 0
        ? `${critical} urgent · ${shown.length} in all`
        : `${shown.length} to look at`;

  return (
    <section className="widget-card" data-hq-card aria-label="Needs you">
      <TileHeader
        index={index}
        label="Needs you"
        status={status}
        statusTone={shown.length === 0 ? "success" : critical > 0 ? "danger" : "warning"}
      />

      {shown.length === 0 ? (
        <AllClear line={allClearLine(data.checked)} reduce={Boolean(reduce)} />
      ) : (
        <ul className="divide-y divide-[var(--border-1)]">
          <AnimatePresence initial={false}>
            {list.map((item, i) => (
              <motion.li
                key={item.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: { delay: reduce ? 0 : Math.min(i, 6) * 0.04 } }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24, transition: { duration: 0.18 } }}
              >
                <Row item={item} onHide={() => hide(item)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <Footer
        more={shown.length - list.length}
        onMore={() => setShowAll(true)}
        hiddenCount={hiddenItems.length}
        showHidden={showHidden}
        onToggleHidden={() => setShowHidden((v) => !v)}
        onUnhideAll={unhideAll}
        hiddenItems={hiddenItems}
        failed={data.failed.map((s) => SOURCE_LABEL[s])}
      />
    </section>
  );
}

function Row({ item, onHide }: { item: NeedsYouItem; onHide: () => void }) {
  const tone = item.severity === "critical" ? "danger" : item.severity === "warn" ? "warning" : "neutral";
  return (
    <div className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-1)]">
      <StatusDot
        tone={tone}
        motion={item.severity === "critical" ? "ping" : "none"}
        className="mt-1.5 shrink-0"
        label={item.severity === "critical" ? "Urgent" : item.severity === "warn" ? "Worth a look" : "For your information"}
      />
      <Link href={item.href} className="min-w-0 flex-1 outline-none">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-4)]" style={MONO}>
            {SOURCE_LABEL[item.source]}
          </span>
          {item.clientName ? (
            <span className="truncate text-xs text-[var(--text-3)]" title={item.clientName}>
              {item.clientName}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-sm font-medium text-[var(--text-1)] group-hover:text-[var(--brand-700)]">
          {item.title}
        </span>
        {item.detail ? <span className="mt-0.5 block text-xs text-[var(--text-3)]">{item.detail}</span> : null}
      </Link>
      <div className="flex shrink-0 items-center gap-1 self-center">
        {item.severity !== "critical" ? (
          <button
            type="button"
            onClick={onHide}
            title="Hide until tomorrow"
            aria-label={`Hide “${item.title}” until tomorrow`}
            className="app-button app-button-tertiary app-button-icon-sm opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          >
            <EyeSlashIcon className="h-4 w-4" />
          </button>
        ) : null}
        <Link href={item.href} className="app-button app-button-tertiary app-button-xs text-[var(--brand-700)]">
          {item.action}
          <ArrowRightIcon className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
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

function Footer({
  more,
  onMore,
  hiddenCount,
  showHidden,
  onToggleHidden,
  onUnhideAll,
  hiddenItems,
  failed,
}: {
  more: number;
  onMore: () => void;
  hiddenCount: number;
  showHidden: boolean;
  onToggleHidden: () => void;
  onUnhideAll: () => void;
  hiddenItems: NeedsYouItem[];
  failed: string[];
}) {
  if (more <= 0 && hiddenCount === 0 && failed.length === 0) return null;
  return (
    <div className="border-t border-[var(--border-1)] px-4 py-2.5 text-xs text-[var(--text-3)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {more > 0 ? (
          <button type="button" onClick={onMore} className="app-button app-button-hyperlink">
            Show {more} more
          </button>
        ) : null}
        {hiddenCount > 0 ? (
          <button type="button" onClick={onToggleHidden} className="hover:text-[var(--text-1)]">
            {hiddenCount} hidden until tomorrow · {showHidden ? "Close" : "Show"}
          </button>
        ) : null}
        {failed.length > 0 ? (
          <span className="text-[var(--text-2)]">Couldn&apos;t check {failed.join(", ")} just now</span>
        ) : null}
      </div>
      {showHidden && hiddenItems.length > 0 ? (
        <div className="mt-2 space-y-1">
          {hiddenItems.map((i) => (
            <Link key={i.id} href={i.href} className={cn("block truncate text-[var(--text-3)] hover:text-[var(--brand-700)]")} title={i.title}>
              {SOURCE_LABEL[i.source]} · {i.title}
              {i.clientName ? ` · ${i.clientName}` : ""}
            </Link>
          ))}
          <button type="button" onClick={onUnhideAll} className="app-button app-button-hyperlink mt-1">
            Bring them all back
          </button>
        </div>
      ) : null}
    </div>
  );
}
