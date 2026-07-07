"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WidgetCard } from "@/components/codeclear/codeclear-shared";
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

  const placements = candidate.data?.candidate.placements ?? [];

  const submit = async () => {
    try {
      await create.mutateAsync({
        assessmentId,
        placementId: placementId || undefined,
        source: "manual",
        notes: notes || undefined,
      });
      showOk("Outcome linked", "Captured for future score validation.");
      setNotes("");
      setPlacementId("");
    } catch (e) {
      showErr("Could not link", e instanceof Error ? e.message : undefined);
    }
  };

  const placementLabel = (id: string | null) => {
    if (!id) return "General (no placement)";
    const p = placements.find((x) => x.id === id);
    return p ? `${p.clientName} · ${p.projectName}` : id;
  };

  return (
    <WidgetCard number="06" name="Delivery outcomes">
      <p className="text-xs text-[var(--text-4)]">
        Link this assessment to real project delivery. This is the data loop that lets the score be
        validated later — recalibration itself is not built yet.
      </p>

      {links.length > 0 && (
        <ul className="mt-3 space-y-2">
          {links.map((l) => (
            <li key={l.id} className="rounded-md border border-[var(--border-3)] bg-[var(--surface-1)] px-3 py-2 text-sm">
              <p className="font-medium text-[var(--text-2)]">{placementLabel(l.placementId)}</p>
              {l.notes && <p className="text-xs text-[var(--text-3)]">{l.notes}</p>}
              <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-4)]">
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
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Delivery notes (e.g. retained, client-rated 5/5, shipped on time)…"
          className="app-textarea w-full"
        />
        <Button variant="secondary" className="w-full" onClick={submit} disabled={create.isPending}>
          {create.isPending ? "Linking…" : "Link delivery outcome"}
        </Button>
      </div>
      {noticeEl}
    </WidgetCard>
  );
}
