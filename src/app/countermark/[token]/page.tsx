// The public certificate — the whole point of the product.
//
// This page is read by someone who did NOT commission the examination and has no account: a
// client accepting handover, an insurer's underwriter, an acquirer's analyst, a
// procurement officer. Three consequences shape everything below.
//
// 1. It states what is NOT established as prominently as what is. A certificate that
//    buries its caveats is worse than no certificate, because the reader's confidence
//    goes up while their information does not.
// 2. It never assumes the reader can read code. Every clause carries a plain-English
//    assertion and a "why this matters".
// 3. It renders from the FROZEN snapshot on the row, never from the live standard file, so
//    the text is what was sealed at issue — see the Countermark model comment in schema.prisma.

import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircleIcon, ExclamationTriangleIcon, XCircleIcon, QuestionMarkCircleIcon, MinusCircleIcon } from "@heroicons/react/24/outline";
import { getCountermarkByToken } from "@/server/provenance/issue";
import { buildPayload } from "@/server/provenance/issue";
import { verifyAttestation } from "@/server/provenance/digest";
import { isAsserting } from "@/server/provenance/lapse";
import { getStandard } from "@/server/provenance/standard";
import type { ClauseVerdict, CountermarkRecord, CountermarkStatus } from "@/server/provenance/types";
import { cn, formatDate } from "@/lib/format";

// Never cached: status is a function of the clock (a mark lapses without anything being
// written) and revocation must take effect on the next load, not up to 5 minutes later.
// The Pulse report can afford `unstable_cache` because a completed scan is immutable; a
// certificate's headline verdict is not.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const robots = { index: false, follow: false } as const;
  const countermark = await getCountermarkByToken(token);
  if (!countermark) return { title: "Certificate not found — Gitwork Provenance", robots };
  return {
    title: `${countermark.subjectName} — ${GRADE_COPY[countermark.grade].label} · Gitwork Provenance`,
    description: `${countermark.standardId} attestation for ${countermark.subjectName}, issued ${formatDate(countermark.issuedAt)} by ${countermark.issuerName}.`,
    robots,
  };
}

const GRADE_COPY: Record<CountermarkRecord["grade"], { label: string; blurb: string; tone: string; ring: string }> = {
  CERTIFIED: {
    label: "Certified",
    blurb: "Every clause of the standard that applies to this software was met on confirmed evidence.",
    tone: "text-emerald-700",
    ring: "border-emerald-300 bg-emerald-50",
  },
  CONDITIONAL: {
    label: "Certified with conditions",
    blurb: "Every critical clause was met. Some non-critical clauses failed or were only partly met — they are listed below.",
    tone: "text-amber-700",
    ring: "border-amber-300 bg-amber-50",
  },
  NOT_CERTIFIED: {
    label: "Not certified",
    blurb: "One or more critical clauses failed on confirmed evidence. This software does not meet the standard.",
    tone: "text-red-700",
    ring: "border-red-300 bg-red-50",
  },
  INCOMPLETE: {
    label: "Incomplete examination",
    blurb:
      "No critical clause failed, but at least one could not be established from the evidence available. " +
      "This is not a pass: the examination could not see enough to certify.",
    tone: "text-slate-700",
    ring: "border-slate-300 bg-slate-100",
  },
};

const VERDICT_COPY: Record<ClauseVerdict, { label: string; tone: string; Icon: typeof CheckCircleIcon }> = {
  MET: { label: "Met", tone: "text-emerald-600", Icon: CheckCircleIcon },
  QUALIFIED: { label: "Partly met", tone: "text-amber-600", Icon: ExclamationTriangleIcon },
  FAILED: { label: "Failed", tone: "text-red-600", Icon: XCircleIcon },
  UNPROVEN: { label: "Not established", tone: "text-slate-500", Icon: QuestionMarkCircleIcon },
  NOT_APPLICABLE: { label: "Not applicable", tone: "text-slate-400", Icon: MinusCircleIcon },
};

const STATUS_COPY: Record<CountermarkStatus, { label: string; note: string; tone: string }> = {
  VALID: { label: "Valid", note: "", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  EXPIRING: { label: "Expiring soon", note: "Due for re-examination.", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  LAPSED: {
    label: "Lapsed",
    note: "This mark has passed its validity window and no longer asserts anything. It does not mean a fault was found — it means nobody has re-checked since.",
    tone: "border-slate-300 bg-slate-100 text-slate-600",
  },
  REVOKED: {
    label: "Revoked",
    note: "The issuer withdrew this mark before it expired. Do not rely on it.",
    tone: "border-red-200 bg-red-50 text-red-700",
  },
  SUPERSEDED: {
    label: "Superseded",
    note: "A newer mark has been issued for this software. Ask the issuer for the current certificate.",
    tone: "border-blue-200 bg-blue-50 text-blue-700",
  },
};

export default async function CountermarkCertificatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // A countermark token is 32 random bytes base64url-encoded (43 chars). Cheap reject before
  // touching the DB, matching the public Pulse report's guard.
  if (!token || token.length < 20) notFound();

  const countermark = await getCountermarkByToken(token);
  if (!countermark) notFound();

  const grade = GRADE_COPY[countermark.grade];
  const status = STATUS_COPY[countermark.status];
  const asserting = isAsserting(countermark.status);
  const standard = getStandard(countermark.standardId);

  // Re-derive the seal from the frozen contents on every load. This is the actual
  // verification step — without it the padlock would only be saying "a digest column is
  // populated", which is not a claim about anything.
  const payload = buildPayload({
    countermarkId: countermark.id,
    issuedAt: new Date(countermark.issuedAt),
    expiresAt: new Date(countermark.expiresAt),
    issuerName: countermark.issuerName,
    subjectName: countermark.subjectName,
    subjectRepo: countermark.subjectRepo,
    subjectCommit: countermark.subjectCommit,
    subjectUrl: countermark.subjectUrl,
    standardId: countermark.standardId,
    standardVersion: countermark.standardVersion,
    grade: countermark.grade,
    clauses: countermark.clauses,
    blindSpots: countermark.blindSpots,
    scanId: countermark.scanId,
    scanVersion: countermark.scanVersion,
    checkCount: countermark.checkCount,
  });
  const { verdict: sealVerdict } = verifyAttestation(payload, countermark.digest, countermark.seal);

  const SEAL_COPY: Record<typeof sealVerdict, string> = {
    SEALED: "Contents verified against the issuer's seal.",
    UNSEALED: "Contents match their digest, but this mark carries no issuer seal — its authenticity cannot be confirmed from this page alone.",
    UNVERIFIABLE: "Contents match their digest. The issuer's seal is present but cannot be checked here.",
    TAMPERED: "The contents of this certificate do NOT match the digest recorded at issue. Do not rely on it.",
  };

  const failed = countermark.clauses.filter((c) => c.verdict === "FAILED");
  const unproven = countermark.clauses.filter((c) => c.verdict === "UNPROVEN");

  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAF9] print:min-h-0">
      <div className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
          {/* ─── Masthead ─── */}
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]">
              GITWORK PROVENANCE // CERTIFICATE OF ATTESTATION
            </span>
            <span className="font-mono text-[12px] text-[var(--text-4)]">
              {countermark.standardId} v{countermark.standardVersion}
            </span>
          </div>

          {/* ─── Verdict ─── */}
          <div className={cn("rounded-[10px] border p-5 sm:p-7", grade.ring)}>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.6px] text-[var(--text-4)]">
              Subject of attestation
            </p>
            <h1 className="mt-1 font-serif text-3xl leading-[1.15] tracking-[-0.02em] text-[var(--text-1)] sm:text-4xl [overflow-wrap:break-word]">
              {countermark.subjectName}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={cn("font-serif text-2xl sm:text-3xl", grade.tone)}>{grade.label}</span>
              <span className={cn("rounded-[4px] border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", status.tone)}>
                {status.label}
              </span>
            </div>
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-[var(--text-2)]">{grade.blurb}</p>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--text-3)]">{countermark.gradeReason}</p>

            {/* A lapsed/revoked/superseded mark says so here, above everything it used to
                assert — the reader must not have to scroll to find out it does not count. */}
            {!asserting && (
              <p className="mt-4 rounded-[6px] border border-[var(--border-2)] bg-white/70 px-3 py-2.5 text-sm leading-relaxed text-[var(--text-2)]">
                <span className="font-semibold">{status.label}.</span> {status.note}
                {countermark.status === "REVOKED" && countermark.revokedReason && (
                  <>
                    {" "}
                    Reason given: <span className="italic">{countermark.revokedReason}</span>
                  </>
                )}
              </p>
            )}
          </div>

          {/* ─── Provenance ─── */}
          <div className="widget-card mt-5">
            <div className="widget-header">
              <span className="widget-header-label">01 // PROVENANCE</span>
              <span className="widget-header-right">{countermark.checkCount} checks</span>
            </div>
            <div className="widget-body-compact">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <Field label="Issued by" value={countermark.issuerName} />
                <Field label="Issued" value={formatDate(countermark.issuedAt)} mono />
                <Field
                  label={asserting ? "Valid until" : "Expired"}
                  value={`${formatDate(countermark.expiresAt)}${asserting ? ` · ${countermark.daysRemaining}d left` : ""}`}
                  mono
                />
                <Field label="Standard" value={`${countermark.standardId} v${countermark.standardVersion}`} mono />
                {countermark.subjectRepo && <Field label="Repository" value={countermark.subjectRepo} mono />}
                {countermark.subjectUrl && <Field label="Live address" value={countermark.subjectUrl} mono />}
                <Field label="Clause coverage" value={`${countermark.coverage.measured} of ${countermark.coverage.total} clauses assessed`} mono />
                <Field label="Engine version" value={countermark.scanVersion} mono />
              </dl>

              <div className="mt-4 border-t border-[var(--border-2)] pt-3">
                <p
                  className={cn(
                    "text-sm leading-relaxed",
                    sealVerdict === "TAMPERED" ? "font-semibold text-red-600"
                    : sealVerdict === "SEALED" ? "text-emerald-700"
                    : "text-[var(--text-3)]",
                  )}
                >
                  {SEAL_COPY[sealVerdict]}
                </p>
                {/* Printed so a reader can recompute it independently rather than taking
                    this page's word for it. Wraps rather than truncating — a digest you
                    can only see 12 characters of verifies nothing. */}
                <p className="mt-2 font-mono text-[11px] leading-relaxed text-[var(--text-4)] [overflow-wrap:anywhere]">
                  digest sha256:{countermark.digest}
                </p>
              </div>
            </div>
          </div>

          {/* ─── What this does NOT establish. Deliberately ABOVE the clause list. ─── */}
          <div className="widget-card mt-5">
            <div className="widget-header">
              <span className="widget-header-label">02 // WHAT THIS MARK DOES NOT ESTABLISH</span>
              <span className="widget-header-right">{countermark.blindSpots.length} noted</span>
            </div>
            <div className="widget-body-compact">
              <p className="mb-3 text-sm leading-relaxed text-[var(--text-2)]">
                Read this section before relying on anything above. An attestation is only worth
                what its limits are honest about.
              </p>
              <ul className="space-y-2.5">
                {countermark.blindSpots.map((spot, i) => (
                  <li key={`${spot.kind}-${i}`} className="flex gap-2.5">
                    <QuestionMarkCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-4)]" />
                    <div className="min-w-0">
                      <p className="text-sm leading-relaxed text-[var(--text-2)] [overflow-wrap:break-word]">{spot.statement}</p>
                      {spot.clauseIds.length > 0 && (
                        <p className="mt-0.5 font-mono text-[11px] text-[var(--text-4)]">
                          Clauses: {spot.clauseIds.join(", ")}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ─── Headline problems, if any ─── */}
          {(failed.length > 0 || unproven.length > 0) && (
            <div className="widget-card mt-5">
              <div className="widget-header">
                <span className="widget-header-label">03 // OUTSTANDING</span>
                <span className="widget-header-right">
                  {failed.length} failed · {unproven.length} not established
                </span>
              </div>
              <div className="divide-y divide-[var(--border-2)]">
                {[...failed, ...unproven].map((c) => {
                  const v = VERDICT_COPY[c.verdict];
                  return (
                    <div key={c.clauseId} className="flex gap-3 px-4 py-3">
                      <v.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", v.tone)} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-sm font-medium text-[var(--text-1)] [overflow-wrap:break-word]">{c.title}</span>
                          <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-4)]">
                            {c.clauseId} · {v.label}
                            {c.critical ? " · critical" : ""}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-3)] [overflow-wrap:break-word]">{c.rationale}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Every clause, in full ─── */}
          <div className="widget-card mt-5">
            <div className="widget-header">
              <span className="widget-header-label">04 // CLAUSE BY CLAUSE</span>
              <span className="widget-header-right">{countermark.clauses.length} clauses</span>
            </div>
            <div className="divide-y divide-[var(--border-2)]">
              {countermark.clauses.map((c) => {
                const v = VERDICT_COPY[c.verdict];
                return (
                  <div key={c.clauseId} className="px-4 py-4">
                    <div className="flex gap-3">
                      <v.Icon className={cn("mt-0.5 h-4 w-4 shrink-0", v.tone)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-sm font-medium text-[var(--text-1)] [overflow-wrap:break-word]">{c.title}</span>
                          <span className={cn("font-mono text-[10px] uppercase tracking-wide", v.tone)}>
                            {c.clauseId} · {v.label}
                            {c.critical ? " · critical" : ""}
                          </span>
                        </div>
                        {/* The assertion is the sentence a counterparty relies on, so it is
                            shown for a met clause and withheld for one that is not met —
                            printing it under a FAILED verdict would read as the claim. */}
                        {c.verdict === "MET" && (
                          <p className="mt-1 text-sm leading-relaxed text-[var(--text-2)] [overflow-wrap:break-word]">{c.assertion}</p>
                        )}
                        <p className="mt-1 text-xs leading-relaxed text-[var(--text-3)] [overflow-wrap:break-word]">{c.rationale}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── The standard's own scope ─── */}
          {standard && (
            <div className="widget-card mt-5">
              <div className="widget-header">
                <span className="widget-header-label">05 // THE STANDARD</span>
                <span className="widget-header-right">
                  {standard.id} v{countermark.standardVersion}
                </span>
              </div>
              <div className="widget-body-compact">
                <p className="text-sm font-medium text-[var(--text-1)]">{standard.label}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-2)]">{standard.summary}</p>
                <p className="mt-3 text-xs leading-relaxed text-[var(--text-3)]">
                  This is a conformance attestation produced by automated inspection of code,
                  configuration and public responses. It is not a penetration test, a code review, or
                  a warranty, and it does not transfer liability to the issuer.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-[#0F172A] px-4 py-8 text-center sm:px-6">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-semibold text-white">Verify or re-examination this software</p>
          <p className="mt-1 text-sm text-slate-400">
            Marks lapse on purpose. Gitwork re-examines continuously so a certificate never outlives its evidence.
          </p>
          <div className="mt-4">
            <Link
              href="https://gitwork.co.uk"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-[10px] bg-white px-5 py-2.5 text-sm font-semibold text-[#0F172A] hover:bg-slate-100"
            >
              Talk to Gitwork
            </Link>
          </div>
          <p className="mt-4 font-mono text-[10px] text-slate-600">
            GITWORK PROVENANCE · {countermark.standardId} v{countermark.standardVersion} · REF {countermark.id}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] font-medium uppercase tracking-[0.6px] text-[var(--text-4)]">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-sm text-[var(--text-1)] [overflow-wrap:anywhere]",
          mono && "font-mono text-[12px]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
