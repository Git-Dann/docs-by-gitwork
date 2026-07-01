"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/format";
import type { TaskDTO, TaskStatus } from "@/types/tasks";

/**
 * A capped list with a "Show N more" reveal, so long sections (action items, tasks,
 * mail) stay scannable and the drawer never becomes an endless scroll. Expands in one
 * click; collapses back with "Show less".
 */
export function RevealList<T>({
  items,
  initial = 5,
  renderItem,
}: {
  items: T[];
  initial?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, initial);
  const hidden = items.length - visible.length;
  return (
    <div className="space-y-2">
      {visible.map((item, i) => renderItem(item, i))}
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full rounded-[8px] border border-dashed border-[var(--border-2)] py-2 text-[11px] uppercase tracking-[1px] text-[var(--text-4)] transition hover:border-[var(--brand-300)] hover:text-[var(--brand-700)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Show {hidden} more
        </button>
      ) : null}
      {expanded && items.length > initial ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="w-full py-1 text-[11px] uppercase tracking-[1px] text-[var(--text-4)] transition hover:text-[var(--text-2)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Show less
        </button>
      ) : null}
    </div>
  );
}

/** The grab handle — a click-to-toggle affordance at the top of the dock/panel. */
export function DeskHandle({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group flex w-full shrink-0 items-center justify-center py-2.5"
    >
      <span className="h-1 w-10 origin-center transform-gpu rounded-full bg-[var(--border-1)] transition-all duration-300 ease-out group-hover:scale-x-[1.4] group-hover:bg-[var(--brand-500)] motion-reduce:transition-none" />
    </button>
  );
}

/** Status chip styles — token-backed so dark mode flips cleanly. */
export const STATUS_STYLES: Record<TaskStatus, string> = {
  BACKLOG: "bg-[var(--surface-1)] text-[var(--text-3)]",
  TODO: "bg-[var(--surface-1)] text-[var(--text-3)]",
  DOING: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  IN_REVIEW: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  DONE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "To do",
  DOING: "Doing",
  IN_REVIEW: "In review",
  DONE: "Done",
};

/**
 * Editorial two-column row — the core Dia move: a serif-italic section title (plus
 * optional stamp / caption) in a left rail, content on the right. Fills the wide
 * drawer and gives every tab the same magazine rhythm.
 */
export function EditorialRow({
  title,
  caption,
  stamp,
  count,
  first,
  children,
}: {
  title: string;
  caption?: string;
  stamp?: React.ReactNode;
  count?: number;
  /** First row skips the top divider. */
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "grid gap-x-10 gap-y-4 py-7 md:grid-cols-[210px_minmax(0,1fr)]",
        !first && "border-t border-[var(--border-2)]",
      )}
    >
      <div className="flex flex-col gap-3">
        <div>
          <h3
            className="text-[21px] leading-[1.15] text-[var(--text-1)]"
            style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
          >
            {title}
          </h3>
          {typeof count === "number" ? (
            <span
              className="mt-1 inline-block text-[11px] uppercase tracking-[1px] text-[var(--text-4)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {count} {count === 1 ? "item" : "items"}
            </span>
          ) : null}
          {caption ? (
            <p className="mt-1 text-xs leading-5 text-[var(--text-4)]">{caption}</p>
          ) : null}
        </div>
        {stamp}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** A hand-lettered scalloped "stamp" CTA — the playful Dia signature, on-brand in blue. */
export function Stamp({
  label,
  href,
  onClick,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
}) {
  const clip = useMemo(() => burstClip(11, 50, 43), []);
  const inner = (
    <span className="group relative inline-grid h-[84px] w-[84px] place-items-center">
      <span
        aria-hidden
        className="absolute inset-0 bg-[var(--brand-600)] transition-transform duration-200 ease-out group-hover:scale-[1.06] group-hover:-rotate-6"
        style={{ clipPath: clip, transform: "rotate(-4deg)" }}
      />
      <span
        className="relative z-[1] px-2 text-center text-[19px] leading-[0.95] text-white"
        style={{ fontFamily: "var(--font-caveat)" }}
      >
        {label} →
      </span>
    </span>
  );
  if (href) {
    return (
      <Link href={href} aria-label={label} className="w-fit">
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} className="w-fit">
      {inner}
    </button>
  );
}

/** Build a scalloped/starburst clip-path polygon (percent coords). */
function burstClip(spikes: number, outer: number, inner: number): string {
  const pts: string[] = [];
  const total = spikes * 2;
  for (let i = 0; i < total; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * 2 * i) / total - Math.PI / 2;
    const x = 50 + r * Math.cos(a);
    const y = 50 + r * Math.sin(a);
    pts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }
  return `polygon(${pts.join(", ")})`;
}

/** A single task row — deep-links to the client's board. Optional mono index (01, 02…). */
export function DeskTaskRow({
  task,
  showStatus = true,
  index,
}: {
  task: TaskDTO;
  showStatus?: boolean;
  index?: number;
}) {
  const overdue = task.dueDate
    ? new Date(task.dueDate) < new Date() && task.status !== "DONE"
    : false;
  return (
    <Link
      href={`/app/portal/${task.client.slug}/tasks`}
      className="group flex items-center gap-3 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3.5 py-3 transition hover:border-[var(--brand-300)] hover:shadow-[var(--shadow-xs)]"
    >
      {typeof index === "number" ? (
        <span
          className="shrink-0 text-[11px] text-[var(--text-4)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {String(index).padStart(2, "0")}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-1)]">{task.title}</p>
        <p className="truncate text-xs text-[var(--text-4)]">
          {task.client.name}
          {task.dueDate ? (
            <span className={cn("ml-1.5", overdue && "text-[var(--danger-500)]")}>
              · {overdue ? "overdue " : "due "}
              {new Date(task.dueDate).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
              })}
            </span>
          ) : null}
        </p>
      </div>
      {showStatus ? (
        <span
          className={cn(
            "shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium",
            STATUS_STYLES[task.status],
          )}
        >
          {STATUS_LABEL[task.status]}
        </span>
      ) : null}
    </Link>
  );
}

/** Muted empty-state line. */
export function DeskEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[8px] border border-dashed border-[var(--border-2)] px-4 py-6 text-center text-xs text-[var(--text-4)]">
      {children}
    </div>
  );
}

/** Skeleton block while a section loads. */
export function DeskSkeleton() {
  return <div className="h-16 animate-pulse rounded-[8px] bg-[var(--surface-1)]" />;
}

/** "Connect Google" empty state shared by Meetings + Inbox tabs. */
export function DeskConnectGoogle({ what }: { what: string }) {
  return (
    <div className="rounded-[8px] border border-dashed border-[var(--border-2)] px-4 py-6 text-center">
      <p className="text-xs text-[var(--text-4)]">Connect your Google account to see {what}.</p>
      <Link
        href="/app/settings/account"
        className="mt-2 inline-block text-xs font-medium text-[var(--brand-700)] hover:underline"
      >
        Connect in Settings →
      </Link>
    </div>
  );
}
