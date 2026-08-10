/**
 * AI-Powered Document Creation Wizard Modal.
 *
 * 1. Upload reference document (PDF/DOCX/TXT) or type a brief.
 * 2. Select document template type (NDA, PROPOSAL, MSA, SLA, SOW, CO, DSA, HANDOVER, REPORT, BRIEF).
 * 3. AI extracts counterparties, scope, terms, and signature tags.
 * 4. Redirects to existing document editor.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpTrayIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/format";

export interface CreateDocumentWizardModalProps {
  open: boolean;
  onClose: () => void;
}

const DOCUMENT_TYPES = [
  { type: "NDA", label: "NDA", name: "Non-Disclosure Agreement", badge: "MUTUAL", desc: "Confidentiality terms & non-disclosure clauses" },
  { type: "PROPOSAL", label: "Proposal", name: "Client Proposal", badge: "COMMERCIAL", desc: "Scope of work, deliverables, costing & terms" },
  { type: "MSA", label: "MSA", name: "Master Services Agreement", badge: "LEGAL", desc: "Master legal terms, IP rights & governance" },
  { type: "SLA", label: "SLA", name: "Service Level Agreement", badge: "OPERATIONAL", desc: "Uptime targets, response times & support tiers" },
  { type: "SOW", label: "SOW", name: "Statement of Work", badge: "SCOPE", desc: "Project milestones, deliverables & payment schedule" },
  { type: "CO", label: "Change Order", name: "Change Order", badge: "AMENDMENT", desc: "Scope adjustments, timeline extensions & cost diffs" },
  { type: "DSA", label: "DSA", name: "Data Sharing Agreement", badge: "PRIVACY", desc: "GDPR compliance, data handling & security" },
  { type: "HANDOVER", label: "Handover", name: "Project Handover", badge: "TRANSFER", desc: "Asset manifests, credentials & support handover" },
  { type: "REPORT", label: "Report", name: "Status / Audit Report", badge: "ANALYTICS", desc: "Project status, analytics & executive summary" },
  { type: "BRIEF", label: "Brief", name: "Project Brief", badge: "INTAKE", desc: "Requirements gathering, goals & stakeholder brief" },
] as const;

export function CreateDocumentWizardModal({ open, onClose }: CreateDocumentWizardModalProps) {
  const router = useRouter();

  const [selectedType, setSelectedType] = useState<string>("NDA");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState("");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  }

  async function handleGenerate() {
    if (!selectedFile && brief.trim().length < 5) {
      setError("Please upload a reference document or enter brief context.");
      return;
    }

    setError(null);
    setSubmitting(true);
    setProgressMsg("Parsing reference document...");

    try {
      const formData = new FormData();
      formData.append("documentType", selectedType);
      if (title.trim()) formData.append("title", title.trim());
      if (brief.trim()) formData.append("brief", brief.trim());
      if (selectedFile) formData.append("file", selectedFile);

      setProgressMsg("AI extracting counterparties & mapping sections...");

      const res = await fetch("/api/documents/generate", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || `Generation failed with status ${res.status}`);
      }

      setProgressMsg("Opening document editor...");
      setTimeout(() => {
        onClose();
        router.push(`/app/docs/${json.documentId}`);
      }, 500);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} panelClassName="max-w-3xl">
      <div className="widget-header">
        <span className="widget-header-label">01 // AI DOCUMENT CREATOR</span>
        <span className="widget-header-right text-[var(--brand-700)]">AI EXTRACTION</span>
      </div>

      <div className="space-y-6 p-6">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-normal text-[var(--text-1)]">
            Create AI-Populated Document
          </h2>
          <p className="mt-1 text-sm text-[var(--text-3)]">
            Upload a reference document or paste project details. AI will extract counterparties, clauses,
            and signature fields automatically.
          </p>
        </div>

        {error ? (
          <div className="rounded-lg bg-[var(--danger-50)] p-3.5 text-sm font-medium text-[var(--danger-700)]">
            {error}
          </div>
        ) : null}

        {/* Step 1: Upload Reference Document or Brief */}
        <div className="space-y-3">
          <label className="app-field-label">1. Reference Document or Brief</label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* File Upload Dropzone */}
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border-2)] bg-[var(--surface-1)] p-4 text-center transition hover:border-[var(--brand-500)] hover:bg-white">
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={handleFileChange}
                className="hidden"
                disabled={submitting}
              />
              <ArrowUpTrayIcon className="h-6 w-6 text-[var(--brand-600)]" />
              <span className="mt-2 text-xs font-semibold text-[var(--text-1)]">
                {selectedFile ? selectedFile.name : "Upload Information Doc"}
              </span>
              <span className="mt-0.5 text-[11px] text-[var(--text-4)]">PDF, DOCX, TXT, or MD</span>
            </label>

            {/* Brief Text Input */}
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              disabled={submitting}
              rows={3}
              placeholder="Or paste key details here (e.g. client name, scope summary, dates, fees)..."
              className="app-textarea resize-none text-xs"
            />
          </div>
        </div>

        {/* Step 2: Select Document Type */}
        <div className="space-y-3">
          <label className="app-field-label">2. Select Document Template Type</label>
          <div className="grid max-h-[220px] grid-cols-1 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
            {DOCUMENT_TYPES.map((dt) => {
              const isSelected = selectedType === dt.type;
              return (
                <button
                  key={dt.type}
                  type="button"
                  onClick={() => setSelectedType(dt.type)}
                  disabled={submitting}
                  className={cn(
                    "flex flex-col items-start rounded-lg border p-3 text-left transition",
                    isSelected
                      ? "border-[var(--brand-600)] bg-[var(--brand-50)] shadow-sm"
                      : "border-[var(--border-2)] bg-white hover:border-[var(--border-1)] hover:bg-[var(--surface-1)]",
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--text-1)]">{dt.name}</span>
                    <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[var(--brand-700)]">
                      {dt.badge}
                    </span>
                  </div>
                  <span className="mt-1 text-[11px] text-[var(--text-3)] line-clamp-1">{dt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 3: Custom Title (Optional) */}
        <div className="space-y-1.5">
          <label className="app-field-label">3. Document Title (Optional)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={submitting}
            placeholder={`Auto-generated e.g. ${selectedType} — Client Name`}
            className="app-input text-xs"
          />
        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border-2)] pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-xs font-medium text-[var(--text-3)] hover:text-[var(--text-1)]"
          >
            Cancel
          </button>

          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleGenerate}
            loading={submitting}
            leadingIcon={<SparklesIcon className="h-4 w-4" />}
          >
            {submitting ? progressMsg || "Generating..." : "Generate with AI & Open Editor"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
