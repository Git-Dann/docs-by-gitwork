/**
 * DocuSeal MSA Pre-flight Modal
 *
 * Collects the 8 engagement fields that cannot be derived from the database
 * before issuing the DocuSeal submission. Values are saved to document.metadata
 * on the server so the modal is pre-filled next time.
 * Supports Groq AI auto-extraction from document text.
 */

"use client";

import { useState } from "react";
import { DocumentTextIcon, XMarkIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export interface DocuSealPreflightValues {
  effectiveDate: string;    // DD/MM/YYYY
  serviceTier: string;
  sowReference: string;
  charges: string;
  paymentSchedule: string;
  startDate: string;        // DD/MM/YYYY
  duration: string;
  publicityConsent: "Yes" | "No";
}

interface DocuSealPreflightModalProps {
  open: boolean;
  onClose: () => void;
  /** Document ID to fetch text for AI auto-extraction. */
  documentId?: string;
  /** Called with the collected values when the admin clicks "Issue MSA". */
  onSubmit: (values: DocuSealPreflightValues) => Promise<void>;
  /** Pre-fill from document.metadata.msaDetails if it exists. */
  initialValues?: Partial<DocuSealPreflightValues>;
}

function todayDDMMYYYY(): string {
  return new Date().toLocaleDateString("en-GB"); // DD/MM/YYYY
}

/** Convert a DD/MM/YYYY string to yyyy-mm-dd for <input type="date">. */
function toInputDate(ddmmyyyy: string): string {
  if (!ddmmyyyy) return "";
  const [d, m, y] = ddmmyyyy.split("/");
  if (!d || !m || !y) return "";
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Convert yyyy-mm-dd from <input type="date"> back to DD/MM/YYYY. */
function fromInputDate(yyyymmdd: string): string {
  if (!yyyymmdd) return "";
  const [y, m, d] = yyyymmdd.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

export function DocuSealPreflightModal({
  open,
  onClose,
  documentId,
  onSubmit,
  initialValues,
}: DocuSealPreflightModalProps) {
  const [effectiveDate, setEffectiveDate] = useState(
    toInputDate(initialValues?.effectiveDate || todayDDMMYYYY()),
  );
  const [serviceTier, setServiceTier] = useState(initialValues?.serviceTier ?? "");
  const [sowReference, setSowReference] = useState(initialValues?.sowReference ?? "");
  const [charges, setCharges] = useState(initialValues?.charges ?? "");
  const [paymentSchedule, setPaymentSchedule] = useState(initialValues?.paymentSchedule ?? "");
  const [startDate, setStartDate] = useState(
    toInputDate(initialValues?.startDate || ""),
  );
  const [duration, setDuration] = useState(initialValues?.duration ?? "");
  const [publicityConsent, setPublicityConsent] = useState<"Yes" | "No">(
    initialValues?.publicityConsent ?? "No",
  );

  const [submitting, setSubmitting] = useState(false);
  const [isExtractingAi, setIsExtractingAi] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setError(null);
    onClose();
  }

  async function handleAiAutoFill() {
    if (!documentId) return;
    setIsExtractingAi(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/ai-extract`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to extract AI fields");

      const extracted = json.data?.extracted || json.extracted || {};

      if (extracted.effectiveDate) setEffectiveDate(toInputDate(extracted.effectiveDate));
      if (extracted.serviceTier) setServiceTier(extracted.serviceTier);
      if (extracted.sowReference) setSowReference(extracted.sowReference);
      if (extracted.charges) setCharges(extracted.charges);
      if (extracted.paymentSchedule) setPaymentSchedule(extracted.paymentSchedule);
      if (extracted.startDate) setStartDate(toInputDate(extracted.startDate));
      if (extracted.duration) setDuration(extracted.duration);
      if (extracted.publicityConsent) setPublicityConsent(extracted.publicityConsent);

    } catch (err) {
      console.error(err);
      setError((err as Error).message ?? "AI extraction failed");
    } finally {
      setIsExtractingAi(false);
    }
  }

  async function handleSubmit() {
    // Validate required fields
    if (!effectiveDate) { setError("Effective date is required."); return; }
    if (!serviceTier.trim()) { setError("Service tier is required."); return; }
    if (!charges.trim()) { setError("Charges are required."); return; }
    if (!startDate) { setError("Target start date is required."); return; }
    if (!duration.trim()) { setError("Indicative duration is required."); return; }

    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        effectiveDate: fromInputDate(effectiveDate),
        serviceTier: serviceTier.trim(),
        sowReference: sowReference.trim(),
        charges: charges.trim(),
        paymentSchedule: paymentSchedule.trim(),
        startDate: fromInputDate(startDate),
        duration: duration.trim(),
        publicityConsent,
      });
      handleClose();
    } catch (err) {
      setError((err as Error).message ?? "Failed to issue MSA. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} panelClassName="w-full max-w-lg">
      {/* Header */}
      <div className="widget-header">
        <span className="widget-header-label">SEND MSA VIA DOCUSEAL</span>
        <button
          type="button"
          onClick={handleClose}
          className="text-[var(--text-4)] transition hover:text-[var(--text-1)]"
          aria-label="Close"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-5 p-6">
        {/* Info banner + AI Auto-fill action */}
        <div className="flex items-center justify-between gap-3 rounded-[8px] border border-[var(--brand-300)] bg-[var(--brand-50)] px-3.5 py-2.5">
          <div className="flex items-start gap-2 min-w-0">
            <DocumentTextIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-700)]" />
            <p className="text-xs leading-5 text-[var(--brand-700)]">
              Details pre-filled into MSA template & locked for client.
            </p>
          </div>
          {documentId ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAiAutoFill}
              loading={isExtractingAi}
              className="shrink-0 border-[var(--brand-300)] bg-white text-[var(--brand-700)] hover:bg-[var(--brand-100)]"
              leadingIcon={<SparklesIcon className="h-3.5 w-3.5 text-[var(--brand-600)]" />}
            >
              {isExtractingAi ? "Analyzing..." : "Auto-fill with AI"}
            </Button>
          ) : null}
        </div>

        {/* Row 1: Dates */}
        <div className="grid grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">
              Effective Date <span className="text-[var(--danger-500)]">*</span>
            </span>
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="app-input"
            />
            <span className="text-[11px] text-[var(--text-4)]">
              Date the agreement becomes effective
            </span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">
              Target Start Date <span className="text-[var(--danger-500)]">*</span>
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="app-input"
            />
            <span className="text-[11px] text-[var(--text-4)]">
              When the engagement work begins
            </span>
          </label>
        </div>

        {/* Row 2: Service tier + SOW ref */}
        <div className="grid grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">
              Service / Tier <span className="text-[var(--danger-500)]">*</span>
            </span>
            <input
              type="text"
              value={serviceTier}
              onChange={(e) => setServiceTier(e.target.value)}
              placeholder="e.g. Care Plan, Growth"
              className="app-input"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">
              Statement of Work Ref
            </span>
            <input
              type="text"
              value={sowReference}
              onChange={(e) => setSowReference(e.target.value)}
              placeholder="e.g. SOW-2026-003"
              className="app-input"
            />
          </label>
        </div>

        {/* Row 3: Charges + Payment schedule */}
        <div className="grid grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">
              Charges <span className="text-[var(--danger-500)]">*</span>
            </span>
            <input
              type="text"
              value={charges}
              onChange={(e) => setCharges(e.target.value)}
              placeholder="e.g. £4,500/month excl. VAT"
              className="app-input"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">
              Payment Schedule
            </span>
            <input
              type="text"
              value={paymentSchedule}
              onChange={(e) => setPaymentSchedule(e.target.value)}
              placeholder="e.g. Monthly in advance"
              className="app-input"
            />
          </label>
        </div>

        {/* Row 4: Duration + Publicity consent */}
        <div className="grid grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">
              Indicative Duration <span className="text-[var(--danger-500)]">*</span>
            </span>
            <input
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 12 months"
              className="app-input"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-[var(--text-2)]">
              Publicity Consent
            </span>
            <select
              value={publicityConsent}
              onChange={(e) => setPublicityConsent(e.target.value as "Yes" | "No")}
              className="app-select"
            >
              <option value="Yes">Yes — client consents to publicity</option>
              <option value="No">No — client does not consent</option>
            </select>
            <span className="text-[11px] text-[var(--text-4)]">
              Pre-set on behalf of the client (locked in PDF)
            </span>
          </label>
        </div>

        {/* Error */}
        {error ? (
          <p className="text-sm font-medium text-[var(--danger-500)]">{error}</p>
        ) : null}

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-[var(--border-2)] pt-4">
          <Button type="button" variant="secondary" size="md" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleSubmit}
            loading={submitting}
            leadingIcon={<DocumentTextIcon className="h-4 w-4" />}
          >
            Issue MSA
          </Button>
        </div>
      </div>
    </Modal>
  );
}
