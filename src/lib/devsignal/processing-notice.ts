/**
 * DevSignal candidate processing notice + right-to-explanation content. SINGLE
 * SOURCE, versioned — the consent record stamps `PROCESSING_NOTICE_VERSION`, so
 * we always know which notice a candidate agreed to.
 *
 * ⚠️ This is plain-English scaffolding written to satisfy the *mechanism* of
 * GDPR Art. 13/14 (transparency) + Art. 22 (automated-decision explanation).
 * The exact wording, lawful basis, retention periods and DPO/contact details
 * must be reviewed and signed off by Gitwork's data-protection/legal advisor
 * before this is relied on with real candidates. Code provides the plumbing,
 * not the legal opinion.
 *
 * Framework-free (no React/Prisma imports) so both the server (recording +
 * validation) and the client (rendering) import it.
 */

export const PROCESSING_NOTICE_VERSION = "v1";

/** Where candidates direct data-rights requests. TODO: confirm with legal. */
export const DATA_CONTACT_EMAIL = "privacy@gitwork.co.uk";

export interface ExplanationStage {
  title: string;
  /** What this stage measures — no scores, no weights (best-match philosophy). */
  measures: string;
  automated: boolean;
}

/** The "how you're assessed" breakdown surfaced to the candidate (Art. 22). */
export const EXPLANATION_STAGES: ExplanationStage[] = [
  {
    title: "About you",
    measures: "The details you provide — role, stack, experience and availability.",
    automated: false,
  },
  {
    title: "GitHub activity",
    measures: "A look at your public GitHub work: languages, project depth and recent activity.",
    automated: true,
  },
  {
    title: "Coding challenge",
    measures:
      "How you approach a realistic task — correctness against tests and how you work through it. Using AI is expected and never counts against you.",
    automated: true,
  },
  {
    title: "Intro answer",
    measures:
      "The content and structure of what you say — never your accent, tone, appearance or how 'native' you sound.",
    automated: true,
  },
  {
    title: "Identity check",
    measures: "That the person assessed is the person placed. We store only a pass/fail — never your ID documents.",
    automated: true,
  },
  {
    title: "Human review",
    measures:
      "A member of the Gitwork team reviews everything and makes the final call. No outcome is decided by a machine alone.",
    automated: false,
  },
];

/** How candidate data is handled — surfaced alongside the consent checkboxes. */
export const DATA_HANDLING_POINTS: string[] = [
  "Your audio intro is transcribed and then discarded — we don't keep the recording.",
  "We keep the transcript only if you tick the box to allow it; otherwise we keep only anonymised signals.",
  "We never store your identity documents — only a pass/fail result from the verification provider.",
  "You can ask us to explain your assessment, appeal the outcome for human re-review, or delete your data at any time.",
];

export interface ConsentItem {
  key: "processing" | "humanReview";
  required: boolean;
  label: string;
}

/** The consent checkboxes shown before any data is processed. */
export const CONSENT_ITEMS: ConsentItem[] = [
  {
    key: "processing",
    required: true,
    label:
      "I consent to Gitwork processing my assessment data — the details I provide, my public GitHub activity, my coding-challenge submission, my intro answer and an identity check — to evaluate me for developer opportunities.",
  },
  {
    key: "humanReview",
    required: true,
    label:
      "I understand a human makes the final decision (no outcome is decided solely by automated means), and that I can request an explanation, appeal for re-review, or ask for my data to be deleted.",
  },
];

export type DataRequestType = "EXPLANATION" | "APPEAL" | "ERASURE";

export const DATA_REQUEST_LABELS: Record<DataRequestType, string> = {
  EXPLANATION: "Explain my assessment",
  APPEAL: "Appeal for human re-review",
  ERASURE: "Delete my data",
};
