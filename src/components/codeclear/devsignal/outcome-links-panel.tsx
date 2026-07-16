"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WidgetCard } from "@/components/codeclear/codeclear-shared";
import { useCodeClearCandidate } from "@/hooks/use-codeclear";
import { useNotice } from "./notice";
import { useCreateDevSignalOutcomeLink } from "@/hooks/use-devsignal";
import { cn } from "@/lib/format";
import type { DevSignalOutcomeLinkDTO } from "@/types/devsignal";

/**
 * Links an assessment to a real delivery Placement — the moat / future training
 * label. Most vetting tools never see the outcome; Foundry does. We capture the
 * linkage now; recalibration is deliberately NOT built yet.
 */
export function OutcomeLinksPanel({
  assessmentId,
  candidateId,
  links,
}: {
  assessmentId: string;
  candidateId: string;
  links: DevSignalOutcomeLinkDTO[];
}) {
  const { showOk, showErr, noticeEl } = useNotice();
  const candidate = useCodeClearCandidate(candidateId);
  const create = useCreateDevSignalOutcomeLink(assessmentId);
  const [placementId, setPlacementId] = useState("");
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState("");
  const [status, setStatus] = useState("");
  const [tenureDays, setTenureDays] = useState("");

  const placements = candidate.data?.candidate.placements ?? [];

  const submit = async () => {
    try {
      await create.mutateAsync({
        assessmentId,
        placementId: placementId || undefined,
        source: "manual",
        notes: notes || undefined,
        clientRating: rating ? Number(rating) : undefined,
        retained: status === "retained" ? true : undefined,
        churned: status === "churned" ? true : undefined,
        tenureDays: tenureDays ? Number(tenureDays) : undefined,
      });
      showOk("Outcome linked", "Captured — feeds score calibration.");
      setNotes("");
      setPlacementId("");
      setRating("");
      setStatus("");
      setTenureDays("");
    } catch (e) {
      showErr("Could not link", e instanceof Error ? e.message : undefined);
    }
  };

  const outcomeChips = (l: DevSignalOutcomeLinkDTO) => {
    const chips: string[] = [];
    if (typeof l.clientRating === "number") chips.push(`${l.clientRating}/5 rated`);
    if (l.retained) chips.push("retained");
    if (l.churned) chips.push("churned");
    if (typeof l.tenureDays === "number") chips.push(`${l.tenureDays}d tenure`);
    return chips;
  };

  const placementLabel = (id: string | null) => {
    if (!id) return "General (no placement)";
    const p = placements.find((x) => x.id === id);
    return p ? `${p.clientName} · ${p.projectName}` : id;
  };

  return (
    <WidgetCard number="07" name="Delivery outcomes">
      <p className="text-xs text-[var(--text-4)]">
        Link this assessment to real project delivery. This is the data loop that lets the score be
        validated later — recalibration itself is not built yet.
      </p>

      {links.length > 0 && (
        <ul className="mt-3 space-y-2">
          {links.map((l) => (
            <li key={l.id} className="rounded-md border border-[var(--border-3)] bg-[var(--surface-1)] px-3 py-2 text-sm">
              <p className="font-medium text-[var(--text-2)]">{placementLabel(l.placementId)}</p>
              {outcomeChips(l).length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {outcomeChips(l).map((c) => (
                    <span
                      key={c}
                      className="rounded-[4px] border border-[var(--border-2)] bg-[var(--surface-brand)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--brand-700)]"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
              {l.notes && <p className="mt-1 text-xs text-[var(--text-3)]">{l.notes}</p>}
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--text-4)]">
                {l.source ?? "manual"}
                {l.linkedAt ? ` · ${new Date(l.linkedAt).toLocaleDateString()}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-2 border-t border-[var(--border-3)] pt-4">
        <select
          value={placementId}
          onChange={(e) => setPlacementId(e.target.value)}
          className="app-select w-full"
        >
          <option value="">General (no specific placement)</option>
          {placements.map((p) => (
            <option key={p.id} value={p.id}>
              {p.clientName} · {p.projectName}
            </option>
          ))}
        </select>
        <div>
          <span className="widget-data-label mb-1.5 block">Client rating</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => {
              const active = rating === String(n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(active ? "" : String(n))}
                  className={cn(
                    "flex h-9 flex-1 items-center justify-center rounded-[6px] border text-sm font-medium tabular-nums transition",
                    active
                      ? "border-[var(--brand-600)] bg-[var(--surface-brand)] text-[var(--brand-700)]"
                      : "border-[var(--border-2)] text-[var(--text-3)] hover:border-[var(--border-1)] hover:bg-[var(--surface-1)]",
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="widget-data-label mb-1.5 block">Status</span>
            <div className="grid grid-cols-2 gap-1">
              {(
                [
                  ["retained", "Retained", "border-emerald-400 bg-emerald-50 text-emerald-700"],
                  ["churned", "Churned", "border-rose-400 bg-rose-50 text-rose-700"],
                ] as const
              ).map(([v, label, activeCls]) => {
                const active = status === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setStatus(active ? "" : v)}
                    className={cn(
                      "flex h-9 items-center justify-center rounded-[6px] border text-xs font-medium transition",
                      active ? activeCls : "border-[var(--border-2)] text-[var(--text-3)] hover:bg-[var(--surface-1)]",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="block">
            <span className="widget-data-label mb-1.5 block">Tenure (days)</span>
            <input
              type="number"
              value={tenureDays}
              onChange={(e) => setTenureDays(e.target.value)}
              placeholder="—"
              className="app-input h-9 w-full"
            />
          </label>
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Delivery notes (e.g. shipped on time, strong client feedback)…"
          className="app-textarea w-full"
        />
        <p className="text-[11px] leading-relaxed text-[var(--text-4)]">
          A recorded rating/status is the criterion the score is validated against — it feeds the
          calibration model.
        </p>
        <Button variant="primary" className="w-full" onClick={submit} disabled={create.isPending}>
          {create.isPending ? "Linking…" : "Link delivery outcome"}
        </Button>
      </div>
      {noticeEl}
    </WidgetCard>
  );
}
