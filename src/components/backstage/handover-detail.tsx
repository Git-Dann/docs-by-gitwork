"use client";

import { useEffect, useMemo, useState } from "react";
import { PencilSquareIcon, PlusIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { BackstageModal } from "@/components/backstage/modal";
import { useBackstageTeam } from "@/hooks/use-backstage";
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
  const [editingHeader, setEditingHeader] = useState(false);
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
        {/* ⚠️ This line used to be inert text, on a handover whose own title said
            "set the dates" — there was no way to set them, or to correct who was
            away, anywhere on the page. It is a button now. */}
        <button
          type="button"
          onClick={() => setEditingHeader(true)}
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-[6px] px-2 py-1 text-[11px] uppercase tracking-[0.08em] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
          style={{ fontFamily: MONO }}
        >
          {formatDay(data.startsOn)} – {formatDay(data.endsOn)}
          {data.userName ? ` · ${data.userName}` : ""}
          <PencilSquareIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {editingHeader ? (
        <HeaderEditor handover={data} onClose={() => setEditingHeader(false)} />
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ProseCard
          handover={data}
          number="01"
          title="HANDOVER SUMMARY"
          field="notes"
          placeholder="Where things stand overall, and what matters most while you're away."
          empty="Nothing written yet — press Edit to add the shape of it."
        />
        <ProseCard
          handover={data}
          number="02"
          title="DETAILS"
          field="details"
          placeholder="Anything that isn't about one client — who decides what, context, things to watch."
          empty="Nothing here yet — press Edit to add anything that isn't client-specific."
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
          /* ⚠️ Reading is NOT a click target. This was a button, so landing on the
             page and glancing at the summary put you one stray click from a
             textarea. The `Edit` control in the header is the only way in — the
             same rule the client popup now follows. */
          <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-2)]">
            {value || <span className="text-[var(--text-4)]">{empty}</span>}
          </p>
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
 * The client, opened.
 *
 * ── Read first, edit on request ─────────────────────────────────────────────
 * It used to open straight into three textareas. That is the wrong default by a
 * long way: the people this page exists for — somebody covering, mid-week,
 * looking up one client — are here to READ. Dropping them into a form makes the
 * common case look like a task and puts every word one stray keystroke from
 * being changed.
 *
 * It uses `BackstageModal`, so it is the same dialog as Leave and Expenses
 * rather than a third shape inside one product.
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<HandoverClientDTO | null>(entry);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setDraft(entry);
    setEditing(false);
    setError(null);
    setConfirmDelete(false);
  }, [entry]);

  if (!entry || !draft) return null;

  const sections = [
    {
      key: "summary" as const,
      label: "Where we're at",
      hint: "The state of play — what's shipped, what's in flight, who's involved.",
      value: draft.summary ?? "",
    },
    {
      key: "duties" as const,
      label: "Duties",
      hint: "What somebody has to keep doing while I'm away, and where.",
      value: draft.duties ?? "",
    },
    {
      key: "other" as const,
      label: "Anything else",
      hint: "Decisions pending, risks, context — whatever doesn't fit above.",
      value: draft.other ?? "",
    },
  ];

  const footer = (
    <div className="flex flex-wrap items-center gap-2">
      {editing ? (
        <>
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
                .then(() => setEditing(false))
                .catch(() => setError("Couldn't save that."));
            }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              // Back to what is STORED, not to what was being typed — a Cancel
              // that keeps the edits is not a cancel.
              setDraft(entry);
              setEditing(false);
              setError(null);
            }}
            className="px-2 py-1.5 text-xs text-[var(--text-3)]"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[var(--brand-800)]"
          >
            <PencilSquareIcon className="h-3.5 w-3.5" /> Edit
          </button>
          <button type="button" onClick={onClose} className="px-2 py-1.5 text-xs text-[var(--text-3)]">
            Close
          </button>
        </>
      )}
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
            // ⚠️ Clear the confirm on FAILURE too, or the button reads "Remove this
            // client?" for ever, which looks unresponsive and invites a second
            // click (§50.8).
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
  );

  return (
    <BackstageModal eyebrow="CLIENT" title={entry.clientName} onClose={onClose} footer={footer}>
      <div className="space-y-5 px-6 py-5">
        {editing
          ? sections.map((f) => (
              <PanelField
                key={f.key}
                label={f.label}
                hint={f.hint}
                value={f.value}
                onChange={(v) => setDraft({ ...draft, [f.key]: v })}
              />
            ))
          : sections.map((f) => (
              <section key={f.key}>
                <h3
                  className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]"
                  style={{ fontFamily: MONO }}
                >
                  {f.label}
                </h3>
                {/* `whitespace-pre-wrap` so the paragraph breaks the author typed
                    survive — this is prose, and reflowing it into one block is the
                    difference between a note and a wall. */}
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-[var(--text-2)]">
                  {f.value.trim() || <span className="text-[var(--text-4)]">Nothing written.</span>}
                </p>
              </section>
            ))}
      </div>
    </BackstageModal>
  );
}

/** Title, who is away, and the dates — the things the page had no way to change. */
function HeaderEditor({ handover, onClose }: { handover: HandoverDTO; onClose: () => void }) {
  const update = useUpdateHandover(handover.id);
  const team = useBackstageTeam();
  const [title, setTitle] = useState(handover.title);
  const [userId, setUserId] = useState(handover.userId);
  const [startsOn, setStartsOn] = useState(handover.startsOn.slice(0, 10));
  const [endsOn, setEndsOn] = useState(handover.endsOn.slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const badRange = Boolean(startsOn && endsOn && endsOn < startsOn);

  const footer = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={!title.trim() || badRange || update.isPending}
        className="rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        onClick={() => {
          setError(null);
          void update
            .mutateAsync({ title: title.trim(), userId, startsOn, endsOn })
            .then(onClose)
            .catch(() => setError("Couldn't save that."));
        }}
      >
        Save
      </button>
      <button type="button" onClick={onClose} className="px-2 py-1.5 text-xs text-[var(--text-3)]">
        Cancel
      </button>
      {error ? <span className="text-xs text-[var(--danger-500)]">{error}</span> : null}
    </div>
  );

  return (
    <BackstageModal
      eyebrow="HANDOVER"
      title="Dates and who's away"
      onClose={onClose}
      footer={footer}
    >
      <div className="space-y-4 px-6 py-5">
        <FieldLabel label="Title">
          <input className="app-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </FieldLabel>
        <FieldLabel label="Who's away">
          <select className="app-select" value={userId} onChange={(e) => setUserId(e.target.value)}>
            {(team.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </FieldLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldLabel label="First day away">
            <input
              className="app-input"
              type="date"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
            />
          </FieldLabel>
          <FieldLabel label="Last day away">
            <input
              className="app-input"
              type="date"
              value={endsOn}
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </FieldLabel>
        </div>
        {/* Said here rather than only on the server, so the reason arrives before
            the request does. The server refuses it either way. */}
        {badRange ? (
          <p className="text-xs text-[var(--danger-500)]">The last day is before the first day.</p>
        ) : null}
      </div>
    </BackstageModal>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span
        className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]"
        style={{ fontFamily: MONO }}
      >
        {label}
      </span>
      {children}
    </label>
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
