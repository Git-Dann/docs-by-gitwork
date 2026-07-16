"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Section } from "./devsignal-ui";
import { useCodeClearCandidate } from "@/hooks/use-codeclear";
import { useNotice } from "./notice";
import { useCreateDevSignalOutcomeLink } from "@/hooks/use-devsignal";
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
    <Section title="Delivery outcomes">
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
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-4)]">Rating</span>
            <select value={rating} onChange={(e) => setRating(e.target.value)} className="app-select-compact w-full">
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}/5</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-4)]">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="app-select-compact w-full">
              <option value="">—</option>
              <option value="retained">Retained</option>
              <option value="churned">Churned</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-4)]">Tenure (d)</span>
            <input
              type="number"
              value={tenureDays}
              onChange={(e) => setTenureDays(e.target.value)}
              className="app-input w-full"
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
        <p className="text-[11px] text-[var(--text-4)]">
          A recorded rating/status is the criterion the score is validated against — it feeds the
          calibration model.
        </p>
        <Button variant="secondary" className="w-full" onClick={submit} disabled={create.isPending}>
          {create.isPending ? "Linking…" : "Link delivery outcome"}
        </Button>
      </div>
      {noticeEl}
    </Section>
  );
}
