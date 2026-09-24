"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { useBackstageTeam } from "@/hooks/use-backstage";
import { useClientList } from "@/hooks/use-proposals";
import {
  useAddHandoverItem,
  useDeleteHandoverItem,
  useHandover,
  useUpdateHandover,
  useUpdateHandoverItem,
} from "@/hooks/use-handover";
import {
  HANDOVER_ITEM_KINDS,
  HANDOVER_KIND_META,
  type HandoverClientState,
  type HandoverDTO,
  type HandoverItemDTO,
  type HandoverItemKind,
} from "@/types/handover";

/**
 * The handover, read.
 *
 * ── Why a segmented control and not a wall ──────────────────────────────────
 * The brief is for someone standing in the middle of a week covering for
 * someone else. They arrive with one question — "what am I allowed to do about
 * X" — and a single long document makes them scroll past four sections to find
 * it. One section at a time, counts on the tabs, so the shape of the week is
 * legible before anything is opened.
 *
 * ── The rule sits above the tabs, always ────────────────────────────────────
 * It is the only thing that governs every section, so it is the only thing that
 * never scrolls away. Everything under it is an instance of it.
 */

type Section = HandoverItemKind | "BLIND";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "DECISION", label: "Decisions" },
  { id: "RISK", label: "Open" },
  { id: "DUTY", label: "Duties" },
  { id: "CLIENT", label: "Clients" },
  { id: "BLIND", label: "Blind spots" },
];

function daysAgo(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}d`;
  const hours = Math.max(1, Math.floor(ms / 3_600_000));
  return `${hours}h`;
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function HandoverDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const query = useHandover(id);
  const [section, setSection] = useState<Section>("DECISION");
  const data = query.data;

  const counts = useMemo(() => {
    const out: Record<Section, number> = { DECISION: 0, RISK: 0, DUTY: 0, CLIENT: 0, BLIND: 0 };
    if (!data) return out;
    for (const kind of HANDOVER_ITEM_KINDS) {
      // Decisions and risks count what is still OPEN — a section badge is a call
      // to action, and counting closed items would make a finished list look busy.
      out[kind] =
        kind === "DECISION" || kind === "RISK"
          ? data.items.filter((i) => i.kind === kind && i.status !== "DONE").length
          : data.items.filter((i) => i.kind === kind).length;
    }
    out.BLIND = data.clientState.filter((c) => c.thin).length;
    return out;
  }, [data]);

  if (query.isLoading) {
    return <div className="h-64 animate-pulse rounded-[10px] bg-[var(--surface-1)]" />;
  }
  if (query.isError || !data) {
    return (
      <div className="widget-card p-6 text-sm text-[var(--text-3)]">
        That handover couldn&rsquo;t be loaded.{" "}
        <button type="button" onClick={onBack} className="text-[var(--brand-700)] underline">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Header data={data} onBack={onBack} />
      <StandingRule data={data} />

      <div className="widget-card">
        <div className="shrink-0 overflow-x-auto border-b border-[var(--border-2)] px-3 py-2 sm:px-4">
          <nav
            className="inline-flex items-center gap-0.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5"
            aria-label="Handover sections"
          >
            {SECTIONS.map((s, i) => {
              const active = section === s.id;
              // "Open" and "Decisions" are the two that mean somebody has to act, so
              // they are the only badges that carry colour. A board where everything
              // is highlighted highlights nothing.
              const urgent = (s.id === "DECISION" || s.id === "RISK") && counts[s.id] > 0;
              return (
                <Fragment key={s.id}>
                  {i === 4 && (
                    <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-[var(--border-2)]" />
                  )}
                  <button
                    type="button"
                    onClick={() => setSection(s.id)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.09em] transition",
                      active
                        ? "bg-[var(--surface-0)] text-[var(--brand-700)] shadow-[var(--shadow-xs)]"
                        : "text-[var(--text-3)] hover:text-[var(--text-1)]",
                    )}
                  >
                    {s.label}
                    <span
                      className={cn(
                        "rounded-[4px] px-1 py-px text-[10px] font-semibold tabular-nums",
                        urgent
                          ? "bg-[var(--warning-50)] text-[var(--warning-500)]"
                          : active
                            ? "bg-[var(--surface-brand)] text-[var(--brand-700)]"
                            : "bg-[var(--surface-2)] text-[var(--text-4)]",
                      )}
                    >
                      {counts[s.id]}
                    </span>
                  </button>
                </Fragment>
              );
            })}
          </nav>
        </div>

        {section === "BLIND" ? (
          <BlindSpots clients={data.clientState} asOf={data.asOf} />
        ) : (
          <ItemSection handoverId={id} kind={section} data={data} />
        )}
      </div>
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────
function Header({ data, onBack }: { data: HandoverDTO; onBack: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <button
        type="button"
        onClick={onBack}
        className="text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
      >
        Handover
      </button>
      <span className="text-[var(--text-4)]">/</span>
      <span className="min-w-0 truncate font-medium text-[var(--text-1)]" title={data.title}>
        {data.title}
      </span>
      <span
        className="ml-auto shrink-0 text-[11px] uppercase tracking-[0.08em] text-[var(--text-4)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {formatDay(data.startsOn)} – {formatDay(data.endsOn)}
        {data.userName ? ` · ${data.userName}` : ""}
      </span>
    </div>
  );
}

// ── The rule ─────────────────────────────────────────────────────────────────
function StandingRule({ data }: { data: HandoverDTO }) {
  const update = useUpdateHandover(data.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.standingRule ?? "");

  if (editing) {
    return (
      <div className="widget-card p-3">
        <textarea
          className="app-textarea w-full"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Syed decides scope and timeline. Nobody decides commercials."
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-xs font-medium text-white"
            onClick={() => {
              update.mutate({ standingRule: draft });
              setEditing(false);
            }}
          >
            Save
          </button>
          <button
            type="button"
            className="rounded-[6px] px-3 py-1.5 text-xs text-[var(--text-3)]"
            onClick={() => {
              setDraft(data.standingRule ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="block w-full rounded-[10px] border border-[var(--brand-300)] bg-[var(--surface-brand)] px-4 py-3 text-left transition hover:border-[var(--brand-600)]"
    >
      <span
        className="block text-[10px] uppercase tracking-[0.12em] text-[var(--brand-700)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        The rule
      </span>
      <span className="mt-1 block text-[15px] leading-6 text-[var(--text-1)]">
        {data.standingRule || (
          <span className="text-[var(--text-3)]">
            No rule set. Click to say who is allowed to decide what.
          </span>
        )}
      </span>
    </button>
  );
}

// ── Item sections ────────────────────────────────────────────────────────────
function ItemSection({
  handoverId,
  kind,
  data,
}: {
  handoverId: string;
  kind: HandoverItemKind;
  data: HandoverDTO;
}) {
  const meta = HANDOVER_KIND_META[kind];
  const items = data.items.filter((i) => i.kind === kind);
  const stateByClient = useMemo(() => {
    const m = new Map<string, HandoverClientState>();
    for (const c of data.clientState) m.set(c.clientId, c);
    return m;
  }, [data.clientState]);

  return (
    <div className="p-3 sm:p-4">
      <p className="mb-3 max-w-[70ch] text-xs leading-5 text-[var(--text-3)]">{meta.blurb}</p>

      {items.length === 0 ? (
        <p className="mb-3 rounded-[8px] border border-dashed border-[var(--border-2)] px-3 py-4 text-center text-sm text-[var(--text-3)]">
          {meta.empty}
        </p>
      ) : (
        <ul className="mb-3 divide-y divide-[var(--border-1)] border-y border-[var(--border-1)]">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              handoverId={handoverId}
              item={item}
              live={item.clientId ? stateByClient.get(item.clientId) : undefined}
            />
          ))}
        </ul>
      )}

      <AddItem handoverId={handoverId} kind={kind} />
    </div>
  );
}

function ItemRow({
  handoverId,
  item,
  live,
}: {
  handoverId: string;
  item: HandoverItemDTO;
  live?: HandoverClientState;
}) {
  const update = useUpdateHandoverItem(handoverId);
  const remove = useDeleteHandoverItem(handoverId);
  const [error, setError] = useState<string | null>(null);
  const done = item.status === "DONE";
  const closeable = item.kind === "DECISION" || item.kind === "RISK";

  const run = (fn: () => Promise<unknown>, what: string) => {
    setError(null);
    // Mutations here are awaited rather than fired and forgotten: a failed tick
    // that silently does nothing reads as an unresponsive button and invites a
    // second click (§50.8).
    void fn().catch(() => setError(`Couldn't ${what}.`));
  };

  return (
    <li className="group flex items-start gap-3 py-2.5">
      {closeable ? (
        <button
          type="button"
          aria-label={done ? "Reopen" : "Mark done"}
          onClick={() =>
            run(
              () =>
                update.mutateAsync({
                  itemId: item.id,
                  input: { status: done ? "OPEN" : "DONE" },
                }),
              done ? "reopen this" : "close this",
            )
          }
          className={cn(
            "mt-0.5 shrink-0 transition",
            done ? "text-[var(--success-500)]" : "text-[var(--text-4)] hover:text-[var(--text-2)]",
          )}
        >
          <CheckCircleIcon className="h-5 w-5" />
        </button>
      ) : (
        <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-4)]" />
      )}

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm leading-5",
            done ? "text-[var(--text-4)] line-through" : "text-[var(--text-1)]",
          )}
        >
          {item.title}
        </p>
        {item.detail ? (
          <p className="mt-0.5 text-xs leading-5 text-[var(--text-3)]">{item.detail}</p>
        ) : null}

        <p
          className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {item.clientName ? <span>{item.clientName}</span> : null}
          {item.cadence ? <span>· {item.cadence}</span> : null}
          {item.channel ? <span>· {item.channel}</span> : null}
          {item.ownerUserId ? (
            <span className="text-[var(--brand-700)]">→ {item.ownerName ?? "assigned"}</span>
          ) : item.kind === "DECISION" || item.kind === "DUTY" ? (
            // No owner on a decision or a duty IS the finding — it is the item most
            // likely to sit untouched all week. Say so rather than leaving a blank.
            <span className="text-[var(--warning-500)]">→ nobody named</span>
          ) : null}
          {done && item.resolvedByName ? (
            <span className="text-[var(--success-500)]">closed by {item.resolvedByName}</span>
          ) : null}
        </p>

        {/* Live state, for a client note. Labelled `now` so nobody reads a derived
            figure as part of the author's sentence. */}
        {live ? (
          <p
            className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] tabular-nums text-[var(--text-4)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <span className="text-[var(--text-3)]">now ·</span>
            {/* ⚠️ A thin client must NOT render "0 open". Echo has a shipped app and no
                tasks; YourGroop tracks on a shared sheet; Freeway runs over WhatsApp. A
                zero there reads as "nothing happening" when the truth is "we cannot see
                this one" — the §35 mistake, printed next to somebody's judgement. */}
            {live.thin ? <span className="text-[var(--warning-500)]">not tracked here</span> : null}
            {live.openTasks > 0 ? <span>{live.openTasks} open</span> : null}
            {live.overdueTasks > 0 ? (
              <span className="text-[var(--warning-500)]">{live.overdueTasks} overdue</span>
            ) : null}
            {live.careAwaiting > 0 ? (
              <span className="text-[var(--warning-500)]">
                {live.careAwaiting} awaiting reply
                {daysAgo(live.careOldestAwaitingAt)
                  ? ` · longest ${daysAgo(live.careOldestAwaitingAt)}`
                  : ""}
              </span>
            ) : null}
            <a
              href={`/app/portal/${live.slug}`}
              className="inline-flex items-center gap-0.5 text-[var(--brand-700)] hover:underline"
            >
              open <ArrowTopRightOnSquareIcon className="h-3 w-3" />
            </a>
          </p>
        ) : null}

        {error ? <p className="mt-1 text-xs text-[var(--danger-500)]">{error}</p> : null}
      </div>

      <button
        type="button"
        aria-label="Remove"
        onClick={() => run(() => remove.mutateAsync(item.id), "remove this")}
        className="mt-0.5 shrink-0 text-[var(--text-4)] opacity-0 transition hover:text-[var(--danger-500)] focus:opacity-100 group-hover:opacity-100"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  );
}

/**
 * One line and Enter. The extra fields are behind a disclosure because the
 * friction that stops a handover being written is being asked for seven fields
 * before you can record one sentence.
 */
function AddItem({ handoverId, kind }: { handoverId: string; kind: HandoverItemKind }) {
  const add = useAddHandoverItem(handoverId);
  const team = useBackstageTeam();
  const clients = useClientList({ status: "ACTIVE" });
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [clientId, setClientId] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [cadence, setCadence] = useState("");
  const [channel, setChannel] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setDetail("");
    setClientId("");
    setOwnerUserId("");
    setCadence("");
    setChannel("");
  };

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setError(null);
    void add
      .mutateAsync({
        kind,
        title: trimmed,
        detail: detail.trim() || null,
        clientId: clientId || null,
        ownerUserId: ownerUserId || null,
        cadence: cadence.trim() || null,
        channel: channel.trim() || null,
      })
      .then(reset)
      .catch(() => setError("Couldn't add that."));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="app-input min-w-[220px] flex-1"
          placeholder={
            kind === "DUTY"
              ? "e.g. Monitor Fellas support on Discord, email and Reddit"
              : kind === "DECISION"
                ? "e.g. Campfire support retainer still unsigned"
                : kind === "RISK"
                  ? "e.g. PollenIQ production API key not confirmed rotated"
                  : "e.g. Wedge — premium in final prep, builds 81/82 on staging"
          }
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim() || add.isPending}
          className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-[var(--brand-700)] px-3 py-2 text-xs font-medium text-white transition hover:bg-[var(--brand-800)] disabled:opacity-40"
        >
          <PlusIcon className="h-3.5 w-3.5" /> Add
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-xs text-[var(--text-3)] underline transition-colors hover:text-[var(--text-1)]"
        >
          {open ? "Fewer fields" : "More fields"}
        </button>
      </div>

      {open ? (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            className="app-input sm:col-span-2"
            placeholder="Detail (optional)"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
          <label className="flex flex-col gap-1">
            <span
              className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Client
            </span>
            <select
              className="app-select"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">No client</option>
              {(clients.data?.clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span
              className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Goes to
            </span>
            <select
              className="app-select"
              value={ownerUserId}
              onChange={(e) => setOwnerUserId(e.target.value)}
            >
              <option value="">Nobody yet</option>
              {(team.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          {kind === "DUTY" ? (
            <>
              <input
                className="app-input"
                placeholder="How often — e.g. every morning"
                value={cadence}
                onChange={(e) => setCadence(e.target.value)}
              />
              <input
                className="app-input"
                placeholder="Where — e.g. Discord, email, Reddit"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-1 text-xs text-[var(--danger-500)]">{error}</p> : null}
    </div>
  );
}

/**
 * What Foundry cannot see.
 *
 * This section exists because the derived half is dangerous on its own. Echo has
 * a shipped app and zero tasks; YourGroop tracks on a shared sheet; Campfire runs
 * in someone else's Slack; Freeway runs over WhatsApp. Every one of those renders
 * as a clean, quiet client — indistinguishable from one with genuinely nothing
 * happening. Naming them is the difference between a useful brief and a
 * reassuring one.
 */
function BlindSpots({ clients, asOf }: { clients: HandoverClientState[]; asOf: string }) {
  const thin = clients.filter((c) => c.thin);
  return (
    <div className="p-3 sm:p-4">
      <p className="mb-3 max-w-[70ch] text-xs leading-5 text-[var(--text-3)]">
        Foundry holds no open tasks and no support queue for these clients. That is not the same as
        nothing happening — work tracked on a shared sheet, in someone else&rsquo;s Slack or over
        WhatsApp looks identical to work that has stopped. Check these by asking, not by reading.
      </p>
      {thin.length === 0 ? (
        <p className="rounded-[8px] border border-dashed border-[var(--border-2)] px-3 py-4 text-center text-sm text-[var(--text-3)]">
          Every active client has something live in Foundry.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border-1)] border-y border-[var(--border-1)]">
          {thin.map((c) => (
            <li key={c.clientId} className="flex items-center gap-3 py-2.5">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-[var(--warning-500)]" />
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-1)]" title={c.clientName}>
                {c.clientName}
              </span>
              <a
                href={`/app/portal/${c.slug}`}
                className="shrink-0 text-xs text-[var(--brand-700)] hover:underline"
              >
                Open
              </a>
            </li>
          ))}
        </ul>
      )}
      <p
        className="mt-3 text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        Live as of {new Date(asOf).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}
