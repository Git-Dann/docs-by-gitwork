"use client";

/**
 * HQ's "Needs you": the top of one inbox of what every watcher found (outages, slipping
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
import { CheckIcon } from "@heroicons/react/24/outline";
import { useNeedsYou } from "@/hooks/use-desk";
import { TileHeader } from "@/components/dashboard/tile-header";
import { Skeleton } from "@/components/ui/motion/skeleton";
import { NeedsYouRow } from "@/components/needs-you/needs-you-row";
import { LEGACY_HIDDEN_KEY, SOURCE_LABEL, allClearLine, countInbox } from "@/lib/needs-you";

/** Rows shown before "Show more". */
const FIRST = 5;

/** The inbox page for where we are (the demo has its own). */
export function useInboxHref(): string {
  const pathname = usePathname() ?? "";
  return pathname.startsWith("/demo") ? "/demo/inbox" : "/app/inbox";
}

export function NeedsYouCard({ index, onVisibilityChange }: { index: number; onVisibilityChange?: (visible: boolean) => void }) {
  const query = useNeedsYou();
  const reduce = useReducedMotion();
  const inboxHref = useInboxHref();
  const [showAll, setShowAll] = useState(false);

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

  const open = data.items.filter((i) => i.hold === null);
  const counts = countInbox(data.items);
  const held = counts.snoozed + counts.dismissed;
  const critical = open.filter((i) => i.severity === "critical").length;
  const list = showAll ? open : open.slice(0, FIRST);
  const status =
    open.length === 0 ? "All clear" : critical > 0 ? `${critical} urgent · ${open.length} in all` : `${open.length} to look at`;

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
                <NeedsYouRow item={item} now={now} compact />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <Footer
        more={open.length - list.length}
        onMore={() => setShowAll(true)}
        held={held}
        inboxHref={`${inboxHref}?view=${counts.snoozed > 0 ? "snoozed" : "dismissed"}`}
        failed={data.failed.map((s) => SOURCE_LABEL[s])}
      />
    </section>
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
  held,
  inboxHref,
  failed,
}: {
  more: number;
  onMore: () => void;
  held: number;
  inboxHref: string;
  failed: string[];
}) {
  if (more <= 0 && held === 0 && failed.length === 0) return null;
  return (
    <div className="border-t border-[var(--border-1)] px-4 py-2.5 text-xs text-[var(--text-3)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {more > 0 ? (
          <button type="button" onClick={onMore} className="app-button app-button-hyperlink">
            Show {more} more
          </button>
        ) : null}
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
