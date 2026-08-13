/**
 * Editor-side e-signature panel (Sprint 4).
 *
 * Lives on the document editor below the approval popover. Shows the current SignatureRequest
 * state, signer list with their statuses, and the "Send for signature" / "Revoke" controls.
 *
 * v1 behaviour:
 *   - No active request:      one button creates AND sends in a single click. Signers are
 *                             auto-derived from the document's parties / signatures section.
 *   - DRAFT request exists:   "Send to signers" + "Discard" buttons.
 *   - SENT request:           per-signer copy-link button, signer statuses, revoke button.
 *   - COMPLETED request:      audit summary + "Download Certificate" hint (the printable view
 *                             carries the full appendix).
 *   - DECLINED / REVOKED / EXPIRED: dead state, with "Start a new request" affordance.
 */

"use client";

import { useState } from "react";
import { ArrowPathIcon, CheckCircleIcon, ClipboardDocumentIcon, EnvelopeIcon, PaperAirplaneIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/format";
import {
  findActiveRequest,
  useCreateSignatureRequest,
  usePushDocuSeal,
  useRevokeSignatureRequest,
  useSendSignatureRequest,
  useSignatureRequests,
  type SignatureSignerRecord,
  type SignerStatus,
} from "@/hooks/use-signatures";

interface SignaturePanelProps {
  documentId: string;
}

const SIGNER_STATUS_STYLE: Record<SignerStatus, { label: string; bg: string; color: string }> = {
  PENDING: { label: "PENDING", bg: "var(--surface-1)", color: "var(--text-4)" },
  VIEWED: { label: "VIEWED", bg: "var(--surface-brand)", color: "var(--brand-700)" },
  SIGNED: { label: "SIGNED", bg: "var(--success-50)", color: "var(--success-500)" },
  DECLINED: { label: "DECLINED", bg: "var(--danger-50)", color: "var(--danger-500)" },
};

export function SignaturePanel({ documentId }: SignaturePanelProps) {
  const requestsQuery = useSignatureRequests(documentId);
  const createMutation = useCreateSignatureRequest(documentId);
  const sendMutation = useSendSignatureRequest(documentId);
  const revokeMutation = useRevokeSignatureRequest(documentId);
  const { error: toastError, success: toastSuccess } = useToast();
  const [message, setMessage] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = findActiveRequest(requestsQuery.data);
  const docusealMutation = usePushDocuSeal(documentId);
  const isWorking = createMutation.isPending || sendMutation.isPending || revokeMutation.isPending || docusealMutation.isPending;

  const docUpdatedAt = active?.document?.updatedAt ? new Date(active.document.updatedAt).getTime() : 0;
  const requestSentAt = active?.sentAt ? new Date(active.sentAt).getTime() : active?.createdAt ? new Date(active.createdAt).getTime() : 0;
  const isDocModified = docUpdatedAt > 0 && requestSentAt > 0 && docUpdatedAt > requestSentAt + 2000;

  async function handleSendNow() {
    setError(null);
    try {
      // Create then immediately send so the user only has to click once.
      const created = await createMutation.mutateAsync({ message: message.trim() || undefined });
      await sendMutation.mutateAsync(created.id);
      setMessage("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handlePushDocuSeal() {
    setError(null);
    try {
      await docusealMutation.mutateAsync();
      toastSuccess("DocuSeal submission activated successfully!");
      setMessage("");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "DocuSeal push failed.";
      setError(errMsg);
      toastError(`DocuSeal Error: ${errMsg}`);
      alert(`DocuSeal Push Failed:\n\n${errMsg}`);
    }
  }

  async function handleSendExisting(requestId: string) {
    setError(null);
    try {
      await sendMutation.mutateAsync(requestId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleRevoke(requestId: string) {
    setError(null);
    if (!confirm("Revoke this signature request? Existing signing links will stop working immediately.")) {
      return;
    }
    try {
      await revokeMutation.mutateAsync(requestId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function copyLink(token: string) {
    const url = typeof window !== "undefined" ? `${window.location.origin}/sign/${token}` : `/sign/${token}`;
    void navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 1500);
  }

  return (
    <section className="widget-card overflow-hidden">
      <div className="widget-header">
        <span className="widget-header-label">SIGNATURE</span>
        <span className="widget-header-right">
          {isDocModified ? (
            <span className="font-semibold text-amber-500">NEEDS RE-ACTIVATION</span>
          ) : active?.docusealSubmissionId ? (
            "DOCUSEAL"
          ) : active ? (
            active.status
          ) : (
            "READY"
          )}
        </span>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        {requestsQuery.isPending ? (
          <p className="text-sm text-[var(--text-3)]">Loading signature state…</p>
        ) : null}

        {error ? (
          <p className="text-sm font-medium text-[var(--danger-500)]">{error}</p>
        ) : null}

        {!active ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm leading-6 text-[var(--text-2)]">
                Send the document to every signatory in the <strong>Signatures</strong> section.
                Both <strong>Gitwork</strong> and <strong>Client</strong> signers receive tokenized embedded links
                served on our Foundry staging domain.
              </p>
              <p className="mt-2 text-xs text-[var(--text-4)]">
                Tip: signature blocks with custom variables and DocuSeal roles (Gitwork vs Client) will map automatically.
              </p>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-[var(--text-2)]">Optional message to signers</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="app-textarea mt-1.5"
                rows={2}
                placeholder="Quick note that shows up next to the signing box."
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handlePushDocuSeal}
                loading={docusealMutation.isPending}
                leadingIcon={<PaperAirplaneIcon className="h-4 w-4" />}
              >
                Activate Signature
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={handleSendNow}
                loading={isWorking}
              >
                Native E-Sign
              </Button>
            </div>
          </div>
        ) : null}

        {active && active.status === "DRAFT" ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-[var(--text-2)]">
              Request prepared with {active.signers.length} signer{active.signers.length === 1 ? "" : "s"}. Send it
              when you&rsquo;re ready &mdash; that&rsquo;s what mints the public signing links.
            </p>
            <SignerList documentId={documentId} signers={active.signers} onCopyLink={copyLink} copiedToken={copiedToken} requestSent={false} onRefresh={() => void requestsQuery.refetch()} />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => handleSendExisting(active.id)}
                loading={sendMutation.isPending}
                leadingIcon={<PaperAirplaneIcon className="h-4 w-4" />}
              >
                Send to signers
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => handleRevoke(active.id)}
                loading={revokeMutation.isPending}
                leadingIcon={<TrashIcon className="h-4 w-4" />}
              >
                Discard
              </Button>
            </div>
          </div>
        ) : null}

        {active && active.status === "SENT" ? (
          <div className="space-y-4">
            {isDocModified ? (
              <div className="space-y-1.5 rounded-[10px] border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200">
                <div className="flex items-center gap-2 font-semibold text-amber-400">
                  <ArrowPathIcon className="h-4 w-4 shrink-0" />
                  <span>Document updated — Re-activation required</span>
                </div>
                <p className="text-[12px] leading-relaxed opacity-90">
                  The document was modified since DocuSeal was activated. Click <strong className="font-semibold text-amber-300">Review &amp; Send</strong> at the top right of the editor and click <strong className="font-semibold text-amber-300">Re-activate DocuSeal</strong> to update signers with the latest content.
                </p>
              </div>
            ) : null}

            <div className={cn("space-y-4 transition-opacity", isDocModified && "pointer-events-none opacity-40 select-none")}>
              <SignedSoFar signers={active.signers} />
              <SignerList
                documentId={documentId}
                signers={active.signers}
                onCopyLink={copyLink}
                copiedToken={copiedToken}
                requestSent={true}
                disabled={isDocModified}
                onRefresh={() => void requestsQuery.refetch()}
              />
            </div>
          </div>
        ) : null}

        {active && active.status === "COMPLETED" ? (
          <div className="space-y-4">
            <div className="rounded-[10px] border border-[var(--success-500)]/30 bg-[var(--success-50)] px-4 py-3">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--success-500)]">
                ALL SIGNERS SIGNED
              </p>
              <p className="mt-1 text-sm text-[var(--text-2)]">
                The document is locked. The printable view now includes a Certificate of Completion
                appendix with full audit trail.
              </p>
            </div>
            <SignerList documentId={documentId} signers={active.signers} onCopyLink={copyLink} copiedToken={copiedToken} requestSent={true} onRefresh={() => void requestsQuery.refetch()} />
          </div>
        ) : null}

        {active && (active.status === "DECLINED" || active.status === "REVOKED" || active.status === "EXPIRED") ? (
          <div className="space-y-4">
            <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]">
                REQUEST {active.status}
              </p>
              <p className="mt-1 text-sm text-[var(--text-2)]">
                {active.status === "DECLINED"
                  ? "A signer declined. Address their feedback and start a new request."
                  : active.status === "REVOKED"
                    ? "This request was revoked. Start a new one when ready."
                    : "This request expired before completion. Start a new one when ready."}
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleSendNow}
              loading={isWorking}
              leadingIcon={<ArrowPathIcon className="h-4 w-4" />}
            >
              Start a new request
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SignedSoFar({ signers }: { signers: SignatureSignerRecord[] }) {
  const signed = signers.filter((s) => s.status === "SIGNED").length;
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
      <div className="font-[family-name:var(--font-display)] text-3xl leading-none text-[var(--text-1)]">
        {signed}/{signers.length}
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--text-1)]">Signed so far</p>
        <p className="text-xs text-[var(--text-3)]">
          The document completes automatically once every signer signs.
        </p>
      </div>
    </div>
  );
}

function SignerList({
  documentId,
  signers,
  onCopyLink,
  copiedToken,
  requestSent,
  onRefresh,
  disabled = false,
}: {
  documentId: string;
  signers: SignatureSignerRecord[];
  onCopyLink: (token: string) => void;
  copiedToken: string | null;
  requestSent: boolean;
  onRefresh?: () => void;
  disabled?: boolean;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);

  async function handleSendSmtpEmail(signer: SignatureSignerRecord) {
    setSendingEmailId(signer.id);
    try {
      const res = await fetch(`/api/documents/${documentId}/signatures/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerId: signer.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send email");
      }
      toastSuccess(`HTML Email sent to ${signer.email}`);
      onRefresh?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send email";
      toastError(msg);
      alert(`SMTP Email Failed:\n\n${msg}`);
    } finally {
      setSendingEmailId(null);
    }
  }

  return (
    <ul className="space-y-2">
      {signers.map((s) => {
        const tone = SIGNER_STATUS_STYLE[s.status];
        const isSending = sendingEmailId === s.id;
        return (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-[var(--text-1)]">
                  {s.name} <span className="text-[var(--text-4)]">·</span>{" "}
                  <span className="text-[var(--text-3)]">{s.role}</span>
                </p>
                {s.signerType ? (
                  <span className="rounded bg-[var(--bg-3)] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--brand-700)]">
                    {s.signerType}
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-[var(--text-4)]">{s.email}</p>
              {s.docusealEmbedSrc ? (
                <p className="mt-0.5 font-mono text-[10px] text-[var(--brand-600)]">
                  DocuSeal Embedded: {s.variableName || "signature"}
                </p>
              ) : null}
              {s.signedAt ? (
                <p className="mt-0.5 text-[11px] text-[var(--text-4)]">
                  Signed {new Date(s.signedAt).toLocaleString()}
                </p>
              ) : null}
              {s.firstViewedAt && !s.signedAt ? (
                <p className="mt-0.5 text-[11px] text-[var(--text-4)]">
                  Last accessed {new Date(s.firstViewedAt).toLocaleString()}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <span
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em]"
                style={{ background: tone.bg, color: tone.color, padding: "3px 8px", borderRadius: 4 }}
              >
                {tone.label}
              </span>
              {requestSent && s.status !== "SIGNED" && s.status !== "DECLINED" ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={disabled || isSending}
                    onClick={() => handleSendSmtpEmail(s)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[var(--brand-600)] bg-[var(--brand-50)] px-3 text-xs font-medium text-[var(--brand-700)] transition hover:bg-[var(--brand-100)]",
                      (isSending || disabled) && "opacity-60 cursor-not-allowed",
                    )}
                    title="Automatically send formatted HTML template email via Gmail SMTP"
                  >
                    <EnvelopeIcon className="h-3.5 w-3.5 text-[var(--brand-600)]" />
                    {isSending ? "Sending…" : "Email link"}
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onCopyLink(s.accessToken)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-3 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]",
                      disabled && "opacity-60 cursor-not-allowed",
                    )}
                    title="Copy this signer's signing link"
                  >
                    <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                    {copiedToken === s.accessToken ? "Copied" : "Copy link"}
                  </button>
                  <a
                    href={disabled ? undefined : `/sign/${s.accessToken}`}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      "inline-flex h-8 items-center gap-1 rounded-[6px] border border-[var(--brand-600)] bg-[var(--brand-50)] px-2.5 text-xs font-medium text-[var(--brand-700)] transition hover:bg-[var(--brand-100)]",
                      disabled && "opacity-60 cursor-not-allowed pointer-events-none",
                    )}
                  >
                    Open
                  </a>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
