"use client";

/**
 * Staff → Suppliers (docs/hr-platform.md): the companies that supply people to the team.
 * Gitwork's developers all come through one partner today. HR only (`hr.manage`).
 * Archived rather than deleted, because people's records still point at a supplier.
 */

import { useState } from "react";
import { cn } from "@/lib/format";
import { dateAttention, type SupplierInput, type SupplierRecord } from "@/lib/hr";
import { Modal } from "@/components/ui/modal";
import { WidgetCard } from "@/components/codeclear/codeclear-shared";
import { usePermissions } from "@/hooks/use-permissions";
import { useSaveSupplier, useSuppliers } from "@/hooks/use-hr";

const label = "block text-[12px] font-medium text-[var(--text-2)]";

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function SupplierDialog({ supplier, onClose }: { supplier: SupplierRecord | null; onClose: () => void }) {
  const [f, setF] = useState<Required<SupplierInput>>({
    name: supplier?.name ?? "",
    companyNumber: supplier?.companyNumber ?? "",
    vatNumber: supplier?.vatNumber ?? "",
    country: supplier?.country ?? "",
    contactName: supplier?.contactName ?? "",
    contactEmail: supplier?.contactEmail ?? "",
    agreementRenewsOn: supplier?.agreementRenewsOn ?? "",
    notes: supplier?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const save = useSaveSupplier();
  const set = (patch: Partial<SupplierInput>) => setF((cur) => ({ ...cur, ...patch }));

  const submit = async (archived?: boolean) => {
    setError(null);
    try {
      await save.mutateAsync({ id: supplier?.id, input: archived === undefined ? f : { archived } });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  };

  return (
    <Modal open onClose={onClose} title={supplier ? `01 // ${supplier.name}` : "01 // ADD A SUPPLIER"} panelClassName="w-full max-w-lg">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={cn(label, "sm:col-span-2")}>
            Company name
            <input className="app-input mt-1 w-full" value={f.name ?? ""} maxLength={120} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className={label}>
            Company number
            <input className="app-input mt-1 w-full" value={f.companyNumber ?? ""} maxLength={40} onChange={(e) => set({ companyNumber: e.target.value })} />
          </label>
          <label className={label}>
            VAT number
            <input className="app-input mt-1 w-full" value={f.vatNumber ?? ""} maxLength={40} onChange={(e) => set({ vatNumber: e.target.value })} />
          </label>
          <label className={label}>
            Country
            <input className="app-input mt-1 w-full" value={f.country ?? ""} maxLength={60} onChange={(e) => set({ country: e.target.value })} />
          </label>
          <label className={label}>
            Agreement renews
            <input type="date" className="app-input mt-1 w-full" value={f.agreementRenewsOn ?? ""} onChange={(e) => set({ agreementRenewsOn: e.target.value })} />
          </label>
          <label className={label}>
            Contact name
            <input className="app-input mt-1 w-full" value={f.contactName ?? ""} maxLength={120} onChange={(e) => set({ contactName: e.target.value })} />
          </label>
          <label className={label}>
            Contact email
            <input type="email" className="app-input mt-1 w-full" value={f.contactEmail ?? ""} maxLength={200} onChange={(e) => set({ contactEmail: e.target.value })} />
          </label>
          <label className={cn(label, "sm:col-span-2")}>
            Notes
            <textarea className="app-input mt-1 w-full py-2" rows={3} value={f.notes ?? ""} maxLength={2000} onChange={(e) => set({ notes: e.target.value })} />
          </label>
        </div>
        {error ? (
          <p role="alert" className="text-[13px] text-[var(--danger-500)]">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-2)] px-5 py-3">
        {supplier ? (
          <button
            type="button"
            className="app-button app-button-tertiary app-button-sm mr-auto"
            onClick={() => void submit(!supplier.archived)}
            disabled={save.isPending}
            title={supplier.archived ? undefined : "People keep their link to it; it just stops being offered"}
          >
            {supplier.archived ? "Restore" : "Archive"}
          </button>
        ) : null}
        <button type="button" className="app-button app-button-secondary app-button-sm" onClick={onClose} disabled={save.isPending}>
          Cancel
        </button>
        <button type="button" className="app-button app-button-primary app-button-sm" onClick={() => void submit()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : supplier ? "Save" : "Add supplier"}
        </button>
      </div>
    </Modal>
  );
}

export function SuppliersPanel() {
  const { canManageHr } = usePermissions();
  const [showArchived, setShowArchived] = useState(false);
  const suppliers = useSuppliers(canManageHr, showArchived);
  const [editing, setEditing] = useState<SupplierRecord | null | "new">(null);
  const today = new Date().toISOString().slice(0, 10);
  const list = suppliers.data?.suppliers ?? [];

  if (!canManageHr) {
    return (
      <WidgetCard number="01" name="Suppliers">
        <p className="text-sm text-[var(--text-3)]">Suppliers are managed by HR. Ask a Super Admin for the &ldquo;Manage HR records&rdquo; permission.</p>
      </WidgetCard>
    );
  }

  return (
    <WidgetCard
      number="01"
      name="Suppliers"
      status={suppliers.data ? `${list.filter((s) => !s.archived).length} active` : undefined}
      action={
        <button
          type="button"
          onClick={() => setEditing("new")}
          aria-label="Add a supplier"
          className="font-mono text-[10px] font-semibold uppercase tracking-[1px] text-[var(--brand-600)] hover:underline"
        >
          Add
        </button>
      }
    >
      <div className="space-y-3">
        {suppliers.isPending ? (
          <p className="text-sm text-[var(--text-3)]">Loading…</p>
        ) : suppliers.isError ? (
          <p role="alert" className="text-sm text-[var(--danger-500)]">
            {suppliers.error instanceof Error ? suppliers.error.message : "Could not load suppliers"}
          </p>
        ) : list.length === 0 ? (
          <p className="text-sm text-[var(--text-3)]">
            No suppliers yet. Add the partner company your developers come through, then set it on each developer&apos;s profile.
          </p>
        ) : (
          <ul className="-mt-2 divide-y divide-[var(--border-3)]">
            {list.map((s) => {
              const renewal = dateAttention(s.agreementRenewsOn, today);
              return (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--text-1)]" title={s.name}>
                      {s.name}
                      {s.archived ? <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.8px] text-[var(--text-4)]">Archived</span> : null}
                    </p>
                    <p className="font-mono text-[11px] text-[var(--text-4)]">
                      {[s.country, s.companyNumber ? `Co. ${s.companyNumber}` : null, `${s.peopleCount} ${s.peopleCount === 1 ? "person" : "people"}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "font-mono text-[12px]",
                        renewal === "passed" ? "text-[var(--danger-500)]" : renewal === "soon" ? "text-[var(--warning-500)]" : "text-[var(--text-3)]",
                      )}
                    >
                      {s.agreementRenewsOn ? `Renews ${formatDate(s.agreementRenewsOn)}` : "No renewal date"}
                    </span>
                    <button type="button" className="app-button app-button-secondary app-button-xs" onClick={() => setEditing(s)}>
                      Edit
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          className="text-[12px] text-[var(--text-3)] hover:text-[var(--text-1)] hover:underline"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
      </div>
      {editing ? <SupplierDialog supplier={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </WidgetCard>
  );
}
