"use client";

import {
  ArrowPathIcon,
  BeakerIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  CloudArrowUpIcon,
  DocumentMagnifyingGlassIcon,
  SparklesIcon,
  UserCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCreateProofDocument } from "@/hooks/use-proof";
import { useAnalyseBrief } from "@/hooks/use-proof-brief";
import { cn } from "@/lib/format";
import type { ProofDocumentRecord } from "@/lib/proof";
import type { BriefAnalysis, BriefConfidence } from "@/types/proof-brief";

const MIN_BRIEF_LENGTH = 50;
const MAX_BRIEF_LENGTH = 20000;

const DEMO_BRIEF = `Project Brief — Apex Wellness App
Client: Apex Health Group
Date: April 2025
Prepared for: Gitwork Delivery Team

Overview
Apex Health Group is looking for a digital product studio to design and build a cross-platform wellness app for their corporate clients. The platform will allow employees of Apex's enterprise customers to track fitness goals, access guided meditations, log nutrition, and join group challenges. The primary objective is to reduce employee burnout and increase measurable engagement with workplace wellbeing programmes.

Goals
1. Launch an iOS and Android app within 6 months of project kickoff
2. Achieve 40% monthly active user rate within 3 months of launch
3. Integrate with existing HR platforms (Workday, BambooHR) via API
4. Provide admin dashboards for HR managers to view anonymised engagement data
5. Establish a scalable content management system for wellbeing content

Deliverables
- Branded iOS and Android native apps (React Native)
- Admin web portal for HR managers (React / Next.js)
- Content CMS for wellbeing articles, videos, and challenges
- API integrations with Workday and BambooHR
- Analytics dashboard with cohort reporting
- Onboarding flow and push notification system

Timeline
Kickoff: May 2025
Design phase: 6 weeks (May–June 2025)
Development sprint 1 (auth, onboarding, profile): July 2025
Development sprint 2 (tracking, challenges, content): August 2025
QA & testing: September 2025
App store submission & launch: October 2025

Budget
Total approved budget: £320,000 (GBP)
This includes design, development, QA, project management, and a 3-month post-launch support retainer.

Technical Requirements
- React Native for mobile (iOS 16+, Android 10+)
- Next.js for admin web portal
- Node.js / PostgreSQL backend
- AWS infrastructure (ECS, RDS, S3)
- OAuth 2.0 / SSO for enterprise authentication
- WCAG 2.1 AA accessibility compliance

Target Audience
Corporate employees aged 25–55 at Apex's enterprise clients. Primarily desk-based workers who are time-poor and need low-friction access to wellness resources during the workday.

Success Criteria
- 40% MAU within 3 months post-launch
- App store rating of 4.2+ within 60 days
- Zero critical security incidents in first 6 months
- Integration uptime of 99.5% or better

Key Contacts
- Sarah Okonkwo, Head of Product — sarah.o@apexhealthgroup.com
- James Rafferty, CTO — james.r@apexhealthgroup.com
- Delivery lead from Gitwork TBC

Constraints
- GDPR compliance is non-negotiable; all health data must be encrypted at rest and in transit
- App store submission must go through Apex's existing Apple Developer and Google Play accounts
- No user health data may be stored in the US (EU-only hosting required)
- Design must align with Apex's existing brand guidelines (supplied on project kickoff)`;

const ACCEPTED_TYPES = ".txt,.md,.pdf,.doc,.docx";

const DEMO_ANALYSIS: BriefAnalysis = {
  clientName: "Apex Health Group",
  projectTitle: "Apex Wellness App",
  overview:
    "Apex Health Group requires a cross-platform corporate wellness app enabling employees to track fitness, log nutrition, access meditations, and join group challenges. The goal is to reduce burnout and drive measurable wellbeing engagement across enterprise clients. Gitwork will deliver the mobile apps, admin portal, CMS, and HR system integrations.",
  goals: [
    "Launch iOS and Android apps within 6 months of project kickoff",
    "Achieve 40% monthly active user rate within 3 months of launch",
    "Integrate with Workday and BambooHR via API",
    "Provide HR admin dashboards with anonymised engagement data",
    "Establish a scalable CMS for wellbeing content",
  ],
  deliverables: [
    "Branded iOS & Android apps (React Native)",
    "Admin web portal for HR managers (React / Next.js)",
    "Wellbeing content CMS (articles, videos, challenges)",
    "API integrations with Workday and BambooHR",
    "Analytics dashboard with cohort reporting",
    "Onboarding flow and push notification system",
  ],
  timeline: "May–October 2025 (6 months). Design: 6 weeks. Dev sprints: July–August. QA: September. Launch: October.",
  budget: "£320,000 GBP — includes design, development, QA, PM, and 3-month post-launch support retainer.",
  targetAudience:
    "Corporate employees aged 25–55 at Apex enterprise clients — primarily desk-based, time-poor workers needing low-friction access to workplace wellness resources.",
  technicalRequirements: [
    "React Native for mobile (iOS 16+, Android 10+)",
    "Next.js for the admin web portal",
    "Node.js / PostgreSQL backend",
    "AWS infrastructure (ECS, RDS, S3)",
    "OAuth 2.0 / SSO for enterprise authentication",
    "WCAG 2.1 AA accessibility compliance",
  ],
  successCriteria: [
    "40% MAU within 3 months post-launch",
    "App store rating of 4.2+ within 60 days",
    "Zero critical security incidents in first 6 months",
    "Integration uptime of 99.5% or better",
  ],
  keyContacts: [
    { name: "Sarah Okonkwo", role: "Head of Product" },
    { name: "James Rafferty", role: "CTO" },
  ],
  constraints: [
    "GDPR compliance required — all health data encrypted at rest and in transit",
    "App store submission through Apex's existing developer accounts",
    "No health data may be stored in the US — EU-only hosting required",
    "Design must follow Apex brand guidelines supplied at kickoff",
  ],
  confidence: "HIGH",
};

export function ProofWorkspace({
  initialBrief,
  initialScenario: _initialScenario,
}: {
  initialBrief?: string;
  initialScenario?: string;
}) {
  const [brief, setBrief] = useState(initialBrief ?? "");
  const [fromCodeClear] = useState(Boolean(initialBrief));
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [demoAnalysis, setDemoAnalysis] = useState<BriefAnalysis | null>(null);
  const [savedDocument, setSavedDocument] = useState<ProofDocumentRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mutation = useAnalyseBrief();
  const createDocumentMutation = useCreateProofDocument();

  const analysis = demoAnalysis ?? mutation.data?.analysis ?? null;
  const errorMessage = mutation.error instanceof Error ? mutation.error.message : null;
  const charCount = brief.length;
  const briefTooShort = charCount > 0 && charCount < MIN_BRIEF_LENGTH;
  const briefTooLong = charCount > MAX_BRIEF_LENGTH;
  const canSubmit = charCount >= MIN_BRIEF_LENGTH && !briefTooLong && !mutation.isPending;

  function handleDemo() {
    setBrief(DEMO_BRIEF);
    setUploadedFile(null);
    setUploadError(null);
    mutation.reset();
    setDemoAnalysis(DEMO_ANALYSIS);
    setSavedDocument(null);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    setDemoAnalysis(null);
    setSavedDocument(null);
    mutation.mutate(brief);
  }

  function handleClear() {
    setBrief("");
    setUploadedFile(null);
    setUploadError(null);
    setDemoAnalysis(null);
    setSavedDocument(null);
    mutation.reset();
  }

  function handleCopySummary() {
    if (!analysis) return;
    const parts: string[] = [];
    if (analysis.projectTitle) parts.push(`Project: ${analysis.projectTitle}`);
    if (analysis.clientName) parts.push(`Client: ${analysis.clientName}`);
    if (analysis.overview) parts.push(`\nOverview\n${analysis.overview}`);
    if (analysis.goals.length) parts.push(`\nGoals\n${analysis.goals.map((g) => `• ${g}`).join("\n")}`);
    if (analysis.deliverables.length) parts.push(`\nDeliverables\n${analysis.deliverables.map((d) => `• ${d}`).join("\n")}`);
    void navigator.clipboard.writeText(parts.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleSaveDraft() {
    if (!analysis || createDocumentMutation.isPending) {
      return;
    }

    const title =
      analysis.projectTitle?.trim() ||
      (analysis.clientName ? `${analysis.clientName} Brief` : "") ||
      uploadedFile?.replace(/\.[^.]+$/, "") ||
      "Untitled Proof Draft";

    const parts = [
      `# ${title}`,
      analysis.clientName ? `\nClient: ${analysis.clientName}` : "",
      analysis.overview ? `\n## Overview\n\n${analysis.overview}` : "",
      analysis.goals.length ? `\n## Goals\n\n${analysis.goals.map((item) => `- ${item}`).join("\n")}` : "",
      analysis.deliverables.length
        ? `\n## Deliverables\n\n${analysis.deliverables.map((item) => `- ${item}`).join("\n")}`
        : "",
      analysis.timeline ? `\n## Timeline\n\n${analysis.timeline}` : "",
      analysis.budget ? `\n## Budget\n\n${analysis.budget}` : "",
      analysis.technicalRequirements.length
        ? `\n## Technical Requirements\n\n${analysis.technicalRequirements.map((item) => `- ${item}`).join("\n")}`
        : "",
      analysis.successCriteria.length
        ? `\n## Success Criteria\n\n${analysis.successCriteria.map((item) => `- ${item}`).join("\n")}`
        : "",
      analysis.constraints.length
        ? `\n## Constraints\n\n${analysis.constraints.map((item) => `- ${item}`).join("\n")}`
        : "",
      brief.trim() ? `\n## Source Brief\n\n${brief.trim()}` : "",
    ].filter(Boolean);

    const result = await createDocumentMutation.mutateAsync({
      title,
      markdown: parts.join("\n"),
    });

    setSavedDocument(result.document);
  }

  function readFile(file: File) {
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === "string" && text.trim().length > 0) {
        setBrief(text.slice(0, MAX_BRIEF_LENGTH));
        setUploadedFile(file.name);
        mutation.reset();
      } else {
        setUploadError("Could not read text from this file. Try a plain .txt or .md file, or paste the brief directly.");
        setUploadedFile(null);
      }
    };
    reader.onerror = () => {
      setUploadError("Failed to read the file. Please try again or paste the brief.");
      setUploadedFile(null);
    };
    reader.readAsText(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }

  return (
    <div className="grid min-h-0 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      {/* Left panel — input */}
      <aside className="space-y-4">
        <section className="app-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="app-eyebrow">Proof</p>
              <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                Brief analysis
              </h2>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              className="mt-1"
              onClick={handleDemo}
              leadingIcon={<BeakerIcon className="h-3.5 w-3.5" />}
            >
              Demo
            </Button>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-3)]">
            {"Upload or paste a client brief — we'll extract the key information your team needs."}
          </p>

          <div className="mt-5 space-y-3">
            {fromCodeClear ? (
              <div className="flex items-start gap-2.5 rounded-[10px] border border-[var(--brand-200)] bg-[var(--surface-brand)] px-4 py-3">
                <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-700)]" />
                <p className="text-sm text-[var(--brand-700)]">
                  Brief pre-filled from your CodeClear match. Review it below and run the analysis to continue.
                </p>
              </div>
            ) : null}

            {/* File upload zone — Figma design 1175-100312 */}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={handleFileChange}
            />

            {uploadedFile ? (
              /* Uploaded state */
              <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircleIcon className="h-5 w-5 shrink-0 text-emerald-600" />
                  <span className="truncate text-sm font-medium text-[var(--text-1)]">{uploadedFile}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUploadedFile(null);
                    setBrief("");
                  }}
                  className="shrink-0 text-[var(--text-4)] transition hover:text-[var(--text-2)]"
                  title="Remove file"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            ) : (
              /* Drop zone */
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={cn(
                  "flex w-full flex-col items-center gap-3 rounded-[10px] border px-6 py-4 transition",
                  isDragging
                    ? "border-2 border-[var(--brand-500)] bg-white"
                    : "border border-[var(--border-2)] bg-white hover:border-[var(--brand-500)]/50",
                )}
              >
                {/* Icon — matches Figma Featured icon container */}
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-[6px] border border-[var(--border-1)] bg-white shadow-[var(--shadow-skeuomorphic)]">
                  <CloudArrowUpIcon className="h-5 w-5 text-[var(--text-3)]" />
                </div>

                {/* Action text */}
                <div className="space-y-1 text-center">
                  <div className="flex items-center justify-center gap-1 text-sm">
                    <span className="font-semibold text-[var(--brand-700)]">Click to upload</span>
                    <span className="text-[var(--text-3)]">or drag and drop</span>
                  </div>
                  <p className="text-xs text-[var(--text-3)]">
                    TXT, MD or PDF (brief will be read as plain text)
                  </p>
                </div>
              </button>
            )}

            {uploadError ? (
              <p className="text-xs text-amber-700">{uploadError}</p>
            ) : null}

            {/* Divider */}
            <div className="relative flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--border-2)]" />
              <span className="text-xs font-medium text-[var(--text-4)]">or paste below</span>
              <div className="h-px flex-1 bg-[var(--border-2)]" />
            </div>

            <textarea
              id="brief-input"
              value={brief}
              onChange={(e) => {
                setBrief(e.target.value);
                if (uploadedFile) setUploadedFile(null);
              }}
              rows={8}
              className="app-textarea"
              placeholder="Paste your client brief here…"
            />
            <div className="flex items-center justify-between text-xs text-[var(--text-4)]">
              <span className={cn(briefTooShort && "text-amber-600", briefTooLong && "text-rose-600")}>
                {charCount.toLocaleString()} / {MAX_BRIEF_LENGTH.toLocaleString()} characters
              </span>
              {briefTooShort && (
                <span className="text-amber-600">Minimum {MIN_BRIEF_LENGTH} characters</span>
              )}
              {briefTooLong && (
                <span className="text-rose-600">Brief too long</span>
              )}
            </div>

            <Button
              type="button"
              variant="primary"
              size="md"
              className="w-full justify-center"
              onClick={handleSubmit}
              disabled={!canSubmit}
              loading={mutation.isPending}
              leadingIcon={<SparklesIcon className="h-4 w-4" />}
            >
              {mutation.isPending ? "Analysing…" : "Analyse Brief"}
            </Button>

            {errorMessage ? (
              <div className="rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            {analysis ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full justify-center"
                onClick={handleClear}
                leadingIcon={<ArrowPathIcon className="h-4 w-4" />}
              >
                Analyse a new brief
              </Button>
            ) : null}
          </div>
        </section>

        <section className="app-muted-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">Tips</p>
          <ul className="mt-3 space-y-2.5">
            {[
              "Works best with full briefs, RFPs, or detailed email threads.",
              "Include any budget, timeline, or technical mentions for richer extraction.",
              "The more context, the higher the confidence score.",
              "Copy the summary to share a clean snapshot with your team.",
            ].map((tip) => (
              <li key={tip} className="flex items-start gap-2.5 text-sm leading-5 text-[var(--text-3)]">
                <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-[var(--brand-500)]/10 text-center text-[10px] font-bold leading-4 text-[var(--brand-700)]">
                  ✓
                </span>
                {tip}
              </li>
            ))}
          </ul>
        </section>
      </aside>

      {/* Right panel — results */}
      <section className="app-card flex min-h-[600px] flex-col p-5">
        {!analysis ? (
          /* Empty state */
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-sm text-center">
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border-2)] bg-white">
                <DocumentMagnifyingGlassIcon className="h-7 w-7 text-[var(--brand-700)]" />
              </div>
              <h4 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                {mutation.isPending ? "Analysing your brief…" : "Upload or paste a brief"}
              </h4>
              <p className="mt-3 text-sm leading-6 text-[var(--text-3)]">
                {mutation.isPending
                  ? "Claude is reading the brief and extracting key information. This usually takes a few seconds."
                  : "We'll extract goals, deliverables, timeline, budget, and more — laid out clearly for your team."}
              </p>
              {mutation.isPending ? (
                <div className="mx-auto mt-5 flex items-center justify-center gap-2 text-sm text-[var(--brand-600)]">
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  <span>Running analysis…</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          /* Results */
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Results header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-1)] pb-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  {analysis.clientName ? (
                    <span className="inline-flex items-center rounded-full border border-[var(--border-2)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--text-2)]">
                      {analysis.clientName}
                    </span>
                  ) : null}
                  <ConfidenceBadge confidence={analysis.confidence} />
                </div>
                <h3 className="text-[22px] font-semibold tracking-[-0.03em] text-[var(--text-1)]">
                  {analysis.projectTitle ?? "Brief Analysis"}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={savedDocument ? "secondary" : "primary"}
                  size="sm"
                  loading={createDocumentMutation.isPending}
                  disabled={Boolean(savedDocument)}
                  onClick={() => {
                    void handleSaveDraft();
                  }}
                >
                  {savedDocument ? "Saved to Docs" : "Save to Docs"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  leadingIcon={<ClipboardDocumentIcon className="h-4 w-4" />}
                  onClick={handleCopySummary}
                >
                  {copied ? "Copied!" : "Copy summary"}
                </Button>
                <Button
                  type="button"
                  variant="utility"
                  size="icon-sm"
                  onClick={handleClear}
                  title="Clear results"
                >
                  <XMarkIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {savedDocument ? (
              <div className="mt-4 rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Saved as <span className="font-semibold">{savedDocument.title}</span>. It will now appear in Docs and can be linked to proposals.
              </div>
            ) : null}

            {/* Results grid */}
            <div className="mt-4 flex-1 space-y-4 overflow-auto">
              {analysis.overview ? (
                <ResultCard label="Overview">
                  <p className="italic leading-6 text-[var(--text-2)]">{analysis.overview}</p>
                </ResultCard>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <ResultCard label="Goals" empty={!analysis.goals.length} emptyText="No goals identified">
                  <BulletList items={analysis.goals} />
                </ResultCard>
                <ResultCard label="Deliverables" empty={!analysis.deliverables.length} emptyText="No deliverables identified">
                  <BulletList items={analysis.deliverables} />
                </ResultCard>
              </div>

              {(analysis.timeline ?? analysis.budget) ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {analysis.timeline ? <StatCard label="Timeline" value={analysis.timeline} /> : null}
                  {analysis.budget ? <StatCard label="Budget" value={analysis.budget} /> : null}
                </div>
              ) : null}

              {analysis.targetAudience ? (
                <ResultCard label="Target Audience">
                  <p className="leading-6 text-[var(--text-2)]">{analysis.targetAudience}</p>
                </ResultCard>
              ) : null}

              {(analysis.technicalRequirements.length || analysis.successCriteria.length) ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {analysis.technicalRequirements.length ? (
                    <ResultCard label="Technical Requirements">
                      <BulletList items={analysis.technicalRequirements} />
                    </ResultCard>
                  ) : null}
                  {analysis.successCriteria.length ? (
                    <ResultCard label="Success Criteria">
                      <BulletList items={analysis.successCriteria} />
                    </ResultCard>
                  ) : null}
                </div>
              ) : null}

              {analysis.keyContacts.length ? (
                <ResultCard label="Key Contacts">
                  <div className="divide-y divide-[var(--border-2)]">
                    {analysis.keyContacts.map((contact, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-4)]">
                            <UserCircleIcon className="h-4 w-4" />
                          </div>
                          <span className="text-sm font-medium text-[var(--text-1)]">{contact.name}</span>
                        </div>
                        <span className="rounded-full border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-3)]">
                          {contact.role}
                        </span>
                      </div>
                    ))}
                  </div>
                </ResultCard>
              ) : null}

              {analysis.constraints.length ? (
                <ResultCard label="Constraints">
                  <BulletList items={analysis.constraints} />
                </ResultCard>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: BriefConfidence }) {
  const map: Record<BriefConfidence, { label: string; className: string }> = {
    HIGH: { label: "High confidence", className: "border-emerald-200 bg-[var(--success-50)] text-emerald-700" },
    MEDIUM: { label: "Medium confidence", className: "border-amber-200 bg-[var(--warning-50)] text-amber-700" },
    LOW: { label: "Low confidence", className: "border-rose-200 bg-[var(--danger-50)] text-rose-700" },
  };
  const { label, className } = map[confidence];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", className)}>
      {label}
    </span>
  );
}

function ResultCard({
  label, children, empty, emptyText,
}: {
  label: string; children?: React.ReactNode; empty?: boolean; emptyText?: string;
}) {
  return (
    <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">{label}</p>
      <div className="mt-2.5">
        {empty ? <p className="text-sm text-[var(--text-4)]">{emptyText}</p> : children}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[var(--text-1)]">{value}</p>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm leading-5 text-[var(--text-2)]">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-500)]" />
          {item}
        </li>
      ))}
    </ul>
  );
}
