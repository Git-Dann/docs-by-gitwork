"use client";

import { useEffect, useState } from "react";
import { PlusIcon, TrashIcon, ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import { useSetWikiIntakeCategories } from "@/hooks/use-wiki";
import {
  DEFAULT_INTAKE_CATEGORIES,
  INTAKE_CATEGORY_TYPES,
  INTAKE_TYPE_LABEL,
  MAX_CATEGORY_LABEL,
  MAX_INTAKE_CATEGORIES,
  type IntakeCategory,
  type IntakeCategoryType,
} from "@/lib/wiki-intake-categories";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

type Draft = { id?: string; label: string; mapsTo: IntakeCategoryType };

/**
 * Staff-only editor for THIS client's Requests categories.
 *
 * The client picks from this list on their wiki; only Gitwork edits it, because
 * the `mapsTo` column is what decides where a request lands for the devs. Each
 * row is the client's own wording paired with the behaviour it maps onto, so a
 * client can say "Quick Design fix (V1)" without that phrasing becoming a global
 * category on every other client's form.
 */
export function WikiIntakeCategoriesPanel({
  slug,
  categories,
  isDefault,
}: {
  slug: string;
  categories: IntakeCategory[];
  /** True when the client is on the built-in list rather than a configured one. */
  isDefault: boolean;
}) {
  const save = useSetWikiIntakeCategories(slug);
  const [rows, setRows] = useState<Draft[]>(() => categories.map((c) => ({ ...c })));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-seed when the server's list changes under us (another tab, a fresh load).
  useEffect(() => {
    setRows(categories.map((c) => ({ ...c })));
  }, [categories]);

  function update(i: number, patch: Partial<Draft>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  function addRow() {
    if (rows.length >= MAX_INTAKE_CATEGORIES) return;
    setRows((prev) => [...prev, { label: "", mapsTo: "TASK" }]);
    setSaved(false);
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setSaved(false);
  }

  async function submit() {
    setError(null);
    // Blank rows are an unfinished edit, not an intent to save an empty name —
    // drop them rather than making the server reject the whole list for one.
    const cleaned = rows.filter((r) => r.label.trim());
    try {
      await save.mutateAsync(cleaned.map((r) => ({ ...r, label: r.label.trim() })));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save those categories.");
    }
  }

  async function resetToDefaults() {
    setError(null);
    try {
      await save.mutateAsync([]);
      setRows(DEFAULT_INTAKE_CATEGORIES.map((c) => ({ ...c })));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset those categories.");
    }
  }

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">05</span>
          {" // REQUEST CATEGORIES"}
        </span>
        {isDefault ? (
          <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
            USING DEFAULTS
          </span>
        ) : null}
      </div>

      <div className="space-y-4 p-6">
        <div className="max-w-[70ch]">
          <p className="text-sm font-medium text-[var(--text-1)]">
            What this client picks from when raising a request
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-4)]">
            Use the client&rsquo;s own wording — &ldquo;Quick Design fix (V1)&rdquo;,
            &ldquo;Content tweak&rdquo;. Each one maps to a type your devs already work with, which
            is what decides how it&rsquo;s prefixed and filtered once it&rsquo;s promoted to a task.
            Only Gitwork edits this list; the client just picks from it. Leave it empty to fall back
            to the standard Bug / Feedback / Request / Design.
          </p>
        </div>

        <ul className="space-y-2">
          {rows.map((row, i) => (
            <li key={row.id ?? `new-${i}`} className="flex flex-wrap items-center gap-2">
              <input
                value={row.label}
                maxLength={MAX_CATEGORY_LABEL}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Category the client sees"
                aria-label={`Category ${i + 1} name`}
                className="app-input min-w-0 flex-1"
              />
              <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                →
              </span>
              <select
                value={row.mapsTo}
                onChange={(e) => update(i, { mapsTo: e.target.value as IntakeCategoryType })}
                aria-label={`Category ${i + 1} behaves as`}
                className="app-select w-[150px] shrink-0"
              >
                {INTAKE_CATEGORY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {INTAKE_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label={`Remove category ${i + 1}`}
                title="Remove"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-rose-50 hover:text-rose-600"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>

        {rows.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-6 text-center text-[13px] text-[var(--text-4)]">
            No custom categories — this client sees the standard four.
          </p>
        ) : null}

        {error ? <p className="text-[12px] text-rose-600">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addRow}
            disabled={rows.length >= MAX_INTAKE_CATEGORIES}
            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
          >
            <PlusIcon className="h-3.5 w-3.5" /> Add category
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={save.isPending}
            className="rounded-[7px] bg-[var(--brand-600)] px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save categories"}
          </button>
          {!isDefault ? (
            <button
              type="button"
              onClick={() => void resetToDefaults()}
              disabled={save.isPending}
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
            >
              <ArrowUturnLeftIcon className="h-3.5 w-3.5" /> Reset to standard
            </button>
          ) : null}
          {saved ? (
            <span className="text-[12px] text-emerald-600" style={{ fontFamily: MONO }}>
              SAVED
            </span>
          ) : null}
          <span className="ml-auto text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
            {rows.length}/{MAX_INTAKE_CATEGORIES}
          </span>
        </div>

        <p className="text-[12px] leading-relaxed text-[var(--text-4)]">
          Renaming a category updates requests already raised under it. Deleting one keeps those
          requests — they carry on showing the name they were raised with.
        </p>
      </div>
    </section>
  );
}
