"use client";

/**
 * Comparisons — feature/plan comparison tables on a client's wiki.
 *
 * One `widget-card` per table, numbered `01 // TITLE`. Read-only for the client; for the
 * team each card has an Edit toggle that turns the same table into its own editor —
 * rename a column by clicking it, click a cell to cycle ✓ → ◐ → ✕ → blank, type to write a
 * value — and saves itself a moment after each change. Editing in place rather than in a
 * dialog is deliberate: a 45-column table does not fit in a dialog, and the thing being
 * edited is exactly what the client will see.
 *
 * On a phone a wide table is still reachable by scrolling, but the default is a
 * compare-two view (pick any two columns), because a 45-column sideways scroll is not a
 * comparison anyone can read on 390px.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { EllipsisHorizontalIcon, PlusIcon } from "@heroicons/react/24/outline";
import { MONO } from "@/components/analytics/analytics-widgets";
import { Modal } from "@/components/ui/modal";
import { menuItem, menuPanel } from "@/components/ui/menu-styles";
import {
  useCreateWikiComparison,
  useDeleteWikiComparison,
  useReorderWikiComparisons,
  useUpdateWikiComparison,
} from "@/hooks/use-wiki";
import {
  COMPARISON_LIMITS,
  COMPARISON_TEMPLATES,
  addRows,
  type ComparisonContent,
} from "@/lib/wiki-comparisons";
import type { WikiComparison, WikiComparisonsSection } from "@/types/wiki-comparisons";
import { ComparisonLegend, ComparisonTable } from "./comparison-table";

/** How long after the last change an edit is saved. */
const AUTOSAVE_MS = 800;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function WikiComparisonsSectionView({
  slug,
  section,
  mode,
}: {
  slug: string;
  section: WikiComparisonsSection;
  mode: "internal" | "public";
}) {
  const tables = section.comparisons;
  const [creating, setCreating] = useState(false);
  // A table just created opens straight into edit mode.
  const [autoEditId, setAutoEditId] = useState<string | null>(null);
  const reorder = useReorderWikiComparisons(slug);
  const remove = useDeleteWikiComparison(slug);

  const move = (id: string, delta: number) => {
    const ids = tables.map((t) => t.id);
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  };

  return (
    <div className="space-y-4">
      {mode === "internal" && tables.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className="text-[11px] tracking-[0.08em] text-[var(--text-4)] uppercase"
            style={{ fontFamily: MONO }}
          >
            {tables.length} {tables.length === 1 ? "table" : "tables"}
          </span>
          <button
            type="button"
            className="app-button app-button-secondary app-button-sm"
            onClick={() => setCreating(true)}
            disabled={tables.length >= COMPARISON_LIMITS.maxTables}
          >
            <PlusIcon className="h-4 w-4" />
            New table
          </button>
        </div>
      )}

      {tables.length === 0 ? (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label" style={{ fontFamily: MONO }}>
              <span className="widget-header__label--number">01</span>
              {" // COMPARISONS"}
            </span>
            {mode === "internal" && (
              <button
                type="button"
                className="app-button app-button-secondary app-button-xs"
                onClick={() => setCreating(true)}
              >
                New table
              </button>
            )}
          </div>
          <p className="p-8 text-center text-sm text-[var(--text-4)]">
            {mode === "internal"
              ? "No comparisons yet. Compare plans (Free, Premium, Pro), releases, or the product against its competitors — up to 45 columns."
              : "No comparisons have been published yet."}
          </p>
        </section>
      ) : (
        tables.map((table, i) => (
          <ComparisonCard
            key={table.id}
            slug={slug}
            table={table}
            index={i}
            mode={mode}
            first={i === 0}
            last={i === tables.length - 1}
            startEditing={autoEditId === table.id}
            onMove={(d) => move(table.id, d)}
            onDelete={() => {
              if (window.confirm(`Delete the table "${table.title}"? This cannot be undone.`)) {
                remove.mutate(table.id);
              }
            }}
          />
        ))
      )}

      {creating && (
        <NewComparisonDialog
          slug={slug}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setAutoEditId(id);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── card ── */

interface Draft {
  title: string;
  description: string;
  content: ComparisonContent;
}

function draftOf(table: WikiComparison): Draft {
  return {
    title: table.title,
    description: table.description ?? "",
    content: { columns: table.columns, rows: table.rows },
  };
}

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

function ComparisonCard({
  slug,
  table,
  index,
  mode,
  first,
  last,
  startEditing,
  onMove,
  onDelete,
}: {
  slug: string;
  table: WikiComparison;
  index: number;
  mode: "internal" | "public";
  first: boolean;
  last: boolean;
  startEditing: boolean;
  onMove: (delta: number) => void;
  onDelete: () => void;
}) {
  const update = useUpdateWikiComparison(slug);
  const [editing, setEditing] = useState(startEditing && mode === "internal");
  const [draft, setDraft] = useState<Draft>(() => draftOf(table));
  // After Done, keep showing what was saved until the refetched table arrives, so the
  // card never flicks back to the old version for a frame.
  const [shown, setShown] = useState<{ draft: Draft; since: string } | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(draft);
  const inFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (shown && table.updatedAt !== shown.since) setShown(null);
  }, [table.updatedAt, shown]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const persist = async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const d = latest.current;
    if (!d.title.trim()) {
      setSave("error");
      setNotice("Give the table a title before it can be saved.");
      return;
    }
    setSave("saving");
    const run = update
      .mutateAsync({
        comparisonId: table.id,
        input: {
          title: d.title.trim(),
          description: d.description.trim() || null,
          columns: d.content.columns,
          rows: d.content.rows,
        },
      })
      .then(() => {
        // Only "saved" if nothing changed while the request was out.
        setSave(latest.current === d ? "saved" : "pending");
        setNotice(null);
      })
      .catch((err: unknown) => {
        setSave("error");
        setNotice(err instanceof Error ? err.message : "Could not save the table.");
      });
    inFlight.current = run;
    await run;
  };

  const changeDraft = (next: Draft) => {
    latest.current = next;
    setDraft(next);
    setSave("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(), AUTOSAVE_MS);
  };

  const begin = () => {
    const d = draftOf(table);
    latest.current = d;
    setDraft(d);
    setSave("idle");
    setNotice(null);
    setEditing(true);
  };

  const finish = async () => {
    if (save === "pending" || timer.current) await persist();
    else if (inFlight.current) await inFlight.current;
    setShown({ draft: latest.current, since: table.updatedAt });
    setEditing(false);
  };

  const view: Draft = editing ? draft : (shown?.draft ?? draftOf(table));
  const label = `${pad(index + 1)}`;

  return (
    <section className="widget-card" aria-label={view.title}>
      <div className="widget-header gap-3">
        <span className="widget-header__label min-w-0 truncate" style={{ fontFamily: MONO }} title={view.title}>
          <span className="widget-header__label--number">{label}</span>
          {` // ${view.title.toUpperCase()}`}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {mode === "internal" ? (
            <>
              {editing && <SaveStatus state={save} onRetry={() => void persist()} />}
              {editing ? (
                <button
                  type="button"
                  className="app-button app-button-primary app-button-xs"
                  onClick={() => void finish()}
                >
                  Done
                </button>
              ) : (
                <button
                  type="button"
                  className="app-button app-button-secondary app-button-xs"
                  onClick={begin}
                >
                  Edit
                </button>
              )}
              <Menu>
                <MenuButton
                  className="rounded-[4px] p-1 text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                  aria-label={`Table options: ${view.title}`}
                >
                  <EllipsisHorizontalIcon className="h-4 w-4" />
                </MenuButton>
                <MenuItems anchor="bottom end" className={`${menuPanel} w-44`}>
                  <MenuItem disabled={first}>
                    <button type="button" className={`${menuItem} data-[disabled]:opacity-40`} onClick={() => onMove(-1)}>
                      Move up
                    </button>
                  </MenuItem>
                  <MenuItem disabled={last}>
                    <button type="button" className={`${menuItem} data-[disabled]:opacity-40`} onClick={() => onMove(1)}>
                      Move down
                    </button>
                  </MenuItem>
                  <MenuItem>
                    <button type="button" className={`${menuItem} text-[var(--danger-500)]`} onClick={onDelete}>
                      Delete table
                    </button>
                  </MenuItem>
                </MenuItems>
              </Menu>
            </>
          ) : (
            <span
              className="text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase"
              style={{ fontFamily: MONO }}
            >
              {view.content.columns.length} {view.content.columns.length === 1 ? "column" : "columns"}
            </span>
          )}
        </div>
      </div>

      {editing ? (
        <div className="grid gap-3 border-b border-[var(--border-2)] p-4 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <label className="block">
            <span className="app-field-label">Title</span>
            <input
              className="app-input text-base sm:text-sm"
              value={draft.title}
              maxLength={COMPARISON_LIMITS.maxTableTitle}
              onChange={(e) => changeDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="app-field-label">Description (optional)</span>
            <input
              className="app-input text-base sm:text-sm"
              value={draft.description}
              maxLength={COMPARISON_LIMITS.maxDescription}
              placeholder="One line on what is being compared."
              onChange={(e) => changeDraft({ ...draft, description: e.target.value })}
            />
          </label>
        </div>
      ) : (
        view.description && (
          <p className="px-4 pt-3 text-[13px] leading-relaxed text-[var(--text-3)]">{view.description}</p>
        )
      )}

      <TableBody
        view={view}
        editing={editing}
        onChange={(content) => changeDraft({ ...draft, content })}
        onNotice={setNotice}
      />

      <div className="space-y-2 border-t border-[var(--border-2)] px-4 py-3">
        {editing && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="app-button app-button-secondary app-button-xs"
              onClick={() => {
                try {
                  changeDraft({ ...draft, content: addRows(draft.content, [{ kind: "row", label: "" }]) });
                } catch (err) {
                  setNotice(err instanceof Error ? err.message : "Could not add a row.");
                }
              }}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Feature
            </button>
            <button
              type="button"
              className="app-button app-button-secondary app-button-xs"
              onClick={() => {
                try {
                  changeDraft({ ...draft, content: addRows(draft.content, [{ kind: "group", label: "" }]) });
                } catch (err) {
                  setNotice(err instanceof Error ? err.message : "Could not add a group.");
                }
              }}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Group
            </button>
            <span
              className="ml-auto text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase"
              style={{ fontFamily: MONO }}
            >
              {draft.content.columns.length}/{COMPARISON_LIMITS.maxColumns} columns ·{" "}
              {draft.content.rows.length} rows · click a cell to cycle · type to write a value
            </span>
          </div>
        )}
        {notice && (
          <p role="alert" className="text-[12px] text-[var(--danger-500)]">
            {notice}
          </p>
        )}
        <ComparisonLegend
          trailing={
            view.content.columns.length > 5 ? (
              <span className="hidden sm:ml-auto sm:inline">Scroll sideways for all {view.content.columns.length}</span>
            ) : undefined
          }
        />
      </div>
    </section>
  );
}

function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "error") {
    return (
      <button
        type="button"
        className="text-[10px] tracking-[0.1em] text-[var(--danger-500)] uppercase underline"
        style={{ fontFamily: MONO }}
        onClick={onRetry}
      >
        Not saved · retry
      </button>
    );
  }
  const text = state === "saving" || state === "pending" ? "Saving…" : state === "saved" ? "Saved" : "";
  return (
    <span
      aria-live="polite"
      className="hidden text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase sm:inline"
      style={{ fontFamily: MONO }}
    >
      {text}
    </span>
  );
}

/* ───────────────────────────────────────────────── table + phone view ── */

/**
 * The columns a phone compares by default: the featured one and the leftmost other one
 * (Northwind vs its first competitor; Free vs the recommended plan), shown in table order.
 */
export function defaultCompareColumns(columns: { id: string; highlight?: boolean }[]): [string, string] {
  const featured = columns.filter((c) => c.highlight).map((c) => c.id);
  const rest = columns.filter((c) => !c.highlight).map((c) => c.id);
  const picked = [...featured.slice(0, 1), ...rest, ...featured.slice(1)].slice(0, 2);
  const ids = columns.map((c) => c.id);
  picked.sort((x, y) => ids.indexOf(x) - ids.indexOf(y));
  return [picked[0] ?? "", picked[1] ?? picked[0] ?? ""];
}

function TableBody({
  view,
  editing,
  onChange,
  onNotice,
}: {
  view: Draft;
  editing: boolean;
  onChange: (content: ComparisonContent) => void;
  onNotice: (message: string) => void;
}) {
  const columns = view.content.columns;
  const defaults = useMemo(() => defaultCompareColumns(columns), [columns]);
  const [pick, setPick] = useState<[string, string]>(defaults);
  const [showAll, setShowAll] = useState(false);
  const valid = (id: string) => columns.some((c) => c.id === id);
  const a = valid(pick[0]) ? pick[0] : defaults[0];
  const b = valid(pick[1]) ? pick[1] : defaults[1];
  const compareable = !editing && columns.length > 2;

  const full = (
    <ComparisonTable
      content={view.content}
      caption={view.title}
      editing={editing}
      onChange={onChange}
      onNotice={onNotice}
    />
  );

  if (!compareable) return full;

  const select = (which: 0 | 1, value: string, label: string) => (
    <select
      aria-label={label}
      className="app-select-chevron min-w-0 flex-1 rounded-[6px] border border-[var(--border-1)] bg-[var(--surface-0)] py-1.5 pr-8 pl-2.5 text-[16px] text-[var(--text-1)]"
      value={value}
      onChange={(e) => {
        const next: [string, string] = [a, b];
        next[which] = e.target.value;
        setPick(next);
      }}
    >
      {columns.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title}
        </option>
      ))}
    </select>
  );

  return (
    <>
      {/* Phone: compare two columns, the full table one tap away. */}
      <div className="sm:hidden" data-comparison-compare="">
        {showAll ? (
          <div className="flex items-center justify-between gap-2 px-4 pt-3">
            <span className="text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase" style={{ fontFamily: MONO }}>
              All {columns.length} columns
            </span>
            <button type="button" className="app-button app-button-tertiary app-button-xs" onClick={() => setShowAll(false)}>
              Compare two
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-4 pt-3">
              {select(0, a, "First column to compare")}
              <span className="shrink-0 text-[10px] text-[var(--text-4)] uppercase" style={{ fontFamily: MONO }}>
                vs
              </span>
              {select(1, b, "Second column to compare")}
            </div>
            <div className="pt-2">
              <ComparisonTable content={view.content} caption={view.title} columnIds={[a, b]} compact />
            </div>
            <div className="px-4 pt-2">
              <button
                type="button"
                className="app-button app-button-tertiary app-button-xs"
                onClick={() => setShowAll(true)}
              >
                Show all {columns.length} columns
              </button>
            </div>
          </>
        )}
      </div>
      <div className={showAll ? "pt-2 sm:pt-0" : "hidden sm:block"}>{full}</div>
    </>
  );
}

/* ───────────────────────────────────────────────────────── new dialog ── */

function NewComparisonDialog({
  slug,
  onClose,
  onCreated,
}: {
  slug: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const create = useCreateWikiComparison(slug);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [templateId, setTemplateId] = useState(COMPARISON_TEMPLATES[0].id);
  const [error, setError] = useState<string | null>(null);
  const template = COMPARISON_TEMPLATES.find((t) => t.id === templateId) ?? COMPARISON_TEMPLATES[0];
  const preview = useMemo(() => template.build(), [template]);

  async function submit() {
    if (!title.trim()) {
      setError("Give the table a title.");
      return;
    }
    setError(null);
    try {
      const content = template.build();
      const res = await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        columns: content.columns,
        rows: content.rows,
      });
      onCreated(res.comparison.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the table.");
    }
  }

  return (
    <Modal open onClose={onClose} title="NEW COMPARISON" panelClassName="app-dialog-fixed w-full max-w-3xl">
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:overflow-visible">
        <div className="space-y-4 border-[var(--border-1)] p-5 md:min-h-0 md:overflow-y-auto md:border-r">
          <label className="block">
            <span className="app-field-label">Title</span>
            <input
              className="app-input text-base sm:text-sm"
              value={title}
              maxLength={COMPARISON_LIMITS.maxTableTitle}
              placeholder="e.g. What's in each plan"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </label>
          <label className="block">
            <span className="app-field-label">Description (optional)</span>
            <textarea
              className="app-input min-h-[72px] py-2 text-base leading-6 sm:text-sm"
              value={description}
              maxLength={COMPARISON_LIMITS.maxDescription}
              placeholder="One line on what is being compared."
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <fieldset>
            <legend className="app-field-label">Start from</legend>
            <div className="mt-1 space-y-1.5">
              {COMPARISON_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={t.id === templateId}
                  onClick={() => setTemplateId(t.id)}
                  className={`block w-full rounded-[6px] border px-3 py-2 text-left transition ${
                    t.id === templateId
                      ? "border-[var(--brand-600)] bg-[var(--brand-50)]"
                      : "border-[var(--border-1)] hover:bg-[var(--surface-1)]"
                  }`}
                >
                  <span className="block text-[13px] font-semibold text-[var(--text-1)]">{t.label}</span>
                  <span className="block text-[12px] text-[var(--text-4)]">{t.blurb}</span>
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="min-w-0 p-5 md:min-h-0 md:overflow-y-auto">
          <p className="mb-2 text-[10px] tracking-[0.12em] text-[var(--text-4)] uppercase" style={{ fontFamily: MONO }}>
            Preview · you can rename and add everything after
          </p>
          <div className="overflow-hidden rounded-[10px] border border-[var(--border-2)]">
            <ComparisonTable content={preview} caption={`${template.label} preview`} />
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--border-1)] px-5 py-3">
        <p className="min-w-0 text-[12px] text-[var(--danger-500)]" role="alert">
          {error}
        </p>
        <div className="flex gap-2">
          <button type="button" className="app-button app-button-secondary app-button-xs" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="app-button app-button-primary app-button-xs"
            onClick={() => void submit()}
            disabled={create.isPending}
          >
            {create.isPending ? "Creating…" : "Create table"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
