"use client";

import { useEffect, useMemo, useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { useClientList } from "@/hooks/use-proposals";
import {
  useAddHandoverItem,
  useDeleteHandoverItem,
  useHandover,
  useUpdateHandover,
  useUpdateHandoverItem,
} from "@/hooks/use-handover";
import type { HandoverClientDTO, HandoverDTO } from "@/types/handover";

/**
 * The handover, read by somebody covering.
 *
 * ── Why this is a client board and not a task list ──────────────────────────
 * It was four tabs of flat rows — decisions, open risks, duties, client notes —
 * and on the real board that read as a backlog. The reader is not scanning four
 * lists for the lines that happen to mention Wedge; they are opening Wedge.
 * So the unit is the CLIENT, one card each, and everything about it lives
 * behind that one click. Same shape as `/app/portal/summary`, which answers the
 * same question about the same people.
 *
 * ── Nothing derived, on purpose ─────────────────────────────────────────────
 * No task counts, no Care queue, no Foundry status. Those live in Portal and
 * Care and are one click away; repeated here they either restate them or, once
 * this page is a week old, quietly contradict them. This page is one person's
 * account of the work, and its value is that a human wrote it.
 */

const MONO = "var(--font-mono)";

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function hasWords(entry: HandoverClientDTO): boolean {
  return Boolean(entry.summary?.trim() || entry.duties?.trim() || entry.other?.trim());
}

export function HandoverDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const query = useHandover(id);
  const [openClient, setOpenClient] = useState<string | null>(null);
  const data = query.data;

  const ordered = useMemo(() => {
    if (!data) return [];
    // Written entries first — the board should open on the clients somebody has
    // actually said something about, not alphabetically on an empty one.
    return [...data.clients].sort((a, b) => {
      const aw = hasWords(a);
      const bw = hasWords(b);
      if (aw !== bw) return aw ? -1 : 1;
      return a.clientName.localeCompare(b.clientName);
    });
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

  const active = data.clients.find((c) => c.id === openClient) ?? null;

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
        <span
          className="ml-auto shrink-0 text-[11px] uppercase tracking-[0.08em] text-[var(--text-4)]"
          style={{ fontFamily: MONO }}
        >
          {formatDay(data.startsOn)} – {formatDay(data.endsOn)}
          {data.userName ? ` · ${data.userName}` : ""}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ProseCard
          handover={data}
          number="01"
          title="HANDOVER SUMMARY"
          field="notes"
          placeholder="Where things stand overall, and what matters most while you're away."
          empty="Nothing written yet. Click to add the shape of it."
        />
        <ProseCard
          handover={data}
          number="02"
          title="DETAILS"
          field="details"
          placeholder="Anything that isn't about one client — who decides what, context, things to watch."
          empty="Nothing here yet. Click to add anything that isn't client-specific."
        />
      </div>

      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">03</span>
            {" // CLIENTS"}
          </span>
          <span className="widget-header__status" style={{ fontFamily: MONO }}>
            {data.clients.filter(hasWords).length}/{data.clients.length} WRITTEN
          </span>
        </div>
        <div className="p-3 sm:p-4">
          {data.clients.length === 0 ? (
            <p className="rounded-[8px] border border-dashed border-[var(--border-2)] px-3 py-6 text-center text-sm text-[var(--text-3)]">
              No clients yet. Add one below.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {ordered.map((entry, i) => (
                <ClientCard
                  key={entry.id}
                  entry={entry}
                  index={i + 1}
                  onOpen={() => setOpenClient(entry.id)}
                />
              ))}
            </div>
          )}
          <div className="mt-3">
            <AddClient handoverId={id} existing={data.clients} />
          </div>
        </div>
      </section>

      <ClientPanel handoverId={id} entry={active} onClose={() => setOpenClient(null)} />
    </div>
  );
}

// ── Header cards ─────────────────────────────────────────────────────────────
/**
 * A card whose whole content is one prose field. Click anywhere to edit.
 *
 * The draft resets from the server value whenever the card is NOT being edited,
 * so a save from another tab (or a refetch) can't be clobbered by a stale draft
 * sitting in a card nobody is typing in.
 */
function ProseCard({
  handover,
  number,
  title,
  field,
  placeholder,
  empty,
}: {
  handover: HandoverDTO;
  number: string;
  title: string;
  field: "notes" | "details";
  placeholder: string;
  empty: string;
}) {
  const update = useUpdateHandover(handover.id);
  const value = handover[field];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  return (
    <div className="widget-card min-h-[190px]">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">{number}</span>
          {` // ${title}`}
        </span>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-[var(--text-3)] transition-colors hover:text-[var(--text-1)]"
          >
            Edit
          </button>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-4">
        {editing ? (
          <>
            <textarea
              className="app-textarea min-h-[120px] w-full flex-1"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-xs font-medium text-white"
                onClick={() => {
                  setError(null);
                  void update
                    .mutateAsync({ [field]: draft })
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
                  setDraft(value ?? "");
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
            // ⚠️ `flex flex-col` is load-bearing: a <button> vertically CENTRES its
            // content, so without it the prose floats in the middle of the card and
            // two cards side by side start their text at different heights.
            className="-m-1 flex flex-1 flex-col rounded-[6px] p-1 text-left"
          >
            <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-2)]">
              {value || <span className="text-[var(--text-4)]">{empty}</span>}
            </p>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Client cards ─────────────────────────────────────────────────────────────
function ClientCard({
  entry,
  index,
  onOpen,
}: {
  entry: HandoverClientDTO;
  index: number;
  onOpen: () => void;
}) {
  const written = hasWords(entry);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="widget-card group flex min-h-[150px] min-w-0 flex-col text-left transition hover:border-[var(--brand-500)]"
    >
      <div className="widget-header w-full">
        <span className="widget-header__label flex min-w-0 items-center gap-2">
          {/* One `NN //` sequence per screen, continuing from the cards above —
              positional anchors for scanning, not client identifiers. */}
          <span className="widget-header__label--number shrink-0">
            {String(index).padStart(2, "0")}
          </span>
          <span className="truncate">
            {" // "}
            {entry.clientName.toUpperCase()}
          </span>
        </span>
        {entry.duties?.trim() ? (
          <span
            className="widget-header__status shrink-0 text-[var(--warning-500)]"
            style={{ fontFamily: MONO }}
          >
            DUTIES
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        {written ? (
          // ⚠️ Clamped, and the full text is NOT in a `title` — a tooltip is
          // unreachable on a phone. The popup is one click away and is the
          // recoverable path.
          <p className="line-clamp-4 text-[14px] leading-relaxed text-[var(--text-1)]">
            {entry.summary?.trim() || entry.duties?.trim() || entry.other?.trim()}
          </p>
        ) : (
          <p className="text-[13px] text-[var(--text-4)] group-hover:text-[var(--brand-700)]">
            Nothing written yet →
          </p>
        )}
      </div>
    </button>
  );
}

/**
 * The client, opened. Three paragraphs and a delete.
 *
 * Fixed height with a scrolling body (`app-dialog-fixed`), so the popup does not
 * resize under the cursor as you move between a client with two lines and one
 * with two pages.
 */
function ClientPanel({
  handoverId,
  entry,
  onClose,
}: {
  handoverId: string;
  entry: HandoverClientDTO | null;
  onClose: () => void;
}) {
  const update = useUpdateHandoverItem(handoverId);
  const remove = useDeleteHandoverItem(handoverId);
  const [draft, setDraft] = useState<HandoverClientDTO | null>(entry);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setDraft(entry);
    setError(null);
    setConfirmDelete(false);
  }, [entry]);

  return (
    <Modal
      open={Boolean(entry)}
      onClose={onClose}
      title={entry ? entry.clientName.toUpperCase() : "CLIENT"}
      panelClassName="w-full max-w-2xl app-dialog-fixed"
    >
      {draft ? (
        <>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <PanelField
              label="Where we're at"
              hint="The state of play — what's shipped, what's in flight, who's involved."
              value={draft.summary ?? ""}
              onChange={(v) => setDraft({ ...draft, summary: v })}
            />
            <PanelField
              label="Duties"
              hint="What somebody has to keep doing while I'm away, and where."
              value={draft.duties ?? ""}
              onChange={(v) => setDraft({ ...draft, duties: v })}
            />
            <PanelField
              label="Anything else"
              hint="Decisions pending, risks, context — whatever doesn't fit above."
              value={draft.other ?? ""}
              onChange={(v) => setDraft({ ...draft, other: v })}
            />
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--border-2)] p-3">
            <button
              type="button"
              className="rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              disabled={update.isPending}
              onClick={() => {
                setError(null);
                void update
                  .mutateAsync({
                    itemId: draft.id,
                    input: { duties: draft.duties, other: draft.other, detail: draft.summary },
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
                  // ⚠️ Clear the confirm on FAILURE too, or the button reads
                  // "Remove this client?" for ever, which looks unresponsive and
                  // invites a second click (§50.8).
                  .catch(() => {
                    setConfirmDelete(false);
                    setError("Couldn't remove that.");
                  });
              }}
              className={cn(
                "ml-auto rounded-[6px] px-2.5 py-1.5 text-xs transition",
                confirmDelete
                  ? "bg-[var(--danger-50)] text-[var(--danger-500)]"
                  : "text-[var(--text-4)] hover:text-[var(--danger-500)]",
              )}
            >
              {confirmDelete ? "Remove this client?" : "Remove"}
            </button>
            {error ? <span className="text-xs text-[var(--danger-500)]">{error}</span> : null}
          </div>
        </>
      ) : null}
    </Modal>
  );
}

function PanelField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]"
        style={{ fontFamily: MONO }}
      >
        {label}
      </span>
      <textarea
        className="app-textarea min-h-[120px] w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hint}
      />
    </label>
  );
}

/** Add a client to the board. Nothing else — the writing happens in the popup. */
function AddClient({
  handoverId,
  existing,
}: {
  handoverId: string;
  existing: HandoverClientDTO[];
}) {
  const add = useAddHandoverItem(handoverId);
  const clients = useClientList({ status: "ACTIVE" });
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);

  // A client already on the board must not be offerable twice — two cards for
  // one client is two places to write and one of them will be missed.
  const taken = new Set(existing.map((e) => e.clientId).filter(Boolean) as string[]);
  const options = (clients.data?.clients ?? []).filter((c) => !taken.has(c.id));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="app-select w-auto min-w-[200px]"
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
      >
        <option value="">Add a client…</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!clientId || add.isPending}
        onClick={() => {
          const chosen = options.find((c) => c.id === clientId);
          if (!chosen) return;
          setError(null);
          void add
            .mutateAsync({ kind: "CLIENT", title: chosen.name, clientId: chosen.id })
            .then(() => setClientId(""))
            .catch(() => setError("Couldn't add that."));
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-[var(--brand-700)] px-3 py-2 text-xs font-medium text-white transition hover:bg-[var(--brand-800)] disabled:opacity-40"
      >
        <PlusIcon className="h-3.5 w-3.5" /> Add
      </button>
      {options.length === 0 && (clients.data?.clients ?? []).length > 0 ? (
        <span className="text-xs text-[var(--text-4)]">Every client is already on the board.</span>
      ) : null}
      {error ? <span className="text-xs text-[var(--danger-500)]">{error}</span> : null}
    </div>
  );
}
