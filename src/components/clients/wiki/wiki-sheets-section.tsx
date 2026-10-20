"use client";

/**
 * Sheets — the client's spreadsheets, inside their wiki (CLAUDE.md §73).
 *
 * The answer to "the client keeps a Google Sheet of things they want built, with links
 * everywhere": the same grid, here, editable by the client, where a row can be sent to the
 * developers' task board and then reads its task's progress back — derived from the board
 * on every load, never written back.
 *
 * One sheet is shown at a time (a sheet can be 2,000 rows; stacking several would be a very
 * long page), picked from a segmented control. The team gets New sheet and a settings dialog
 * per sheet (rename, title column, what the client may do, columns, delete). The client gets
 * exactly what each sheet allows — and the server enforces it regardless of the UI.
 */

import { useMemo, useState } from "react";
import { Cog6ToothIcon, PlusIcon } from "@heroicons/react/24/outline";
import { MONO } from "@/components/analytics/analytics-widgets";
import { Modal } from "@/components/ui/modal";
import {
  createWikiSheetApi,
  deleteWikiSheetApi,
  removeWikiSheetColumnApi,
  updateWikiSheetApi,
  updateWikiSheetColumnApi,
  type SheetColumnInputT,
  type SheetsTarget,
} from "@/lib/api";
import { useSheetPeople, useSheetsRefresh } from "@/hooks/use-wiki-sheets";
import { useFeatureBlocks } from "@/hooks/use-tasks";
import { COLUMN_TYPES, COLUMN_TYPE_LABEL, SHEET_LIMITS } from "@/lib/wiki-sheets";
import type { SheetColumnType, WikiSheet, WikiSheetsSection } from "@/types/wiki-sheets";
import { SheetGrid } from "./sheet-grid";

const TEMPLATES: { key: string; label: string; blurb: string; columns: SheetColumnInputT[] }[] = [
  {
    key: "content",
    label: "Content to build",
    blurb: "Pages, features and copy — with type, priority, a wanted-by date and links.",
    columns: [
      { title: "Item", type: "text" },
      { title: "Type", type: "select", options: ["Page", "Feature", "Content", "Fix"] },
      { title: "Priority", type: "select", options: ["Low", "Medium", "High"] },
      { title: "Wanted by", type: "date" },
      { title: "Reference", type: "link" },
      { title: "Notes", type: "long_text" },
    ],
  },
  {
    key: "bugs",
    label: "Bug list",
    blurb: "What's wrong, where, on which device, and how bad.",
    columns: [
      { title: "Issue", type: "text" },
      { title: "Where", type: "text" },
      { title: "Device", type: "select", options: ["iOS", "Android", "Web", "All"] },
      { title: "Severity", type: "select", options: ["Low", "Medium", "High", "Critical"] },
      { title: "Screenshot", type: "link" },
      { title: "Fixed", type: "checkbox", clientEditable: false },
    ],
  },
  {
    key: "links",
    label: "Links & assets",
    blurb: "A tidy list of every link and file the project needs.",
    columns: [
      { title: "Asset", type: "text" },
      { title: "Link", type: "link" },
      { title: "Owner", type: "person" },
      { title: "Final", type: "checkbox" },
    ],
  },
  { key: "blank", label: "Blank", blurb: "One text column. Add the rest yourself.", columns: [{ title: "Item", type: "text" }] },
];

export function WikiSheetsSectionView({
  slug,
  token,
  clientId,
  section,
  mode,
}: {
  slug: string;
  /** The share token — required for the client's (public) mode. */
  token?: string;
  clientId?: string;
  section: WikiSheetsSection;
  mode: "internal" | "public";
}) {
  const target: SheetsTarget = mode === "internal" ? { mode, slug } : { mode, token: token ?? "" };
  const refresh = useSheetsRefresh(target);
  const sheets = section.sheets;
  // The person picker's list is only fetched when some sheet has a person column.
  const people = useSheetPeople(target, sheets.some((s) => s.columns.some((c) => c.type === "person")));
  const [activeId, setActiveId] = useState<string | null>(sheets[0]?.id ?? null);
  const active = sheets.find((s) => s.id === activeId) ?? sheets[0] ?? null;
  const [creating, setCreating] = useState(false);
  const [settingsFor, setSettingsFor] = useState<WikiSheet | null>(null);
  const blocks = useFeatureBlocks(mode === "internal" ? (clientId ?? null) : null);
  const featureBlocks = useMemo(
    () => (blocks.data ?? []).map((b: { id: string; name: string }) => ({ id: b.id, name: b.name })),
    [blocks.data],
  );

  return (
    <div className="space-y-4">
      {(sheets.length > 1 || mode === "internal") && (
        <div className="flex flex-wrap items-center gap-2">
          {sheets.length > 1 && (
            <div
              role="tablist"
              aria-label="Sheets"
              className="flex max-w-full flex-wrap gap-1 rounded-[8px] border border-[var(--border-1)] bg-[var(--surface-1)] p-1"
            >
              {sheets.map((s) => {
                const on = s.id === active?.id;
                const count = s.rows.filter((r) => !r.deletedAt).length;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setActiveId(s.id)}
                    className={`inline-flex max-w-[240px] items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase transition ${
                      on
                        ? "bg-[var(--surface-0)] text-[var(--brand-600)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                        : "text-[var(--text-3)] hover:text-[var(--text-1)]"
                    }`}
                    style={{ fontFamily: MONO }}
                    title={s.title}
                  >
                    <span className="truncate">{s.title}</span>
                    <span className="rounded-[4px] bg-[var(--surface-1)] px-1 text-[10px] text-[var(--text-3)]">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
          {mode === "internal" && (
            <button
              type="button"
              className="app-button app-button-secondary app-button-sm ml-auto"
              onClick={() => setCreating(true)}
              disabled={sheets.length >= SHEET_LIMITS.maxSheets}
            >
              <PlusIcon className="h-4 w-4" />
              New sheet
            </button>
          )}
        </div>
      )}

      {!active ? (
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label" style={{ fontFamily: MONO }}>
              <span className="widget-header__label--number">01</span>
              {" // SHEETS"}
            </span>
          </div>
          <p className="p-8 text-center text-sm text-[var(--text-4)]">
            {mode === "internal"
              ? "No sheets yet. Make one for the list the client keeps in Google Sheets — they can edit it here, and any row can go straight to the board."
              : "No sheets have been shared yet."}
          </p>
        </section>
      ) : (
        <SheetGrid
          key={active.id}
          sheet={active}
          index={sheets.indexOf(active)}
          target={target}
          mode={mode}
          people={people}
          featureBlocks={featureBlocks}
          onRefresh={refresh}
          headerExtra={
            mode === "internal" ? (
              <button
                type="button"
                className="rounded-[4px] p-1 text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                aria-label={`Sheet settings: ${active.title}`}
                onClick={() => setSettingsFor(active)}
              >
                <Cog6ToothIcon className="h-4 w-4" />
              </button>
            ) : (
              <ClientPermissionNote sheet={active} />
            )
          }
        />
      )}

      {creating && (
        <NewSheetDialog
          onClose={() => setCreating(false)}
          onCreate={async (title, columns) => {
            const res = await createWikiSheetApi(slug, { title, columns });
            setActiveId(res.sheet.id);
            refresh();
          }}
        />
      )}
      {settingsFor && (
        <SheetSettingsDialog
          slug={slug}
          sheet={sheets.find((s) => s.id === settingsFor.id) ?? settingsFor}
          onClose={() => setSettingsFor(null)}
          onChanged={refresh}
          onDeleted={() => {
            setSettingsFor(null);
            setActiveId(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

/** Tells the client, in words, what this sheet lets them do — rather than greyed controls. */
function ClientPermissionNote({ sheet }: { sheet: WikiSheet }) {
  const text = !sheet.clientCanEdit && !sheet.clientCanAddRows ? "View only" : sheet.clientCanSendToBoard ? "Editable · can send to board" : "Editable";
  return (
    <span className="hidden text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase sm:inline" style={{ fontFamily: MONO }}>
      {text}
    </span>
  );
}

function NewSheetDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (title: string, columns: SheetColumnInputT[]) => Promise<void>;
}) {
  const [template, setTemplate] = useState(TEMPLATES[0].key);
  const [title, setTitle] = useState(TEMPLATES[0].label);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = TEMPLATES.find((t) => t.key === template) ?? TEMPLATES[0];
  return (
    <Modal open onClose={onClose} title="NEW SHEET" panelClassName="w-full max-w-lg">
      <form
        className="space-y-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          setBusy(true);
          setError(null);
          try {
            await onCreate(title.trim(), chosen.columns);
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't create the sheet.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1 text-[12px] text-[var(--text-3)]">Start from</legend>
          {TEMPLATES.map((t) => (
            <label
              key={t.key}
              className={`cursor-pointer rounded-[8px] border p-2.5 text-[13px] ${
                template === t.key ? "border-[var(--brand-600)] bg-[var(--brand-50)]" : "border-[var(--border-1)]"
              }`}
            >
              <input
                type="radio"
                name="sheet-template"
                value={t.key}
                checked={template === t.key}
                onChange={() => {
                  // Keep a title the person typed; swap one that is still a template name.
                  if (TEMPLATES.some((x) => x.label === title)) setTitle(t.label);
                  setTemplate(t.key);
                }}
                className="sr-only"
              />
              <span className="block font-medium text-[var(--text-1)]">{t.label}</span>
              <span className="mt-0.5 block text-[12px] text-[var(--text-3)]">{t.blurb}</span>
            </label>
          ))}
        </fieldset>
        <label className="block text-[12px] text-[var(--text-3)]">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={SHEET_LIMITS.maxTitle}
            className="app-input mt-1 w-full text-base sm:text-sm"
          />
        </label>
        {error && <p className="text-[12px] text-[var(--danger-500)]">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="app-button app-button-secondary app-button-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="app-button app-button-primary app-button-sm" disabled={busy || !title.trim()}>
            Create sheet
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Team: rename, title column, the client's permissions, columns (type / options / lock / order), delete. */
type SettingsPane = { kind: "sheet" } | { kind: "column"; id: string };

/**
 * Sheet settings — the standard two-column popup (DESIGN.md): pick on the left (the sheet
 * itself, then each column), edit on the right. Fixed height, so moving between columns
 * never resizes the box. Every change saves as it's made.
 */
function SheetSettingsDialog({
  slug,
  sheet,
  onClose,
  onChanged,
  onDeleted,
}: {
  slug: string;
  sheet: WikiSheet;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [pane, setPane] = useState<SettingsPane>({ kind: "sheet" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
    }
  };
  const patchSheet = (p: Parameters<typeof updateWikiSheetApi>[2]) => run(() => updateWikiSheetApi(slug, sheet.id, p));
  const colIndex = pane.kind === "column" ? sheet.columns.findIndex((c) => c.id === pane.id) : -1;
  const column = colIndex >= 0 ? sheet.columns[colIndex] : null;

  const railItem = (active: boolean) =>
    `flex w-full min-w-0 items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] ${
      active ? "bg-[var(--brand-50,rgba(29,78,216,0.08))] text-[var(--brand-600,#1D4ED8)]" : "text-[var(--text-2)] hover:bg-[var(--surface-1)]"
    }`;

  return (
    <Modal open onClose={onClose} title="SHEET SETTINGS" panelClassName="app-dialog-fixed w-full max-w-3xl">
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] sm:grid-cols-[220px_minmax(0,1fr)] sm:grid-rows-1">
        <nav
          aria-label="Settings sections"
          className="flex min-h-0 gap-1 overflow-x-auto border-b border-[var(--border-1)] p-2 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto sm:border-r sm:border-b-0"
        >
          <button type="button" className={`${railItem(pane.kind === "sheet")} shrink-0 sm:shrink`} onClick={() => setPane({ kind: "sheet" })}>
            <Cog6ToothIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">Sheet</span>
          </button>
          <p className="hidden px-2.5 pt-3 pb-1 text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase sm:block" style={{ fontFamily: MONO }}>
            Columns · {sheet.columns.length}
          </p>
          {sheet.columns.map((c) => (
            <button
              key={c.id}
              type="button"
              title={c.title}
              className={`${railItem(pane.kind === "column" && pane.id === c.id)} shrink-0 sm:shrink`}
              onClick={() => {
                setNotice(null);
                setPane({ kind: "column", id: c.id });
              }}
            >
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              <span className="hidden shrink-0 text-[10px] tracking-[0.06em] text-[var(--text-4)] uppercase sm:inline" style={{ fontFamily: MONO }}>
                {COLUMN_TYPE_LABEL[c.type]}
              </span>
            </button>
          ))}
        </nav>

        <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
          {pane.kind === "sheet" || !column ? (
            <SheetGeneralPane key={sheet.id} sheet={sheet} onPatch={patchSheet} />
          ) : (
            <ColumnPane
              key={column.id}
              column={column}
              first={colIndex === 0}
              last={colIndex === sheet.columns.length - 1}
              onPatch={(p) =>
                run(async () => {
                  const res = await updateWikiSheetColumnApi(slug, sheet.id, column.id, p);
                  setNotice(
                    res.cleared > 0
                      ? `${res.cleared} value${res.cleared === 1 ? "" : "s"} in "${column.title}" didn't fit the new type and were cleared.`
                      : null,
                  );
                })
              }
              onMove={(d) => run(() => updateWikiSheetColumnApi(slug, sheet.id, column.id, { position: colIndex + d }))}
              onRemove={() => {
                if (window.confirm(`Remove the column "${column.title}"? Its values will no longer show.`)) {
                  setPane({ kind: "sheet" });
                  void run(() => removeWikiSheetColumnApi(slug, sheet.id, column.id));
                }
              }}
            />
          )}
          {notice && <p className="mt-4 text-[12px] text-[var(--warning-500)]">{notice}</p>}
          {error && <p className="mt-4 text-[12px] text-[var(--danger-500)]">{error}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--border-1)] px-4 py-3">
        <button
          type="button"
          className="app-button app-button-tertiary app-button-sm text-[var(--danger-500)]"
          onClick={async () => {
            if (!window.confirm(`Delete the sheet "${sheet.title}" and every row in it? This cannot be undone.`)) return;
            try {
              await deleteWikiSheetApi(slug, sheet.id);
              onDeleted();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't delete the sheet.");
            }
          }}
        >
          Delete sheet
        </button>
        <span className="ml-auto hidden text-[11px] text-[var(--text-4)] sm:inline">Changes save as you make them.</span>
        <button type="button" className="app-button app-button-primary app-button-sm max-sm:ml-auto" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

function PaneLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[10px] tracking-[0.1em] text-[var(--text-3)] uppercase" style={{ fontFamily: MONO }}>
      {children}
    </p>
  );
}

function SheetGeneralPane({ sheet, onPatch }: { sheet: WikiSheet; onPatch: (p: Parameters<typeof updateWikiSheetApi>[2]) => void }) {
  const [title, setTitle] = useState(sheet.title);
  const [description, setDescription] = useState(sheet.description ?? "");
  return (
    <div className="space-y-5">
      <label className="block">
        <PaneLabel>Title</PaneLabel>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== sheet.title && onPatch({ title: title.trim() })}
          maxLength={SHEET_LIMITS.maxTitle}
          className="app-input w-full text-base sm:text-sm"
        />
      </label>
      <label className="block">
        <PaneLabel>Description · the client sees this</PaneLabel>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (sheet.description ?? "") && onPatch({ description: description.trim() || null })}
          maxLength={SHEET_LIMITS.maxDescription}
          className="app-input min-h-[72px] w-full py-2 text-base leading-6 sm:text-sm"
        />
      </label>
      <label className="block">
        <PaneLabel>Task title comes from</PaneLabel>
        <select
          value={sheet.titleColumnId ?? ""}
          onChange={(e) => onPatch({ titleColumnId: e.target.value || null })}
          className="app-input app-select-chevron w-full pr-9 text-base sm:text-sm"
        >
          <option value="">First text column</option>
          {sheet.columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <PaneLabel>What the client can do</PaneLabel>
        <div className="divide-y divide-[var(--border-1)] rounded-[8px] border border-[var(--border-1)]">
          {(
            [
              ["clientCanEdit", "Edit cells", "Only in columns set to “Client can edit”."],
              ["clientCanAddRows", "Add rows", "New rows are marked as theirs."],
              ["clientCanSendToBoard", "Send rows to the task board", "Each send notifies the team."],
            ] as const
          ).map(([key, label, hint]) => (
            <label key={key} className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
              <input
                type="checkbox"
                checked={sheet[key]}
                onChange={(e) => onPatch({ [key]: e.target.checked })}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-[13px] text-[var(--text-1)]">{label}</span>
                <span className="block text-[12px] text-[var(--text-3)]">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function ColumnPane({
  column,
  first,
  last,
  onPatch,
  onMove,
  onRemove,
}: {
  column: WikiSheet["columns"][number];
  first: boolean;
  last: boolean;
  onPatch: (p: { title?: string; type?: SheetColumnType; options?: string[]; clientEditable?: boolean }) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [title, setTitle] = useState(column.title);
  const [draftOption, setDraftOption] = useState("");
  const options = column.options ?? [];
  const addOption = () => {
    const next = draftOption
      .split(/[,\n]/)
      .map((o) => o.trim())
      .filter((o) => o && !options.includes(o));
    setDraftOption("");
    if (next.length) onPatch({ options: [...options, ...next] });
  };
  return (
    <div className="space-y-5">
      <label className="block">
        <PaneLabel>Column title</PaneLabel>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== column.title && onPatch({ title: title.trim() })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          maxLength={SHEET_LIMITS.maxColumnTitle}
          className="app-input w-full text-base sm:text-sm"
        />
      </label>
      <label className="block">
        <PaneLabel>Type</PaneLabel>
        <select
          value={column.type}
          onChange={(e) => onPatch({ type: e.target.value as SheetColumnType })}
          className="app-input app-select-chevron w-full pr-9 text-base sm:text-sm"
        >
          {COLUMN_TYPES.map((t) => (
            <option key={t} value={t}>
              {COLUMN_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      {column.type === "select" && (
        <div>
          <PaneLabel>Options · {options.length}</PaneLabel>
          {options.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {options.map((o, i) => (
                <li
                  key={o}
                  className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--surface-1)] py-0.5 pr-0.5 pl-2 text-[12px] text-[var(--text-2)] ring-1 ring-[var(--border-1)]"
                >
                  {o}
                  <button
                    type="button"
                    aria-label={`Remove option ${o}`}
                    className="rounded-[3px] px-1 text-[var(--text-4)] hover:text-[var(--danger-500)]"
                    onClick={() => onPatch({ options: options.filter((_, k) => k !== i) })}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-1.5">
            <input
              value={draftOption}
              onChange={(e) => setDraftOption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOption();
                }
              }}
              placeholder="Add an option (Enter)"
              aria-label={`Add an option to ${column.title}`}
              className="app-input h-8 min-w-0 flex-1 py-0 text-base sm:text-[13px]"
            />
            <button type="button" className="app-button app-button-secondary app-button-xs" disabled={!draftOption.trim()} onClick={addOption}>
              Add
            </button>
          </div>
        </div>
      )}
      <label className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-[var(--border-1)] px-3 py-2.5">
        <input
          type="checkbox"
          checked={column.clientEditable}
          onChange={(e) => onPatch({ clientEditable: e.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span className="min-w-0">
          <span className="block text-[13px] text-[var(--text-1)]">Client can edit</span>
          <span className="block text-[12px] text-[var(--text-3)]">Off makes this column read-only on the client&apos;s page.</span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-1)] pt-4">
        <PaneLabel>Position</PaneLabel>
        <button type="button" className="app-button app-button-secondary app-button-xs" disabled={first} onClick={() => onMove(-1)}>
          ← Move left
        </button>
        <button type="button" className="app-button app-button-secondary app-button-xs" disabled={last} onClick={() => onMove(1)}>
          Move right →
        </button>
        <button type="button" className="app-button app-button-tertiary app-button-xs ml-auto text-[var(--danger-500)]" onClick={onRemove}>
          Remove column
        </button>
      </div>
    </div>
  );
}
