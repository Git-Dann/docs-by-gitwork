"use client";

import { WidgetCard } from "@/components/codeclear/codeclear-shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/format";
import { useNotice } from "./notice";
import { useUpdateDevSignalDataRequest } from "@/hooks/use-devsignal";
import { DATA_REQUEST_LABELS } from "@/lib/devsignal/processing-notice";
import type { DevSignalAssessmentDTO, DevSignalDataRequestDTO } from "@/types/devsignal";

const REQUEST_TONE: Record<string, string> = {
  OPEN: "border-amber-200 bg-amber-50 text-amber-700",
  ACKNOWLEDGED: "border-sky-200 bg-sky-50 text-sky-700",
  RESOLVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

/**
 * Compliance surface for the reviewer: whether the candidate gave consent (and
 * to which notice version), plus their data-rights requests (explanation /
 * appeal / erasure) with actions. Erasure is human-actioned — nothing is
 * auto-deleted.
 */
export function CompliancePanel({ id, a }: { id: string; a: DevSignalAssessmentDTO }) {
  const consent = a.consent ?? null;
  const requests = a.dataRequests ?? [];

  return (
    <WidgetCard number="06" name="Compliance">
      <div>
        <p className="widget-data-label mb-1.5">Consent</p>
        {consent ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Consented
            </span>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-4)]">
              {new Date(consent.agreedAt).toLocaleDateString()} · notice {consent.noticeVersion} · processing ✓ ·
              human-review ✓{consent.transcriptRetention ? " · transcript ✓" : ""}
            </p>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Awaiting consent
          </span>
        )}
      </div>

      <div className="mt-4">
        <p className="mb-1.5 flex items-center gap-2 widget-data-label">
          Data requests
          {requests.length > 0 && (
            <span className="rounded-full bg-[var(--surface-2)] px-1.5 font-mono text-[10px] font-semibold text-[var(--text-3)]">
              {requests.length}
            </span>
          )}
        </p>
        {requests.length === 0 ? (
          <p className="text-xs text-[var(--text-4)]">None.</p>
        ) : (
          <div className="space-y-2.5">
            {requests.map((r) => (
              <RequestRow key={r.id} assessmentId={id} r={r} />
            ))}
          </div>
        )}
      </div>
    </WidgetCard>
  );
}

function RequestRow({ assessmentId, r }: { assessmentId: string; r: DevSignalDataRequestDTO }) {
  const { showOk, showErr, noticeEl } = useNotice();
  const update = useUpdateDevSignalDataRequest(assessmentId);

  const setStatus = async (status: "ACKNOWLEDGED" | "RESOLVED") => {
    try {
      await update.mutateAsync({ id: r.id, status });
      showOk(status === "RESOLVED" ? "Marked resolved" : "Acknowledged");
    } catch (e) {
      showErr("Could not update", e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <div className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--text-2)]">{DATA_REQUEST_LABELS[r.type]}</span>
        <span
          className={cn(
            "rounded-[4px] border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em]",
            REQUEST_TONE[r.status] ?? "",
          )}
        >
          {r.status}
        </span>
      </div>
      {r.message && <p className="mt-1 text-xs leading-relaxed text-[var(--text-3)]">{r.message}</p>}
      <p className="mt-1 font-mono text-[10px] text-[var(--text-4)]">{new Date(r.createdAt).toLocaleString()}</p>
      {r.status !== "RESOLVED" && (
        <div className="mt-2 flex gap-2">
          {r.status === "OPEN" && (
            <Button variant="secondary" size="xs" onClick={() => setStatus("ACKNOWLEDGED")} disabled={update.isPending}>
              Acknowledge
            </Button>
          )}
          <Button variant="secondary" size="xs" onClick={() => setStatus("RESOLVED")} disabled={update.isPending}>
            Mark resolved
          </Button>
        </div>
      )}
      {noticeEl}
    </div>
  );
}
