"use client";

/**
 * One item in the "Needs you" inbox, as the HQ card and the full inbox both draw it (§151):
 * where it came from, how serious it is, why it's here, and what can be done about it.
 *
 * Rules live in src/lib/needs-you.ts; acting goes through useNeedsYouActions, which calls the
 * source's own route. A row offers only the actions the server listed for this person.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ArrowRightIcon, ClockIcon, ArrowUturnLeftIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { StatusDot } from "@/components/ui/motion/status-dot";
import { Modal } from "@/components/ui/modal";
import { menuItem, menuPanel } from "@/components/ui/menu-styles";
import { useNeedsYouActions } from "@/hooks/use-needs-you";
import {
  ACTION_LABEL,
  SEVERITY_LABEL,
  SOURCE_LABEL,
  holdChoices,
  sinceWords,
  snoozePresets,
  type NeedsYouAction,
  type NeedsYouItem,
} from "@/lib/needs-you";
import { INCIDENT_STATUSES, INCIDENT_STATUS_LABEL, MAX_UPDATE_LENGTH, type IncidentStatus } from "@/lib/monitor-incidents";

const MONO = { fontFamily: "var(--font-mono)" } as const;

export function severityTone(item: NeedsYouItem): "danger" | "warning" | "neutral" {
  return item.severity === "critical" ? "danger" : item.severity === "warn" ? "warning" : "neutral";
}

/** "Tue 25 Nov, 08:00" — when a snooze ends, in the reader's own time. */
export function untilWords(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The meta line: source, severity, client, age. */
export function RowMeta({ item, now, showSeverity }: { item: NeedsYouItem; now: Date; showSeverity?: boolean }) {
  const age = sinceWords(item.since, now);
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-3)]" style={MONO}>
        {SOURCE_LABEL[item.source]}
      </span>
      {showSeverity ? (
        <span
          className={cn(
            "text-[10px] uppercase tracking-[0.12em]",
            item.severity === "critical"
              ? "text-[var(--danger-500)]"
              : item.severity === "warn"
                ? "text-[var(--warning-500)]"
                : "text-[var(--text-4)]",
          )}
          style={MONO}
        >
          {SEVERITY_LABEL[item.severity]}
        </span>
      ) : null}
      {item.clientName ? (
        <span className="max-w-full truncate text-xs text-[var(--text-3)]" title={item.clientName}>
          {item.clientName}
        </span>
      ) : null}
      {age ? (
        <span className="text-[11px] text-[var(--text-4)]" style={MONO}>
          {age}
        </span>
      ) : null}
    </span>
  );
}

/** The snooze choices as an anchored menu (portalled, so a card can't clip it). */
export function SnoozeMenu({ item, compact }: { item: NeedsYouItem; compact?: boolean }) {
  const { snooze } = useNeedsYouActions();
  const presets = useMemo(() => snoozePresets(new Date()), []);
  return (
    <Menu>
      <MenuButton
        className={cn("app-button app-button-tertiary", compact ? "app-button-icon-sm" : "app-button-xs")}
        aria-label={`Snooze “${item.title}”`}
        title="Snooze"
      >
        <ClockIcon className="h-4 w-4" aria-hidden />
        {compact ? null : "Snooze"}
      </MenuButton>
      <MenuItems anchor="bottom end" className={cn(menuPanel, "w-48")}>
        {presets.map((p) => (
          <MenuItem key={p.id}>
            <button type="button" className={menuItem} onClick={() => void snooze(item, p.until, p.label)}>
              {p.label}
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}

/** Posting an incident update: the same three fields as the Monitors board. */
export function PostUpdateDialog({
  item,
  action,
  open,
  onClose,
}: {
  item: NeedsYouItem;
  action: Extract<NeedsYouAction, { kind: "post-update" }>;
  open: boolean;
  onClose: () => void;
}) {
  const { run } = useNeedsYouActions();
  const [status, setStatus] = useState<IncidentStatus>("investigating");
  const [message, setMessage] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!message.trim()) {
      setError("Write what's happening.");
      return;
    }
    setError(null);
    setBusy(true);
    await run(item, action, {
      update: { status, message: message.trim(), isPublic },
    });
    setBusy(false);
    setMessage("");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Post an update" panelClassName="max-w-lg">
      <div className="space-y-3 p-5">
        <p className="text-sm text-[var(--text-2)]">
          {item.title}
          {item.clientName ? <span className="text-[var(--text-3)]"> · {item.clientName}</span> : null}
        </p>
        <label className="block">
          <span className="widget-data-label">Status</span>
          <select
            className="app-select app-select-chevron mt-1 w-full pr-9"
            value={status}
            onChange={(e) => setStatus(e.target.value as IncidentStatus)}
          >
            {INCIDENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {INCIDENT_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="widget-data-label">What&apos;s happening</span>
          <textarea
            className="app-textarea mt-1 w-full"
            rows={4}
            maxLength={MAX_UPDATE_LENGTH}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="We've found the cause and are rolling out a fix."
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          Show to the client on their status board
        </label>
        {error ? <p className="text-sm text-[var(--danger-500)]">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="app-button app-button-secondary app-button-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="app-button app-button-primary app-button-sm" disabled={busy} onClick={() => void submit()}>
            {busy ? "Posting…" : "Post update"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The buttons on a row: the source's own actions, then the person's own snooze and dismiss.
 * A held item offers "Bring back" instead.
 */
export function RowActions({ item, compact }: { item: NeedsYouItem; compact?: boolean }) {
  const { run, dismiss, restore } = useNeedsYouActions();
  const [updateFor, setUpdateFor] = useState<Extract<NeedsYouAction, { kind: "post-update" }> | null>(null);
  const choices = holdChoices(item);

  if (item.hold) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="app-button app-button-secondary app-button-xs" onClick={() => void restore(item)}>
          <ArrowUturnLeftIcon className="h-3.5 w-3.5" aria-hidden />
          Bring back
        </button>
        <Link href={item.href} className="app-button app-button-tertiary app-button-xs text-[var(--brand-700)]">
          {item.action}
          <ArrowRightIcon className="h-3 w-3" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {item.actions.map((a) => (
        <button
          key={a.kind}
          type="button"
          className="app-button app-button-secondary app-button-xs"
          onClick={() => (a.kind === "post-update" ? setUpdateFor(a) : void run(item, a))}
        >
          {ACTION_LABEL[a.kind]}
        </button>
      ))}
      <Link href={item.href} className="app-button app-button-tertiary app-button-xs text-[var(--brand-700)]">
        {item.action}
        <ArrowRightIcon className="h-3 w-3" aria-hidden />
      </Link>
      {choices.snooze ? <SnoozeMenu item={item} compact={compact} /> : null}
      {choices.dismiss ? (
        <button
          type="button"
          onClick={() => void dismiss(item)}
          className={cn("app-button app-button-tertiary", compact ? "app-button-icon-sm" : "app-button-xs")}
          title="Dismiss until it changes"
          aria-label={`Dismiss “${item.title}” until it changes`}
        >
          <XMarkIcon className="h-4 w-4" aria-hidden />
          {compact ? null : "Dismiss"}
        </button>
      ) : null}
      {/* Portalled: a row sits inside animated (transformed) list items, and a transform traps a
          fixed dialog inside it (§108.3). */}
      {updateFor && typeof document !== "undefined"
        ? createPortal(<PostUpdateDialog item={item} action={updateFor} open onClose={() => setUpdateFor(null)} />, document.body)
        : null}
    </div>
  );
}

/** The full row: evidence, why, and actions. */
export function NeedsYouRow({
  item,
  now,
  compact,
  active,
}: {
  item: NeedsYouItem;
  now: Date;
  compact?: boolean;
  /** The keyboard cursor is on this row (inbox only). */
  active?: boolean;
}) {
  const tone = severityTone(item);
  return (
    <div
      className={cn(
        "group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-1)]",
        active && "bg-[var(--surface-1)] shadow-[inset_2px_0_0_var(--brand-600)]",
      )}
    >
      <StatusDot
        tone={tone}
        motion={item.severity === "critical" && !item.hold ? "ping" : "none"}
        className="mt-1.5 shrink-0"
        label={SEVERITY_LABEL[item.severity]}
      />
      <div className={cn("min-w-0 flex-1", compact && "sm:flex sm:items-start sm:gap-4")}>
        <div className="min-w-0 flex-1">
          <RowMeta item={item} now={now} showSeverity={!compact} />
          <Link
            href={item.href}
            className="mt-0.5 block text-sm font-medium text-[var(--text-1)] outline-none hover:text-[var(--brand-700)]"
          >
            {item.title}
          </Link>
          {item.detail ? <p className="mt-0.5 break-words text-xs text-[var(--text-3)]">{item.detail}</p> : null}
          <p className="mt-0.5 text-[11px] text-[var(--text-4)]">
            <span style={MONO} className="uppercase tracking-[0.1em]">
              Why
            </span>{" "}
            {item.why}
          </p>
          {item.hold ? (
            <p className="mt-1 text-[11px] text-[var(--text-3)]">
              {item.hold.state === "snoozed" && item.hold.until
                ? `Snoozed until ${untilWords(item.hold.until)}, or sooner if it gets worse`
                : "Dismissed until it changes"}
            </p>
          ) : null}
        </div>
        {/* On HQ the actions sit to the right of the row from a tablet up, so the card stays short. */}
        <div className={cn("mt-2", compact && "sm:mt-0 sm:max-w-[45%] sm:shrink-0 sm:self-center")}>
          <RowActions item={item} compact={compact} />
        </div>
      </div>
    </div>
  );
}

/**
 * One item on one line, for HQ's card (§157): the title and its evidence, the age, and the actions.
 * The rule that put it here ("why") is in the tooltip; the inbox page shows it in full.
 */
export function NeedsYouLine({ item, now, showSource }: { item: NeedsYouItem; now: Date; showSource?: boolean }) {
  const tone = severityTone(item);
  const age = sinceWords(item.since, now);
  const tip = [item.title, item.clientName, item.detail, item.why ? `Why: ${item.why}` : null].filter(Boolean).join(" · ");
  return (
    <div className="group flex flex-col gap-1 px-4 py-2 transition-colors hover:bg-[var(--surface-1)] sm:flex-row sm:items-center sm:gap-3" data-needs-you-line>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <StatusDot
          tone={tone}
          motion={item.severity === "critical" && !item.hold ? "ping" : "none"}
          className="shrink-0"
          label={SEVERITY_LABEL[item.severity]}
        />
        {showSource ? (
          <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-[var(--text-3)]" style={MONO}>
            {SOURCE_LABEL[item.source]}
          </span>
        ) : null}
        <Link href={item.href} title={tip} className="min-w-0 flex-1 truncate text-sm outline-none hover:text-[var(--brand-700)]">
          <span className="font-medium text-[var(--text-1)]">{item.title}</span>
          {item.clientName && !item.title.includes(item.clientName) ? <span className="text-[var(--text-3)]"> · {item.clientName}</span> : null}
          {item.detail ? <span className="text-[var(--text-3)]"> · {item.detail}</span> : null}
        </Link>
        {age ? (
          <span className="shrink-0 text-[11px] text-[var(--text-4)]" style={MONO}>
            {age}
          </span>
        ) : null}
      </div>
      <div className="shrink-0 pl-[18px] sm:pl-0">
        <RowActions item={item} compact />
      </div>
    </div>
  );
}
