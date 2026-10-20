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
import { useSheetsRefresh } from "@/hooks/use-wiki-sheets";
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
  people,
}: {
  slug: string;
  /** The share token — required for the client's (public) mode. */
  token?: string;
  clientId?: string;
  section: WikiSheetsSection;
  mode: "internal" | "public";
  people: string[];
}) {
  const target: SheetsTarget = mode === "internal" ? { mode, slug } : { mode, token: token ?? "" };
  const refresh = useSheetsRefresh(target);
  const sheets = section.sheets;
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
  const [title, setTitle] = useState(sheet.title);
  const [description, setDescription] = useState(sheet.description ?? "");
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

  return (
    <Modal open onClose={onClose} title="SHEET SETTINGS" panelClassName="app-dialog-fixed w-full max-w-2xl">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[12px] text-[var(--text-3)]">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== sheet.title && void patchSheet({ title: title.trim() })}
              maxLength={SHEET_LIMITS.maxTitle}
              className="app-input mt-1 w-full text-base sm:text-sm"
            />
          </label>
          <label className="block text-[12px] text-[var(--text-3)]">
            Task title comes from
            <select
              value={sheet.titleColumnId ?? ""}
              onChange={(e) => void patchSheet({ titleColumnId: e.target.value || null })}
              className="app-input app-select-chevron mt-1 w-full pr-9 text-base sm:text-sm"
            >
              <option value="">First text column</option>
              {sheet.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[12px] text-[var(--text-3)] sm:col-span-2">
            Description (the client sees this)
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== (sheet.description ?? "") && void patchSheet({ description: description.trim() || null })}
              maxLength={SHEET_LIMITS.maxDescription}
              className="app-input mt-1 min-h-[64px] w-full py-2 text-base leading-6 sm:text-sm"
            />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-[10px] tracking-[0.1em] text-[var(--text-3)] uppercase" style={{ fontFamily: MONO }}>
            What the client can do
          </legend>
          {(
            [
              ["clientCanEdit", "Edit cells (in columns marked editable below)"],
              ["clientCanAddRows", "Add rows"],
              ["clientCanSendToBoard", "Send rows to the task board"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-[13px] text-[var(--text-2)]">
              <input
                type="checkbox"
                checked={sheet[key]}
                onChange={(e) => void patchSheet({ [key]: e.target.checked })}
                className="h-4 w-4"
              />
              {label}
            </label>
          ))}
        </fieldset>

        <div>
          <p className="mb-2 text-[10px] tracking-[0.1em] text-[var(--text-3)] uppercase" style={{ fontFamily: MONO }}>
            Columns
          </p>
          <ul className="divide-y divide-[var(--border-1)] rounded-[8px] border border-[var(--border-1)]">
            {sheet.columns.map((c, i) => (
              <ColumnSettingsRow
                key={c.id}
                column={c}
                first={i === 0}
                last={i === sheet.columns.length - 1}
                onPatch={(p) =>
                  run(async () => {
                    const res = await updateWikiSheetColumnApi(slug, sheet.id, c.id, p);
                    setNotice(
                      res.cleared > 0
                        ? `${res.cleared} value${res.cleared === 1 ? "" : "s"} in "${c.title}" didn't fit the new type and were cleared.`
                        : null,
                    );
                  })
                }
                onMove={(d) => run(() => updateWikiSheetColumnApi(slug, sheet.id, c.id, { position: i + d }))}
                onRemove={() => {
                  if (window.confirm(`Remove the column "${c.title}"? Its values will no longer show.`)) {
                    void run(() => removeWikiSheetColumnApi(slug, sheet.id, c.id));
                  }
                }}
              />
            ))}
          </ul>
        </div>
        {notice && <p className="text-[12px] text-[var(--warning-500)]">{notice}</p>}
        {error && <p className="text-[12px] text-[var(--danger-500)]">{error}</p>}
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
        <button type="button" className="app-button app-button-primary app-button-sm ml-auto" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

function ColumnSettingsRow({
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
  const [options, setOptions] = useState((column.options ?? []).join(", "));
  return (
    <li className="space-y-2 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== column.title && onPatch({ title: title.trim() })}
          aria-label="Column title"
          maxLength={SHEET_LIMITS.maxColumnTitle}
          className="app-input h-8 min-w-[140px] flex-1 py-0 text-base sm:text-[13px]"
        />
        <select
          value={column.type}
          onChange={(e) => onPatch({ type: e.target.value as SheetColumnType })}
          aria-label="Column type"
          className="app-input app-select-chevron h-8 w-auto py-0 pr-8 pl-2 text-base sm:text-[13px]"
        >
          {COLUMN_TYPES.map((t) => (
            <option key={t} value={t}>
              {COLUMN_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
          <input
            type="checkbox"
            checked={column.clientEditable}
            onChange={(e) => onPatch({ clientEditable: e.target.checked })}
            className="h-4 w-4"
          />
          Client edits
        </label>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="app-button app-button-tertiary app-button-xs" disabled={first} onClick={() => onMove(-1)} aria-label={`Move ${column.title} left`}>
            ←
          </button>
          <button type="button" className="app-button app-button-tertiary app-button-xs" disabled={last} onClick={() => onMove(1)} aria-label={`Move ${column.title} right`}>
            →
          </button>
          <button type="button" className="app-button app-button-tertiary app-button-xs text-[var(--danger-500)]" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>
      {column.type === "select" && (
        <input
          value={options}
          onChange={(e) => setOptions(e.target.value)}
          onBlur={() =>
            onPatch({ options: options.split(/[,\n]/).map((o) => o.trim()).filter(Boolean) })
          }
          aria-label={`Options for ${column.title}`}
          placeholder="Options, comma-separated"
          className="app-input h-8 w-full py-0 text-base sm:text-[13px]"
        />
      )}
    </li>
  );
}
