"use client";

/**
 * The Portal client's lifecycle (CLAUDE.md, Portal refresh): a slim timeline of milestones on the
 * page, and "View history" for everything dated on the client in the house two-column popup
 * (list left, detail right). Rules in src/lib/client-history.ts; nothing here fetches.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ComponentType } from "react";
import {
  ArrowRightStartOnRectangleIcon,
  ArrowUpRightIcon,
  BeakerIcon,
  BoltIcon,
  ChatBubbleLeftEllipsisIcon,
  CheckBadgeIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  IdentificationIcon,
  LinkIcon,
  MapIcon,
  PencilSquareIcon,
  PhoneIcon,
  SignalIcon,
  Squares2X2Icon,
  SwatchIcon,
  UserPlusIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { FadeIn } from "@/components/ui/motion/fade-in";
import { StatusDot } from "@/components/ui/motion/status-dot";
import { cn, formatDate } from "@/lib/format";
import { historyIconKey, type HistoryIconKey } from "@/lib/client-history-icons";
import { HISTORY_KIND_LABELS, buildClientHistory, timelineMilestones, type HistoryEvent, type HistoryKind } from "@/lib/client-history";
import type { ClientDetailRecord, ClientLifecycleEvent } from "@/types/client";

const MONO = "var(--font-mono)";

type Source = Pick<
  ClientDetailRecord,
  "lifecycle" | "placements" | "pulseScans" | "studies" | "platforms" | "designs" | "documentLinks" | "touchpoints"
>;

/** What kind of thing happened, as a neutral outline glyph. State stays with the dot's colour. */
const HISTORY_ICON: Record<HistoryIconKey, ComponentType<{ className?: string }>> = {
  record: IdentificationIcon,
  proposal: DocumentTextIcon,
  signed: CheckBadgeIcon,
  signature: PencilSquareIcon,
  onboarding: ClipboardDocumentCheckIcon,
  active: BoltIcon,
  plan: MapIcon,
  joined: UserPlusIcon,
  left: ArrowRightStartOnRectangleIcon,
  scan: SignalIcon,
  study: BeakerIcon,
  platform: Squares2X2Icon,
  design: SwatchIcon,
  link: LinkIcon,
  call: PhoneIcon,
  email: EnvelopeIcon,
  meeting: UsersIcon,
  note: PencilSquareIcon,
  message: ChatBubbleLeftEllipsisIcon,
  other: ClockIcon,
};

function KindIcon({ e, className }: { e: { id: string; label: string }; className?: string }) {
  const Icon = HISTORY_ICON[historyIconKey(e)];
  return <Icon aria-hidden className={cn("h-3.5 w-3.5 shrink-0 text-[var(--text-4)]", className)} />;
}

function whenLabel(e: { at: string; ongoing?: boolean; status: ClientLifecycleEvent["status"] }): string {
  if (e.ongoing) return "Now";
  return formatDate(e.at);
}

function Dot({ e }: { e: { ongoing?: boolean; status: ClientLifecycleEvent["status"] } }) {
  if (e.ongoing) return <StatusDot tone="success" motion="pulse" label="Now" />;
  if (e.status === "waiting") {
    return <span aria-hidden className="h-2 w-2 shrink-0 rounded-full border-[1.5px] border-amber-500 bg-[var(--surface-0)]" />;
  }
  if (e.status === "ready") return <StatusDot tone="info" />;
  return <StatusDot tone="brand" />;
}

export function ClientLifecycleCard({ number, source }: { number: string; source: Source }) {
  const [open, setOpen] = useState(false);
  const { shown, earlier } = timelineMilestones(source.lifecycle, 6);
  const history = useMemo(() => buildClientHistory(source), [source]);

  return (
    <>
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">{number}</span>
            {" // LIFECYCLE"}
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-2)] transition-colors hover:border-[var(--brand-500)] hover:text-[var(--brand-700)]"
          >
            <ClockIcon className="h-3.5 w-3.5" />
            View history
            <span className="text-[var(--text-4)]" style={{ fontFamily: MONO }}>
              {history.length}
            </span>
          </button>
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-4 text-sm text-[var(--text-4)]">No milestones yet.</p>
        ) : (
          // Its own scroller: on a phone six steps don't fit, and .widget-card clips (§45.2).
          <div className="overflow-x-auto">
            <ol className="relative flex min-w-max gap-0 px-5 pb-4 pt-5" aria-label="Milestones">
              {earlier > 0 ? (
                <li className="flex w-[96px] shrink-0 flex-col pr-3">
                  <span className="relative flex h-2 items-center">
                    <span aria-hidden className="absolute left-2 right-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-[var(--border-1)]" />
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="mt-3 text-left text-[11px] text-[var(--text-3)] hover:text-[var(--brand-700)]"
                    style={{ fontFamily: MONO }}
                  >
                    +{earlier} earlier
                  </button>
                </li>
              ) : null}
              {shown.map((e, i) => (
                <li key={e.id} className="flex w-[168px] shrink-0 flex-col pr-4 sm:w-auto sm:min-w-[150px] sm:flex-1">
                  <span className="relative flex h-2 items-center">
                    <Dot e={e} />
                    {i < shown.length - 1 ? (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute left-3 right-1 top-1/2 h-px -translate-y-1/2",
                          shown[i + 1].status === "waiting" ? "border-t border-dashed border-[var(--border-1)]" : "bg-[var(--border-1)]",
                        )}
                      />
                    ) : null}
                  </span>
                  <span className="mt-3 flex min-w-0 items-center gap-1.5">
                    <KindIcon e={e} />
                    <span className="truncate text-[13px] font-semibold text-[var(--text-1)]" title={e.label}>
                      {e.label}
                    </span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-[var(--text-3)]" title={e.detail}>
                    {e.detail}
                  </span>
                  <span
                    className={cn("mt-1.5 text-[10px] uppercase tracking-[0.08em]", e.ongoing ? "text-emerald-700" : e.status === "waiting" ? "text-amber-700" : "text-[var(--text-4)]")}
                    style={{ fontFamily: MONO }}
                  >
                    {e.status === "waiting" && !e.ongoing ? `Waiting · ${formatDate(e.at)}` : whenLabel(e)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
      {/* Outside the section, so nothing on the page can trap the fixed dialog (§108.3). */}
      <ClientHistoryDialog open={open} onClose={() => setOpen(false)} history={history} />
    </>
  );
}

type Filter = "all" | HistoryKind;

/** One colour per kind in the history list, so a long list scans by type. */
const KIND_TONE: Record<HistoryKind, "brand" | "success" | "neutral"> = { milestone: "brand", people: "success", work: "neutral" };

export function ClientHistoryDialog({ open, onClose, history }: { open: boolean; onClose: () => void; history: HistoryEvent[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const counts = useMemo(() => {
    const c: Record<HistoryKind, number> = { milestone: 0, people: 0, work: 0 };
    for (const e of history) c[e.kind] += 1;
    return c;
  }, [history]);
  const visible = filter === "all" ? history : history.filter((e) => e.kind === filter);
  const selected = visible.find((e) => e.id === selectedId) ?? visible[0] ?? null;

  const options = [
    { value: "all" as const, label: "All", count: history.length },
    ...(["milestone", "people", "work"] as const).filter((k) => counts[k] > 0).map((k) => ({ value: k, label: HISTORY_KIND_LABELS[k], count: counts[k] })),
  ];

  return (
    <Modal open={open} onClose={onClose} title="CLIENT HISTORY" panelClassName="app-dialog-fixed w-full max-w-3xl">
      {/* Its own scroller: four filters with counts don't fit a phone. */}
      <div className="shrink-0 overflow-x-auto border-b border-[var(--border-2)] px-4 py-2.5">
        <Segmented options={options} value={filter} onChange={(v) => { setFilter(v); setSelectedId(null); }} label="Show" />
      </div>
      {visible.length === 0 ? (
        <p className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-[var(--text-4)]">Nothing dated on this client yet.</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:grid-rows-1">
          <ul className="min-h-0 overflow-y-auto border-b border-[var(--border-2)] md:border-b-0 md:border-r" aria-label="History">
            {visible.map((e) => {
              const active = selected?.id === e.id;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(e.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-start gap-2.5 border-l-2 px-4 py-2.5 text-left transition-colors",
                      active ? "border-l-[var(--brand-500)] bg-[var(--surface-brand-soft)]" : "border-l-transparent hover:bg-[var(--surface-1)]",
                    )}
                  >
                    <span className="mt-1.5">
                      {e.ongoing || e.status !== "done" ? <Dot e={e} /> : <StatusDot tone={KIND_TONE[e.kind]} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <KindIcon e={e} />
                        <span className="truncate text-[13px] font-medium text-[var(--text-1)]" title={e.label}>
                          {e.label}
                        </span>
                      </span>
                      <span className="block truncate text-[11px] text-[var(--text-3)]" title={e.detail}>
                        {e.detail}
                      </span>
                    </span>
                    <span className="shrink-0 pt-0.5 text-[10px] uppercase tracking-[0.06em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                      {whenLabel(e)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="max-h-[40vh] min-h-0 overflow-y-auto p-5 md:max-h-none">
            {selected ? (
              <FadeIn key={selected.id}>
                <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                  {HISTORY_KIND_LABELS[selected.kind]} · {selected.ongoing ? "Now" : formatDate(selected.at)}
                </p>
                <h3 className="mt-2 text-2xl leading-tight tracking-[-0.02em] text-[var(--text-1)]" style={{ fontFamily: "var(--font-display)" }}>
                  {selected.label}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[var(--text-2)]">{selected.detail}</p>
                {selected.ongoing ? (
                  <p className="mt-3 text-[12px] text-[var(--text-4)]">This is how things stand today, so it has no date of its own.</p>
                ) : selected.status === "waiting" ? (
                  <p className="mt-3 text-[12px] text-amber-700">Still waiting on this.</p>
                ) : null}
                {selected.href ? (
                  <Link
                    href={selected.href}
                    className="mt-5 inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)] transition-colors hover:border-[var(--brand-500)] hover:text-[var(--brand-700)]"
                  >
                    Open
                    <ArrowUpRightIcon className="h-3 w-3" />
                  </Link>
                ) : null}
              </FadeIn>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}
