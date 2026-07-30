"use client";

// The register — the internal side of Provenance. Two jobs: strike a mark from a completed
// Pulse scan, and see the standing of every mark already issued (including the ones that
// have lapsed, which is the state that actually needs chasing).

import { useMemo, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  CheckBadgeIcon,
  ClipboardDocumentIcon,
  LockOpenIcon,
  BeakerIcon,
  CheckIcon,
  NoSymbolIcon,
} from "@heroicons/react/24/outline";
import { usePulseScans } from "@/hooks/use-pulse";
import { usePermissions } from "@/hooks/use-permissions";
import {
  useCountermarks,
  useIssueCountermark,
  useRevokeCountermark,
  useSeedProvenanceDemo,
  type Countermark,
  type CountermarkGrade,
  type CountermarkStatus,
} from "@/hooks/use-provenance";
import { Modal } from "@/components/ui/modal";
import { cn, formatDate } from "@/lib/format";

const GRADE_LABEL: Record<CountermarkGrade, string> = {
  CERTIFIED: "Certified",
  CONDITIONAL: "Conditional",
  NOT_CERTIFIED: "Not certified",
  INCOMPLETE: "Incomplete",
};

const GRADE_TONE: Record<CountermarkGrade, string> = {
  CERTIFIED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  CONDITIONAL: "border-amber-200 bg-amber-50 text-amber-700",
  NOT_CERTIFIED: "border-red-200 bg-red-50 text-red-700",
  INCOMPLETE: "border-slate-300 bg-slate-100 text-slate-600",
};

/** 2px left rail per grade — the register's scan line. Deliberately muted versions of the
 *  chip tones: the chip states the verdict, the rail only has to group the rows. */
const GRADE_RAIL: Record<CountermarkGrade, string> = {
  // ⚠️ Side-specific (`border-l-<colour>`), NOT `border-<colour>`. The list uses `divide-y`,
  // which puts a top border on each sibling and colours it from the element's own
  // border-color — so a whole-element colour here tinted every row DIVIDER with that row's
  // grade. Caught by screenshotting: it drew an amber line under the conditional row and a
  // green one under the certified rows.
  CERTIFIED: "border-l-emerald-300",
  CONDITIONAL: "border-l-amber-300",
  NOT_CERTIFIED: "border-l-red-300",
  INCOMPLETE: "border-l-slate-300",
};

const STATUS_TONE: Record<CountermarkStatus, string> = {
  VALID: "text-emerald-600",
  EXPIRING: "text-amber-600",
  LAPSED: "text-slate-500",
  REVOKED: "text-red-600",
  SUPERSEDED: "text-blue-600",
};

function Badge({ grade }: { grade: CountermarkGrade }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-[4px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        GRADE_TONE[grade],
      )}
    >
      {GRADE_LABEL[grade]}
    </span>
  );
}

export function ProvenanceRegister() {
  const { canIssueCountermark, isSuperAdmin } = usePermissions();
  const { data, isPending, error } = useCountermarks();
  const scans = usePulseScans();
  const issue = useIssueCountermark();
  const revoke = useRevokeCountermark();
  const seed = useSeedProvenanceDemo();

  const [issueOpen, setIssueOpen] = useState(false);
  const [scanId, setScanId] = useState("");
  const [revoking, setRevoking] = useState<Countermark | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  // Memoised because the `?? []` fallback is a fresh array on every render, which would
  // re-run the counts useMemo below each time.
  const countermarks = useMemo(() => data?.countermarks ?? [], [data?.countermarks]);
  const sealingConfigured = data?.sealingConfigured ?? false;

  // Only completed scans can be attested — issuing from a partial one would report
  // clauses as unestablished that were still being checked. The server enforces this;
  // filtering here means the option is never offered in the first place.
  const eligibleScans = useMemo(
    () => (scans.data?.scans ?? []).filter((s) => s.status === "COMPLETED"),
    [scans.data],
  );

  const counts = useMemo(() => {
    const live = countermarks.filter((h) => h.status === "VALID" || h.status === "EXPIRING").length;
    const lapsed = countermarks.filter((h) => h.status === "LAPSED").length;
    return { total: countermarks.length, live, lapsed };
  }, [countermarks]);

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/countermark/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      // Clipboard can be blocked by permissions policy; the certificate link is also
      // reachable from the row's open-in-new-tab action, so this failing is not fatal.
    }
  };

  return (
    <div className="space-y-4">
      {!sealingConfigured && (
        <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="flex items-start gap-2 text-sm text-amber-800">
            <LockOpenIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold">Sealing is not configured.</span> Marks issued now
              carry a digest but no issuer seal, so a reader cannot confirm they came from
              Gitwork. Set <code className="font-mono text-[12px]">PROVENANCE_SIGNING_SECRET</code> on
              the server before issuing anything a client will rely on.
            </span>
          </p>
        </div>
      )}

      <div className="widget-card">
        <div className="widget-header">
          <span className="widget-header-label">01 // COUNTERMARK REGISTER</span>
          <span className="widget-header-right">
            {counts.total} ISSUED · {counts.live} LIVE · {counts.lapsed} LAPSED
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-2)] px-4 py-3">
          <p className="min-w-0 text-sm text-[var(--text-3)]">
            A Countermark is the certificate you hand to a client, insurer or acquirer. It states what
            was checked, what passed, and what could not be established.
          </p>
          {/* No `shrink-0`: it stops `flex-wrap` from ever engaging, so at 390px both buttons
              overflowed the card and widget-card's `overflow-hidden` clipped the primary one.
              Allowed to shrink, they stack instead. */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Super Admin only, and last in the row so it never sits where "Strike" is
                expected. Demoing previously needed a devtools fetch or the workspace API
                key; neither is something to do in front of an audience. */}
            {isSuperAdmin && (
              <button
                type="button"
                className="app-button app-button-secondary app-button-sm"
                disabled={seed.isPending}
                onClick={() => seed.mutate()}
                title="Seeds six specimen countermarks covering every grade. Re-running replaces only its own rows."
              >
                <BeakerIcon className="h-4 w-4" />
                <span>{seed.isPending ? "Seeding…" : "Seed demo data"}</span>
              </button>
            )}
            {canIssueCountermark && (
              <button
                type="button"
                className="app-button app-button-primary app-button-sm"
                onClick={() => {
                  setScanId(eligibleScans[0]?.id ?? "");
                  setIssueOpen(true);
                }}
              >
                Strike a countermark
              </button>
            )}
          </div>
        </div>

        {(seed.data || seed.error) && (
          <div
            className={cn(
              "border-b px-4 py-2.5 text-sm",
              seed.error || seed.data?.ok === false
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-800",
            )}
          >
            {seed.error ? (
              <>Seed failed: {seed.error.message}</>
            ) : (
              <>
                Seeded {seed.data?.seeded} specimen countermarks against {seed.data?.standard}.{" "}
                {/* Surfaced rather than swallowed: a mismatch means the engine no longer
                    grades these fixtures as they claim, so the demo is showing something
                    other than what it says it is. */}
                {seed.data?.gradeMismatches.length
                  ? `⚠️ ${seed.data.gradeMismatches.length} grade mismatch(es): ${seed.data.gradeMismatches.join("; ")}`
                  : "Every grade matched the engine's own output."}
              </>
            )}
          </div>
        )}

        {isPending ? (
          <div className="widget-body-compact text-sm text-[var(--text-4)]">Loading register…</div>
        ) : error ? (
          <div className="widget-body-compact text-sm text-red-600">
            Could not load the register: {error.message}
          </div>
        ) : countermarks.length === 0 ? (
          <div className="widget-body-compact">
            <p className="text-sm text-[var(--text-3)]">
              No countermarks yet. Run a Pulse scan to completion, then strike a mark from it.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-2)]">
            {countermarks.map((h) => (
              <li
                key={h.id}
                className={cn(
                  // 2px grade rail. Makes the register scannable down the left edge without
                  // colouring whole rows, which at seven-plus marks reads as an error state.
                  "border-l-2 py-3.5 pr-4 pl-[14px] transition-colors hover:bg-[var(--surface-1)]",
                  GRADE_RAIL[h.grade],
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[14.5px] font-medium text-[var(--text-1)] [overflow-wrap:anywhere]">
                        {h.subjectName}
                      </span>
                      <Badge grade={h.grade} />
                    </div>

                    {/* One meta rail, not three competing treatments. Status keeps its tone
                        because it is the thing that changes; everything else is muted, so the
                        eye lands on VALID / LAPSED / REVOKED rather than on the standard id. */}
                    <p className="mt-1 font-mono text-[10.5px] tracking-wide text-[var(--text-4)]">
                      <span className={cn("uppercase", STATUS_TONE[h.status])}>
                        {h.status}
                        {(h.status === "VALID" || h.status === "EXPIRING") && ` · ${h.daysRemaining}d`}
                      </span>
                      {!h.seal && <span className="text-amber-600"> · UNSEALED</span>}
                      {" · "}
                      {h.standardId} v{h.standardVersion} · {h.coverage.measured}/{h.coverage.total} clauses ·{" "}
                      {h.checkCount} checks · {formatDate(h.issuedAt)} · {h.issuerName}
                    </p>

                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--text-3)] [overflow-wrap:anywhere]">
                      {h.gradeReason}
                    </p>

                    {/* Left-ruled rather than a filled slab: still unmissable, but it no longer
                        outweighs the verdict it is annotating. */}
                    {h.revokedReason && (
                      <p className="mt-2 border-l-2 border-red-300 pl-2.5 text-[12.5px] leading-relaxed text-red-700">
                        <span className="font-medium">Revoked.</span> {h.revokedReason}
                      </p>
                    )}
                  </div>

                  {/* Fixed-width action column so the icons form a straight edge down the list.
                      Previously the revoked row dropped its Revoke button and the whole cluster
                      shifted right, which is what made the list look misaligned. */}
                  <div className="flex w-auto shrink-0 items-center justify-end gap-1 sm:w-[116px]">
                    <button
                      type="button"
                      className="app-button app-button-tertiary app-button-icon-sm"
                      onClick={() => void copyLink(h.token)}
                      title="Copy the public certificate link"
                      aria-label={`Copy the certificate link for ${h.subjectName}`}
                    >
                      {copied === h.token ? (
                        <CheckIcon className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <ClipboardDocumentIcon className="h-4 w-4" />
                      )}
                    </button>
                    <a
                      className="app-button app-button-tertiary app-button-icon-sm"
                      href={`/countermark/${h.token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open the public certificate"
                      aria-label={`Open the public certificate for ${h.subjectName}`}
                    >
                      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    </a>
                    {canIssueCountermark &&
                      (h.revokedAt ? (
                        // Holds the slot so the column stays aligned. aria-hidden because it
                        // is pure spacing — announcing an empty control would be noise.
                        <span className="h-9 w-9" aria-hidden="true" />
                      ) : (
                        <button
                          type="button"
                          className="app-button app-button-tertiary app-button-icon-sm hover:!bg-[var(--danger-50)] hover:!text-[#b42318]"
                          onClick={() => {
                            setRevoking(h);
                            setRevokeReason("");
                          }}
                          title="Withdraw this countermark"
                          aria-label={`Withdraw the countermark for ${h.subjectName}`}
                        >
                          <NoSymbolIcon className="h-4 w-4" />
                        </button>
                      ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ─── Strike ─── */}
      <Modal open={issueOpen} onClose={() => setIssueOpen(false)} title="Strike a countermark">
        <div className="space-y-4 p-4">
          <p className="text-sm leading-relaxed text-[var(--text-2)]">
            The mark is examined from a completed Pulse scan and frozen at issue. Re-running the
            scan later does not change a mark already handed over.
          </p>

          <div>
            <label
              htmlFor="provenance-scan"
              className="mb-1.5 block font-mono text-[10px] font-medium uppercase tracking-[0.6px] text-[var(--text-4)]"
            >
              Completed scan
            </label>
            <select
              id="provenance-scan"
              className="app-select-chevron w-full pr-9"
              value={scanId}
              onChange={(e) => setScanId(e.target.value)}
            >
              {eligibleScans.length === 0 && <option value="">No completed scans available</option>}
              {eligibleScans.map((s) => (
                <option key={s.id} value={s.id}>
                  {/* The list DTO carries no completedAt; for a COMPLETED scan updatedAt is
                      when it finished being written, which is what this label means. */}
                  {s.projectName} — {s.healthScore ?? "—"}/100 · {formatDate(s.updatedAt)}
                </option>
              ))}
            </select>
          </div>

          {issue.error && <p className="text-sm text-red-600">{issue.error.message}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="app-button app-button-secondary app-button-sm" onClick={() => setIssueOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="app-button app-button-primary app-button-sm"
              disabled={!scanId || issue.isPending}
              onClick={() => {
                issue.mutate(
                  { scanId },
                  { onSuccess: () => setIssueOpen(false) },
                );
              }}
            >
              <CheckBadgeIcon className="h-4 w-4" />
              <span className="ml-1.5">{issue.isPending ? "Examining…" : "Strike"}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── Revoke ─── */}
      <Modal open={revoking !== null} onClose={() => setRevoking(null)} title="Revoke this countermark">
        <div className="space-y-4 p-4">
          <p className="text-sm leading-relaxed text-[var(--text-2)]">
            Revoking does not delete the certificate. The link stays live and reports{" "}
            <span className="font-semibold">Revoked</span> with the reason below — that is the only
            way whoever holds it finds out.
          </p>
          <div>
            <label
              htmlFor="provenance-revoke-reason"
              className="mb-1.5 block font-mono text-[10px] font-medium uppercase tracking-[0.6px] text-[var(--text-4)]"
            >
              Reason (shown publicly)
            </label>
            <textarea
              id="provenance-revoke-reason"
              className="app-input min-h-[96px] w-full px-3 py-2"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="e.g. A credential was found in the shipped bundle after issue."
            />
          </div>
          {revoke.error && <p className="text-sm text-red-600">{revoke.error.message}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="app-button app-button-secondary app-button-sm" onClick={() => setRevoking(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="app-button app-button-danger app-button-sm"
              disabled={revokeReason.trim().length < 10 || revoke.isPending}
              onClick={() => {
                if (!revoking) return;
                revoke.mutate(
                  { id: revoking.id, reason: revokeReason.trim() },
                  { onSuccess: () => setRevoking(null) },
                );
              }}
            >
              {revoke.isPending ? "Revoking…" : "Revoke"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
