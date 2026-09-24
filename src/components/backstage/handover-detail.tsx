"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowRightIcon, CheckCircleIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
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
  HANDOVER_KIND_META,
  HANDOVER_SECTION_KINDS,
  type HandoverDTO,
  type HandoverItemDTO,
  type HandoverSectionKind,
} from "@/types/handover";

/**
 * The handover, read.
 *
 * ── Three cards, then one section at a time ─────────────────────────────────
 * The header answers the three things a reader arrives with — when, what's the
 * shape of it, and who can decide what — and then gets out of the way. It
 * replaced a full-width banner restating a rule in prose; the routing card says
 * the same thing with NAMES, which is the version you can act on.
 *
 * ── Rows open ───────────────────────────────────────────────────────────────
 * A row is one line: what it is, whose it is. Everything else — the detail, the
 * client, the cadence, the status — lives behind a click, because a list where
 * every row carries four lines of metadata is a wall, and the reader is
 * scanning for one thing. The panel is also the only way to EDIT an item, which
 * the first cut had no way to do at all.
 */

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function HandoverDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const query = useHandover(id);
  const [section, setSection] = useState<HandoverSectionKind>("DECISION");
  const [openItem, setOpenItem] = useState<string | null>(null);
  const data = query.data;

  const counts = useMemo(() => {
    const out = { DECISION: 0, RISK: 0, DUTY: 0, CLIENT: 0 } as Record<HandoverSectionKind, number>;
    if (!data) return out;
    for (const kind of HANDOVER_SECTION_KINDS) {
      // Decisions and risks count what is still OPEN — a section badge is a call
      // to action, and counting closed items makes a finished list look busy.
      out[kind] =
        kind === "DECISION" || kind === "RISK"
          ? data.items.filter((i) => i.kind === kind && i.status !== "DONE").length
          : data.items.filter((i) => i.kind === kind).length;
    }
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

  const active = data.items.find((i) => i.id === openItem) ?? null;

  return (
    <div className="space-y-3">
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
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <WhenCard data={data} />
        <SummaryCard data={data} />
        <RoutingCard data={data} />
      </div>

      <div className="widget-card">
        <div className="shrink-0 overflow-x-auto border-b border-[var(--border-2)] px-3 py-2 sm:px-4">
          <nav
            className="inline-flex items-center gap-0.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5"
            aria-label="Handover sections"
          >
            {HANDOVER_SECTION_KINDS.map((kind) => {
              const isActive = section === kind;
              // Only the two that mean somebody has to act carry colour. A board
              // where everything is highlighted highlights nothing.
              const urgent = (kind === "DECISION" || kind === "RISK") && counts[kind] > 0;
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setSection(kind)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2.5 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.09em] transition",
                    isActive
                      ? "bg-[var(--surface-0)] text-[var(--brand-700)] shadow-[var(--shadow-xs)]"
                      : "text-[var(--text-3)] hover:text-[var(--text-1)]",
                  )}
                >
                  {HANDOVER_KIND_META[kind].tab}
                  <span
                    className={cn(
                      "rounded-[4px] px-1 py-px text-[10px] font-semibold tabular-nums",
                      urgent
                        ? "bg-[var(--warning-50)] text-[var(--warning-500)]"
                        : isActive
                          ? "bg-[var(--surface-brand)] text-[var(--brand-700)]"
                          : "bg-[var(--surface-2)] text-[var(--text-4)]",
                    )}
                  >
                    {counts[kind]}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
        <ItemSection
          handoverId={id}
          kind={section}
          items={data.items.filter((i) => i.kind === section)}
          onOpen={setOpenItem}
        />
      </div>

      <ItemPanel handoverId={id} item={active} onClose={() => setOpenItem(null)} />
    </div>
  );
}

// ── Header cards ─────────────────────────────────────────────────────────────
function Card({
  number,
  title,
  children,
  action,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="widget-card min-h-[150px]">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{number}</span>
          {` // ${title}`}
        </span>
        {action}
      </div>
      <div className="flex flex-1 flex-col p-4">{children}</div>
    </div>
  );
}

/** 01 — when, and whose handover it is. Both editable in place. */
function WhenCard({ data }: { data: HandoverDTO }) {
  const update = useUpdateHandover(data.id);
  const team = useBackstageTeam();
  const [editing, setEditing] = useState(false);
  const [startsOn, setStartsOn] = useState(data.startsOn.slice(0, 10));
  const [endsOn, setEndsOn] = useState(data.endsOn.slice(0, 10));
  const [title, setTitle] = useState(data.title);
  const [error, setError] = useState<string | null>(null);

  const person = team.data?.find((m) => m.id === data.userId)?.name ?? data.userName;

  if (editing) {
    return (
      <Card number="01" title="AWAY">
        <input
          className="app-input mb-2"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Dan away 6–13 Oct"
        />
        <div className="grid grid-cols-2 gap-2">
          <input className="app-input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          <input className="app-input" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </div>
        <div className="mt-auto flex items-center gap-2 pt-3">
          <button
            type="button"
            className="rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-xs font-medium text-white"
            onClick={() => {
              setError(null);
              void update
                .mutateAsync({ title: title.trim(), startsOn, endsOn })
                .then(() => setEditing(false))
                .catch(() => setError("Couldn't save that."));
            }}
          >
            Save
          </button>
          <button
            type="button"
            className="px-2 py-1.5 text-xs text-[var(--text-3)]"
            onClick={() => {
              setTitle(data.title);
              setStartsOn(data.startsOn.slice(0, 10));
              setEndsOn(data.endsOn.slice(0, 10));
              setEditing(false);
            }}
          >
            Cancel
          </button>
          {error ? <span className="text-xs text-[var(--danger-500)]">{error}</span> : null}
        </div>
      </Card>
    );
  }

  return (
    <Card
      number="01"
      title="AWAY"
      action={
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
        >
          Edit
        </button>
      }
    >
      <p
        className="text-[26px] leading-none text-[var(--text-1)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {formatDay(data.startsOn)} – {formatDay(data.endsOn)}
      </p>
      <p
        className="mt-2 text-[11px] uppercase tracking-[0.08em] text-[var(--text-3)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {person ?? "Nobody named"}
      </p>
    </Card>
  );
}

/** 02 — the paragraph the author types. Free prose, no structure imposed. */
function SummaryCard({ data }: { data: HandoverDTO }) {
  const update = useUpdateHandover(data.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  // A save from elsewhere (or a refetch) must not be overwritten by a stale
  // draft sitting in a card nobody is editing.
  useEffect(() => {
    if (!editing) setDraft(data.notes ?? "");
  }, [data.notes, editing]);

  return (
    <Card
      number="02"
      title="SUMMARY"
      action={
        editing ? null : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
          >
            Edit
          </button>
        )
      }
    >
      {editing ? (
        <>
          <textarea
            className="app-textarea min-h-[76px] w-full flex-1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="The shape of the week, in your own words."
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-xs font-medium text-white"
              onClick={() => {
                setError(null);
                void update
                  .mutateAsync({ notes: draft })
                  .then(() => setEditing(false))
                  .catch(() => setError("Couldn't save that."));
              }}
            >
              Save
            </button>
            <button
              type="button"
              className="px-2 py-1.5 text-xs text-[var(--text-3)]"
              onClick={() => {
                setDraft(data.notes ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </button>
            {error ? <span className="text-xs text-[var(--danger-500)]">{error}</span> : null}
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="-m-1 flex-1 rounded-[6px] p-1 text-left"
        >
          <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-2)]">
            {data.notes || (
              <span className="text-[var(--text-4)]">
                Nothing written yet. Click to add the shape of the week.
              </span>
            )}
          </p>
        </button>
      )}
    </Card>
  );
}

/**
 * 03 — who can decide what.
 *
 * Stored as ROUTE items rather than a column, so the rows are add/remove/edit
 * through exactly the same path as everything else and the schema didn't move.
 * This is what replaced the prose rule: `Scope & timeline → Syed` is a lookup,
 * a paragraph is something you have to re-read and interpret.
 */
function RoutingCard({ data }: { data: HandoverDTO }) {
  const routes = data.items.filter((i) => i.kind === "ROUTE");
  const add = useAddHandoverItem(data.id);
  const remove = useDeleteHandoverItem(data.id);
  const team = useBackstageTeam();
  const [adding, setAdding] = useState(false);
  const [topic, setTopic] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const t = topic.trim();
    if (!t) return;
    setError(null);
    void add
      .mutateAsync({ kind: "ROUTE", title: t, ownerUserId: ownerUserId || null })
      .then(() => {
        setTopic("");
        setOwnerUserId("");
        setAdding(false);
      })
      .catch(() => setError("Couldn't add that."));
  };

  return (
    <Card
      number="03"
      title="WHO TO GO TO"
      action={
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-[var(--brand-700)] transition-colors hover:text-[var(--brand-800)]"
        >
          <PlusIcon className="h-3.5 w-3.5" /> Add
        </button>
      }
    >
      {routes.length === 0 && !adding ? (
        <p className="text-sm text-[var(--text-4)]">
          Nobody named yet — say who can decide what while you&rsquo;re away.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {routes.map((r) => (
            <li key={r.id} className="group flex items-baseline gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-[var(--text-2)]" title={r.title}>
                {r.title}
              </span>
              <ArrowRightIcon className="h-3 w-3 shrink-0 text-[var(--text-4)]" />
              <span
                className={cn(
                  "shrink-0 text-[11px] uppercase tracking-[0.08em]",
                  r.ownerName ? "text-[var(--brand-700)]" : "text-[var(--warning-500)]",
                )}
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {r.ownerName ?? "nobody"}
              </span>
              <button
                type="button"
                aria-label={`Remove ${r.title}`}
                onClick={() => void remove.mutateAsync(r.id).catch(() => setError("Couldn't remove that."))}
                className="shrink-0 text-[var(--text-4)] opacity-0 transition hover:text-[var(--danger-500)] focus:opacity-100 group-hover:opacity-100"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            className="app-input min-w-[120px] flex-1"
            placeholder="e.g. Scope & timeline"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <select
            className="app-select w-auto"
            value={ownerUserId}
            onChange={(e) => setOwnerUserId(e.target.value)}
          >
            <option value="">Nobody</option>
            {(team.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={submit}
            disabled={!topic.trim()}
            className="rounded-[6px] bg-[var(--brand-700)] px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-1 text-xs text-[var(--danger-500)]">{error}</p> : null}
    </Card>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────
function ItemSection({
  handoverId,
  kind,
  items,
  onOpen,
}: {
  handoverId: string;
  kind: HandoverSectionKind;
  items: HandoverItemDTO[];
  onOpen: (id: string) => void;
}) {
  const meta = HANDOVER_KIND_META[kind];
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
            <ItemRow key={item.id} handoverId={handoverId} item={item} onOpen={onOpen} />
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
  onOpen,
}: {
  handoverId: string;
  item: HandoverItemDTO;
  onOpen: (id: string) => void;
}) {
  const update = useUpdateHandoverItem(handoverId);
  const [error, setError] = useState<string | null>(null);
  const done = item.status === "DONE";
  const closeable = item.kind === "DECISION" || item.kind === "RISK";

  return (
    <li className="flex items-center gap-3">
      {closeable ? (
        <button
          type="button"
          aria-label={done ? "Reopen" : "Mark done"}
          onClick={() => {
            setError(null);
            // Awaited, not fired and forgotten: a failed tick that silently does
            // nothing reads as an unresponsive button and invites a second click.
            void update
              .mutateAsync({ itemId: item.id, input: { status: done ? "OPEN" : "DONE" } })
              .catch(() => setError(done ? "Couldn't reopen this." : "Couldn't close this."));
          }}
          className={cn(
            "shrink-0 py-3 transition",
            done ? "text-[var(--success-500)]" : "text-[var(--text-4)] hover:text-[var(--text-2)]",
          )}
        >
          <CheckCircleIcon className="h-5 w-5" />
        </button>
      ) : (
        <span aria-hidden className="ml-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-4)]" />
      )}

      <button
        type="button"
        onClick={() => onOpen(item.id)}
        className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-[6px] px-2 py-2.5 text-left transition-colors hover:bg-[var(--surface-1)]"
      >
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-sm leading-5",
              done ? "text-[var(--text-4)] line-through" : "text-[var(--text-1)]",
            )}
            title={item.title}
          >
            {item.title}
          </span>
          {error ? <span className="mt-0.5 block text-xs text-[var(--danger-500)]">{error}</span> : null}
        </span>

        <span
          className="hidden shrink-0 items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)] sm:flex"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {item.clientName ? <span>{item.clientName}</span> : null}
          {item.ownerName ? (
            <span className="text-[var(--brand-700)]">{item.ownerName}</span>
          ) : item.kind === "DECISION" || item.kind === "DUTY" ? (
            // No owner on a decision or a duty IS the finding — it is the item
            // most likely to sit untouched all week. Say so rather than blank.
            <span className="text-[var(--warning-500)]">nobody named</span>
          ) : null}
        </span>
      </button>
    </li>
  );
}

/**
 * The item, opened. Read AND edit — the first cut could only add and delete, so
 * a typo meant deleting the line and retyping it.
 */
function ItemPanel({
  handoverId,
  item,
  onClose,
}: {
  handoverId: string;
  item: HandoverItemDTO | null;
  onClose: () => void;
}) {
  const update = useUpdateHandoverItem(handoverId);
  const remove = useDeleteHandoverItem(handoverId);
  const team = useBackstageTeam();
  const clients = useClientList({ status: "ACTIVE" });
  const [draft, setDraft] = useState<HandoverItemDTO | null>(item);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setDraft(item);
    setError(null);
    setConfirmDelete(false);
  }, [item]);

  const isDuty = draft?.kind === "DUTY";

  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      title={item ? HANDOVER_KIND_META[item.kind].label : "ITEM"}
      panelClassName="w-full max-w-2xl app-dialog-fixed"
    >
      {draft ? (
        <Fragment>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <Field label="What it is">
              <textarea
                className="app-textarea min-h-[64px] w-full"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label="Detail">
              <textarea
                className="app-textarea min-h-[120px] w-full"
                value={draft.detail ?? ""}
                onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
                placeholder="Everything the person covering needs to know."
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Client">
                <select
                  className="app-select"
                  value={draft.clientId ?? ""}
                  onChange={(e) => setDraft({ ...draft, clientId: e.target.value || null })}
                >
                  <option value="">No client</option>
                  {(clients.data?.clients ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Goes to">
                <select
                  className="app-select"
                  value={draft.ownerUserId ?? ""}
                  onChange={(e) => setDraft({ ...draft, ownerUserId: e.target.value || null })}
                >
                  <option value="">Nobody yet</option>
                  {(team.data ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              {isDuty ? (
                <>
                  <Field label="How often">
                    <input
                      className="app-input"
                      value={draft.cadence ?? ""}
                      onChange={(e) => setDraft({ ...draft, cadence: e.target.value })}
                      placeholder="every morning"
                    />
                  </Field>
                  <Field label="Where">
                    <input
                      className="app-input"
                      value={draft.channel ?? ""}
                      onChange={(e) => setDraft({ ...draft, channel: e.target.value })}
                      placeholder="Discord, email, Reddit"
                    />
                  </Field>
                </>
              ) : null}
            </div>
            {draft.status === "DONE" && draft.resolvedByName ? (
              <p
                className="text-[11px] uppercase tracking-[0.08em] text-[var(--success-500)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Closed by {draft.resolvedByName}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--border-2)] p-3">
            <button
              type="button"
              className="rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              disabled={!draft.title.trim() || update.isPending}
              onClick={() => {
                setError(null);
                void update
                  .mutateAsync({
                    itemId: draft.id,
                    input: {
                      title: draft.title.trim(),
                      detail: draft.detail,
                      clientId: draft.clientId,
                      ownerUserId: draft.ownerUserId,
                      cadence: draft.cadence,
                      channel: draft.channel,
                    },
                  })
                  .then(onClose)
                  .catch(() => setError("Couldn't save that."));
              }}
            >
              Save
            </button>
            <button type="button" onClick={onClose} className="px-2 py-1.5 text-xs text-[var(--text-3)]">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                setError(null);
                void remove
                  .mutateAsync(draft.id)
                  .then(onClose)
                  // ⚠️ Clear the confirm on FAILURE too, or a failed delete leaves
                  // the row stuck on "Delete permanently?" for ever, which reads
                  // as an unresponsive button and invites a second click (§50.8).
                  .catch(() => {
                    setConfirmDelete(false);
                    setError("Couldn't delete that.");
                  });
              }}
              className={cn(
                "ml-auto rounded-[6px] px-2.5 py-1.5 text-xs transition",
                confirmDelete
                  ? "bg-[var(--danger-50)] text-[var(--danger-500)]"
                  : "text-[var(--text-4)] hover:text-[var(--danger-500)]",
              )}
            >
              {confirmDelete ? "Delete permanently?" : "Delete"}
            </button>
            {error ? <span className="text-xs text-[var(--danger-500)]">{error}</span> : null}
          </div>
        </Fragment>
      ) : null}
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

/** One line and Enter. The rest is editable once it exists, in the panel. */
function AddItem({ handoverId, kind }: { handoverId: string; kind: HandoverSectionKind }) {
  const add = useAddHandoverItem(handoverId);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setError(null);
    void add
      .mutateAsync({ kind, title: trimmed })
      .then(() => setTitle(""))
      .catch(() => setError("Couldn't add that."));
  };

  const placeholder: Record<HandoverSectionKind, string> = {
    DUTY: "e.g. Monitor Fellas support on Discord, email and Reddit",
    DECISION: "e.g. Campfire support retainer still unsigned",
    RISK: "e.g. PollenIQ production API key not confirmed rotated",
    CLIENT: "e.g. Wedge — premium in final prep, builds 81/82 on staging",
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="app-input min-w-[220px] flex-1"
          placeholder={placeholder[kind]}
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
      </div>
      {error ? <p className="mt-1 text-xs text-[var(--danger-500)]">{error}</p> : null}
    </div>
  );
}
