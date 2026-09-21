"use client";

/**
 * The running-cost editor — staff only, reached from the section's Edit button.
 *
 * Two columns: the lines on the left, the selected line on the right. DESIGN.md names
 * this exact shape for a pick-one-of-a-list-and-inspect popup, so it is that shape
 * rather than a new one.
 *
 * ⚠️ Fixed height (`app-dialog-fixed`), because the right pane's field set changes with
 * the line's type — a self-sizing panel would resize under the cursor every time the
 * type dropdown moved. The body is the only scroller; header and footer are `shrink-0`,
 * so the Save control is always reachable (§46).
 */

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  useCreateWikiCostItem,
  useDeleteWikiCostItem,
  useUpdateWikiCostItem,
  useUpdateWikiCostSettings,
} from "@/hooks/use-wiki";
import type { WikiCostItemInput } from "@/lib/api";
import type { CostItem, CostItemKind, CostModel } from "@/types/wiki-costs";

const KINDS: { value: CostItemKind; label: string; hint: string }[] = [
  { value: "FLAT", label: "Fixed fee", hint: "The same every month however many users there are." },
  { value: "PER_USER", label: "Per user", hint: "A price per seat, multiplied by the user count." },
  {
    value: "METERED",
    label: "Usage",
    hint: "Billed by consumption. Needs a per-user figure, or it cannot be projected at all.",
  },
  {
    value: "STEPPED",
    label: "Plan bands",
    hint: "A ladder of plans — the price steps up as the user count crosses each band.",
  },
];

type Draft = WikiCostItemInput & { tiers: NonNullable<WikiCostItemInput["tiers"]> };

function draftFrom(item: CostItem | null): Draft {
  if (!item) {
    return { name: "", vendor: "", kind: "FLAT", amountMonthly: null, tiers: [] };
  }
  return {
    name: item.name,
    vendor: item.vendor ?? "",
    kind: item.kind,
    amountMonthly: item.amountMonthly,
    amountAnnual: item.amountAnnual,
    unitLabel: item.unitLabel ?? "",
    includedUnits: item.includedUnits,
    unitPrice: item.unitPrice,
    unitsPerUser: item.unitsPerUser,
    notes: item.notes ?? "",
    tiers: item.tiers.map((t) => ({
      upToUsers: t.upToUsers,
      amountMonthly: t.amountMonthly,
      label: t.label ?? "",
    })),
  };
}

/** `""` → null, so an emptied field clears the value rather than storing 0. */
function num(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

const str = (n: number | null | undefined) => (n == null ? "" : String(n));

export function WikiCostsEditor({
  slug,
  model,
  onClose,
}: {
  slug: string;
  model: CostModel;
  onClose: () => void;
}) {
  const toast = useToast();
  const createItem = useCreateWikiCostItem(slug);
  const updateItem = useUpdateWikiCostItem(slug);
  const deleteItem = useDeleteWikiCostItem(slug);
  const saveSettings = useUpdateWikiCostSettings(slug);

  const [selected, setSelected] = useState<string | null>(model.items[0]?.id ?? null);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(model.items[0] ?? null));
  const [headline, setHeadline] = useState(String(model.headlineUsers));
  const [currency, setCurrency] = useState(model.currency);
  const [notes, setNotes] = useState(model.notes ?? "");

  function pick(item: CostItem | null) {
    setSelected(item?.id ?? null);
    setDraft(draftFrom(item));
  }

  const busy = createItem.isPending || updateItem.isPending || deleteItem.isPending;

  async function saveLine() {
    if (!draft.name.trim()) {
      toast.error("Give the line a name");
      return;
    }
    try {
      if (selected) {
        await updateItem.mutateAsync({ itemId: selected, input: draft });
      } else {
        await createItem.mutateAsync(draft);
      }
      toast.success("Saved");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  }

  async function removeLine() {
    if (!selected) return;
    if (!window.confirm(`Delete "${draft.name}" from this cost model?`)) return;
    try {
      await deleteItem.mutateAsync(selected);
      toast.success("Deleted");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  async function saveModelSettings() {
    const users = num(headline);
    try {
      await saveSettings.mutateAsync({
        currency: currency.trim().toUpperCase(),
        ...(users != null && users > 0 ? { headlineUsers: Math.round(users) } : {}),
        notes: notes.trim() || null,
      });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings");
    }
  }

  const kindHint = KINDS.find((k) => k.value === draft.kind)?.hint;

  return (
    <Modal
      open
      onClose={onClose}
      title="RUNNING COSTS"
      panelClassName="app-dialog-fixed w-full max-w-4xl"
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        {/* ── pick ──────────────────────────────────────────────────────────── */}
        <div className="min-h-0 overflow-y-auto border-[var(--border-1)] md:border-r">
          <div className="space-y-1 p-3">
            {model.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => pick(item)}
                className={`block w-full rounded-md px-3 py-2 text-left transition ${
                  selected === item.id
                    ? "bg-[var(--brand-50)] text-[var(--text-1)]"
                    : "text-[var(--text-2)] hover:bg-[var(--surface-1)]"
                }`}
              >
                <span className="block truncate text-[14px]" title={item.name}>
                  {item.name}
                </span>
                <span className="widget-data-label text-[10px] text-[var(--text-4)]">
                  {KINDS.find((k) => k.value === item.kind)?.label}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => pick(null)}
              className={`block w-full rounded-md border border-dashed border-[var(--border-2)] px-3 py-2 text-left text-[13px] transition hover:bg-[var(--surface-1)] ${
                selected === null ? "bg-[var(--brand-50)]" : ""
              }`}
            >
              + Add a cost line
            </button>
          </div>

          <div className="space-y-3 border-t border-[var(--border-1)] p-3">
            <p className="widget-data-label text-[10px] text-[var(--text-4)]">Model settings</p>
            <label className="block">
              <span className="app-field-label">Headline user count</span>
              <input
                className="app-input"
                inputMode="numeric"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="app-field-label">Currency</span>
              {/* One currency per model, entered by hand — deliberately not live FX, so a
                  client-facing figure never drifts between two reloads. */}
              <input
                className="app-input uppercase"
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="app-field-label">Note shown to the client</span>
              <textarea
                className="app-input min-h-[70px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="app-button app-button-secondary app-button-xs w-full"
              onClick={() => void saveModelSettings()}
              disabled={saveSettings.isPending}
            >
              {saveSettings.isPending ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>

        {/* ── inspect ───────────────────────────────────────────────────────── */}
        <div className="min-h-0 space-y-4 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="app-field-label">Service *</span>
              <input
                className="app-input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Database hosting"
              />
            </label>
            <label className="block">
              <span className="app-field-label">Vendor</span>
              <input
                className="app-input"
                value={draft.vendor ?? ""}
                onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
                placeholder="Supabase"
              />
            </label>
          </div>

          <label className="block">
            <span className="app-field-label">How it is priced</span>
            <select
              className="app-select"
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as CostItemKind })}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            {kindHint && <span className="mt-1 block text-[12px] text-[var(--text-4)]">{kindHint}</span>}
          </label>

          {draft.kind !== "STEPPED" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="app-field-label">
                  {draft.kind === "PER_USER"
                    ? "Price per user / month"
                    : draft.kind === "METERED"
                      ? "Base fee / month"
                      : "Cost / month"}
                </span>
                <input
                  className="app-input"
                  inputMode="decimal"
                  value={str(draft.amountMonthly)}
                  onChange={(e) => setDraft({ ...draft, amountMonthly: num(e.target.value) })}
                />
              </label>
              <label className="block">
                <span className="app-field-label">Annual price (if cheaper)</span>
                <input
                  className="app-input"
                  inputMode="decimal"
                  value={str(draft.amountAnnual)}
                  onChange={(e) => setDraft({ ...draft, amountAnnual: num(e.target.value) })}
                />
                <span className="mt-1 block text-[12px] text-[var(--text-4)]">
                  Leave blank and the yearly figure is twelve monthly payments.
                </span>
              </label>
            </div>
          )}

          {draft.kind === "METERED" && (
            <div className="space-y-4 rounded-md border border-[var(--border-1)] p-4">
              <p className="widget-data-label text-[10px] text-[var(--text-4)]">Usage</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="app-field-label">Unit</span>
                  <input
                    className="app-input"
                    value={draft.unitLabel ?? ""}
                    onChange={(e) => setDraft({ ...draft, unitLabel: e.target.value })}
                    placeholder="GB, requests, minutes"
                  />
                </label>
                <label className="block">
                  <span className="app-field-label">Price per unit</span>
                  <input
                    className="app-input"
                    inputMode="decimal"
                    value={str(draft.unitPrice)}
                    onChange={(e) => setDraft({ ...draft, unitPrice: num(e.target.value) })}
                  />
                </label>
                <label className="block">
                  <span className="app-field-label">Units included</span>
                  <input
                    className="app-input"
                    inputMode="decimal"
                    value={str(draft.includedUnits)}
                    onChange={(e) => setDraft({ ...draft, includedUnits: num(e.target.value) })}
                  />
                </label>
                <label className="block">
                  <span className="app-field-label">Units per user / month</span>
                  <input
                    className="app-input"
                    inputMode="decimal"
                    value={str(draft.unitsPerUser)}
                    onChange={(e) => setDraft({ ...draft, unitsPerUser: num(e.target.value) })}
                  />
                </label>
              </div>
              {/* ⚠️ Stated at the point of entry, not only on the client's page: without
                  this figure the line cannot scale, and the engine reports it as a blind
                  spot rather than costing usage at zero. */}
              <p className="text-[12px] text-[var(--warning-500)]">
                {draft.unitsPerUser == null || draft.unitPrice == null
                  ? "Without units per user and a unit price, only the base fee is counted — the client's page will say so."
                  : "Usage scales with the user count."}
              </p>
            </div>
          )}

          {draft.kind === "STEPPED" && (
            <div className="space-y-3 rounded-md border border-[var(--border-1)] p-4">
              <p className="widget-data-label text-[10px] text-[var(--text-4)]">Plan bands</p>
              {draft.tiers.map((tier, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_120px_auto]">
                  <input
                    className="app-input"
                    value={tier.label ?? ""}
                    onChange={(e) => {
                      const tiers = [...draft.tiers];
                      tiers[i] = { ...tier, label: e.target.value };
                      setDraft({ ...draft, tiers });
                    }}
                    placeholder="Team"
                  />
                  <input
                    className="app-input"
                    inputMode="numeric"
                    value={str(tier.upToUsers)}
                    onChange={(e) => {
                      const tiers = [...draft.tiers];
                      tiers[i] = { ...tier, upToUsers: num(e.target.value) };
                      setDraft({ ...draft, tiers });
                    }}
                    placeholder="Up to (blank = no cap)"
                  />
                  <input
                    className="app-input"
                    inputMode="decimal"
                    value={String(tier.amountMonthly)}
                    onChange={(e) => {
                      const tiers = [...draft.tiers];
                      tiers[i] = { ...tier, amountMonthly: num(e.target.value) ?? 0 };
                      setDraft({ ...draft, tiers });
                    }}
                    placeholder="£/mo"
                  />
                  <button
                    type="button"
                    className="app-button app-button-secondary app-button-xs"
                    onClick={() =>
                      setDraft({ ...draft, tiers: draft.tiers.filter((_, j) => j !== i) })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="app-button app-button-secondary app-button-xs"
                onClick={() =>
                  setDraft({
                    ...draft,
                    tiers: [...draft.tiers, { upToUsers: null, amountMonthly: 0, label: "" }],
                  })
                }
              >
                + Add a band
              </button>
              {/* Bands must ascend and only the last may be open-ended — the API rejects
                  anything else, because `tierFor` takes the first band that covers the
                  count and an out-of-order ladder would quietly under-price. */}
              <p className="text-[12px] text-[var(--text-4)]">
                Bands go from smallest to largest. Leave the last one&rsquo;s cap blank for
                &ldquo;and up&rdquo;; capped at the top and the client&rsquo;s page shows a
                minimum rather than a figure above it.
              </p>
            </div>
          )}

          <label className="block">
            <span className="app-field-label">Note</span>
            <textarea
              className="app-input min-h-[70px]"
              value={draft.notes ?? ""}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </label>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border-1)] px-5 py-3">
        <div>
          {selected && (
            <button
              type="button"
              className="app-button app-button-link app-button-xs text-[var(--danger-500)]"
              onClick={() => void removeLine()}
              disabled={busy}
            >
              Delete line
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" className="app-button app-button-secondary app-button-xs" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="app-button app-button-primary app-button-xs"
            onClick={() => void saveLine()}
            disabled={busy}
          >
            {busy ? "Saving…" : selected ? "Save line" : "Add line"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
