"use client";

/**
 * Settings → Pulse → Public embed → 02 // FREE RESULTS.
 *
 * Chooses which checks a stranger sees in full on the free scan. Everything else that
 * the scan ranks as actionable is counted and named by category only. The rule and the
 * reason the score is never affected live in `lib/pulse-free-tier.ts`.
 *
 * Built for two people picking from 1,646 checks, not for one person who knows them:
 *  · grouped domain → category, with a selected/total count on every level
 *  · search across label, key and category (all words must match)
 *  · "Selected only" to review exactly what is free
 *  · nothing saves per click — edits are a draft with an explicit Save / Discard, so a
 *    mis-click never goes live on a public page
 */

import { useMemo, useState } from "react";
import { MagnifyingGlassIcon, ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { CHECKS_REGISTRY } from "@/server/checks-registry";
import { CATEGORY_META, DOMAIN_ORDER } from "@/server/pulse-checks/categories";
import { buildPickerModel } from "@/lib/pulse-free-tier";
import { cn } from "@/lib/format";
import { ToggleSwitch } from "@/components/pulse/pulse-embed-panel";

const DOMAIN_BY_CATEGORY = new Map<string, string>(CATEGORY_META.map((m) => [m.name, m.domain]));
const domainOf = (category: string) => DOMAIN_BY_CATEGORY.get(category) ?? "Other";
const DOMAIN_NAMES = DOMAIN_ORDER.map((d) => d.name as string);

/** Cap rendered rows when nothing narrows the list, so 1,646 checkboxes never mount at once. */
const ROW_RENDER_CAP = 400;

interface Props {
  /** Saved value. null = no limit. */
  saved: string[] | null;
  saving: boolean;
  error: string | null;
  onSave: (next: string[] | null) => void;
}

export function PulseFreeTierPicker({ saved, saving, error, onSave }: Props) {
  const savedKey = saved === null ? "null" : [...saved].sort().join("|");
  // Re-seed the draft when the saved value changes underneath us (after a save, or a
  // refetch) — React's "adjust state during render" pattern, not an effect.
  const [seen, setSeen] = useState(savedKey);
  const [limit, setLimit] = useState(saved !== null);
  const [draft, setDraft] = useState<Set<string>>(new Set(saved ?? []));
  if (seen !== savedKey) {
    setSeen(savedKey);
    setLimit(saved !== null);
    setDraft(new Set(saved ?? []));
  }

  const [query, setQuery] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [openDomains, setOpenDomains] = useState<Set<string>>(new Set());
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());

  const dirty = limit !== (saved !== null) || (limit && savedKey !== [...draft].sort().join("|"));
  const searching = query.trim().length > 0;

  const model = useMemo(
    () => buildPickerModel(CHECKS_REGISTRY, domainOf, DOMAIN_NAMES, { query, selected: draft, onlySelected }),
    [query, draft, onlySelected],
  );
  const shownRows = model.reduce((n, d) => n + d.total, 0);

  const domainOpen = (d: string) => searching || onlySelected || openDomains.has(d);
  const catOpen = (c: string) => searching || onlySelected || openCats.has(c);
  const flip = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  };

  function setMany(keys: string[], on: boolean) {
    setDraft((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }

  const renderBudget = { left: searching || onlySelected ? Infinity : ROW_RENDER_CAP };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-2)] pb-3">
        <div>
          <p className="text-sm font-medium text-[var(--text-1)]">Limit what is shown free</p>
          <p className="mt-0.5 text-xs text-[var(--text-4)]">
            {limit
              ? "Only the checks below are shown in full. Other actionable findings are counted by category, not described."
              : "Off — every finding the scan ranks as actionable is shown free, with its evidence."}
          </p>
        </div>
        <ToggleSwitch checked={limit} disabled={saving} onChange={setLimit} />
      </div>

      {!limit ? null : (
        <div className="pt-3">
          <p className="mb-3 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-2 text-xs text-[var(--text-4)]">
            <strong className="text-[var(--text-3)]">The score is never affected</strong> — it is always calculated from every check,
            so it matches the paid report. Only the list of findings is limited. A check you tick here still only appears when
            the scan ranks it as a serious finding for that site.
          </p>

          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-4)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, key or category…"
                aria-label="Search checks"
                className="app-input w-full pl-8 text-sm"
              />
            </div>
            <button
              type="button"
              aria-pressed={onlySelected}
              onClick={() => setOnlySelected((v) => !v)}
              className={cn(
                "rounded-[6px] border px-2.5 py-1.5 text-xs font-medium",
                onlySelected
                  ? "border-[var(--brand-700)] bg-[var(--brand-100)] text-[var(--brand-700)]"
                  : "border-[var(--border-2)] text-[var(--text-3)] hover:bg-[var(--surface-1)]",
              )}
            >
              Selected only ({draft.size})
            </button>
            {draft.size > 0 && (
              <button type="button" onClick={() => setDraft(new Set())} className="text-xs text-[var(--text-4)] hover:underline">
                Clear all
              </button>
            )}
          </div>

          <div className="max-h-[34rem] overflow-y-auto rounded-[6px] border border-[var(--border-2)]">
            {model.map((d) => (
              <div key={d.domain} className="border-b border-[var(--border-2)] last:border-b-0">
                <button
                  type="button"
                  onClick={() => flip(openDomains, setOpenDomains, d.domain)}
                  aria-expanded={domainOpen(d.domain)}
                  className="flex w-full items-center justify-between gap-2 bg-[var(--surface-1)] px-3 py-2 text-left"
                >
                  <span className="widget-data-label flex items-center gap-1.5">
                    {domainOpen(d.domain) ? <ChevronDownIcon className="size-3.5 shrink-0" /> : <ChevronRightIcon className="size-3.5 shrink-0" />}
                    {d.domain}
                  </span>
                  <span className={cn("text-[11px]", d.selected > 0 ? "font-bold text-[var(--brand-700)]" : "text-[var(--text-4)]")}>
                    {d.selected}/{d.total}
                  </span>
                </button>

                {domainOpen(d.domain) &&
                  d.categories.map((c) => (
                    <div key={c.category} className="border-t border-[var(--border-2)]">
                      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                        <button
                          type="button"
                          onClick={() => flip(openCats, setOpenCats, c.category)}
                          aria-expanded={catOpen(c.category)}
                          className="flex min-w-0 items-center gap-1.5 text-left text-sm font-medium text-[var(--text-2)]"
                        >
                          {catOpen(c.category) ? <ChevronDownIcon className="size-3.5 shrink-0" /> : <ChevronRightIcon className="size-3.5 shrink-0" />}
                          <span className="truncate" title={c.category}>{c.category}</span>
                          <span className={cn("shrink-0 text-[11px]", c.selected > 0 ? "font-bold text-[var(--brand-700)]" : "text-[var(--text-4)]")}>
                            {c.selected}/{c.checks.length}
                          </span>
                        </button>
                        <span className="flex shrink-0 items-center gap-2 text-[11px] font-medium">
                          <button type="button" onClick={() => setMany(c.checks.map((x) => x.key), true)} className="text-[var(--brand-700)] hover:underline">All</button>
                          <button type="button" onClick={() => setMany(c.checks.map((x) => x.key), false)} className="text-[var(--text-4)] hover:underline">None</button>
                        </span>
                      </div>
                      {catOpen(c.category) &&
                        c.checks.map((k) => {
                          if (renderBudget.left <= 0) return null;
                          renderBudget.left--;
                          return (
                            <label key={k.key} className="flex cursor-pointer items-start gap-2 px-3 py-1.5 pl-8 text-sm text-[var(--text-2)] hover:bg-[var(--surface-1)]">
                              <input
                                type="checkbox"
                                className="app-checkbox mt-0.5 shrink-0"
                                checked={draft.has(k.key)}
                                onChange={() => setMany([k.key], !draft.has(k.key))}
                              />
                              <span className="min-w-0">
                                <span className="block">{k.label}</span>
                                <span className="widget-timestamp block truncate" title={k.key}>{k.key}</span>
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  ))}
              </div>
            ))}
            {model.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-[var(--text-4)]">
                {onlySelected && !searching ? "Nothing selected yet." : `No checks match “${query}”.`}
              </p>
            )}
          </div>
          {!searching && !onlySelected && shownRows > ROW_RENDER_CAP && (
            <p className="mt-1.5 text-[11px] text-[var(--text-4)]">
              Open a category to see its checks, or search — the full list is {shownRows.toLocaleString()} checks.
            </p>
          )}
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border-2)] pt-3">
        <p className="text-xs text-[var(--text-4)]">
          {limit
            ? draft.size === 0
              ? "Nothing is free — every finding is counted, none shown."
              : `${draft.size.toLocaleString()} of ${CHECKS_REGISTRY.length.toLocaleString()} checks shown in full.`
            : "No limit."}
          {dirty && <span className="ml-2 font-medium text-[var(--warning-500)]">Unsaved changes</span>}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => {
              setLimit(saved !== null);
              setDraft(new Set(saved ?? []));
            }}
            className="rounded-[6px] px-2.5 py-1.5 text-xs font-medium text-[var(--text-3)] hover:bg-[var(--surface-1)] disabled:opacity-40"
          >
            Discard
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => onSave(limit ? [...draft] : null)}
            className="rounded-[6px] bg-[var(--brand-700)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
