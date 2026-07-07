/**
 * Extra, ready-to-use templates for the engineering team — release/incident/sprint reports,
 * technical handovers, and an ADR. These seed alongside the per-type defaults (see bootstrap) as
 * additional, non-default `DocumentTemplate` rows, so they show up as options in the create
 * gallery under their document type. They deliberately lean on the newer blocks (process_steps,
 * do_dont, principles_grid, category_checklist, the heading banner) so devs get a strong starting
 * point rather than a blank page.
 */

import type { DocumentType } from "@prisma/client";
import type { SectionBlueprint } from "@/lib/default-template";

export interface ExtraTemplate {
  slug: string;
  name: string;
  documentType: DocumentType;
  description: string;
  sections: SectionBlueprint[];
}

const today = () => new Date().toISOString().slice(0, 10);

function cover(title: string, subtitle: string): SectionBlueprint {
  return {
    key: "cover",
    title: "Cover",
    description: "Front page.",
    data: {
      proposalTitle: title,
      productName: "",
      clientName: "",
      subtitle,
      date: today(),
      confidentiality: "Internal — Gitwork engineering.",
      confidentialityMode: "INTERNAL",
      heroImage: "",
      coverStyle: "light",
      brandLockup: "GITWORK",
    },
  };
}

export const EXTRA_TEMPLATES: ExtraTemplate[] = [
  // ── Release & deploy report ────────────────────────────────────────────────
  {
    slug: "dev-release-report",
    name: "Release & deploy report",
    documentType: "REPORT",
    description: "The staging → QA → production release process, with the pre-deploy checklist.",
    sections: [
      cover("Release Report", "Staging → QA → Production"),
      {
        key: "heading",
        title: "Release process",
        description: "Banner opener.",
        data: {
          level: "h2",
          style: "banner",
          eyebrow: "Release & testing process",
          text: "Staging → QA → Production",
          subtitle:
            "No feature, fix or UI change reaches customers without completing the process. Production is a live environment with real customer data — we treat it like one, every time.",
        },
      },
      {
        key: "process_steps",
        title: "The release workflow",
        description: "Each change moves through these stages.",
        data: {
          steps: [
            { label: "Development" },
            { label: "Developer testing" },
            { label: "Deploy to staging" },
            { label: "QA testing" },
            { label: "Deploy to production" },
          ],
          highlightLast: true,
          arrows: true,
          layout: "row",
        },
      },
      {
        key: "category_checklist",
        title: "QA testing",
        description: "What QA validates before sign-off.",
        data: {
          columns: 2,
          groups: [
            { title: "Functional", items: ["Behaves as expected", "Existing functionality still works", "Edge cases handled", "Validation messages display correctly"] },
            { title: "UI & UX", items: ["Layout correct & responsive", "Consistent spacing & styling", "British English throughout", "Notifications behave correctly"] },
            { title: "Data", items: ["Records save correctly", "Relationships maintained", "Statuses update correctly", "No duplicate records"] },
            { title: "Performance", items: ["Pages load correctly", "No unnecessary delays", "No obvious performance issues"] },
          ],
        },
      },
      {
        key: "do_dont",
        title: "Production readiness",
        description: "Confirm before deploying; never ship these.",
        data: {
          doTitle: "Before deploying, confirm",
          doItems: [
            "No test data exists",
            "No placeholder or dummy content",
            "No debug information visible",
            "Feature flags reviewed",
            "Database migrations verified",
            "Rollback plan available if required",
          ],
          dontTitle: "Never in production",
          dontItems: [
            "Testing with dummy data",
            "Creating fake suppliers or customers",
            "Leaving placeholder or development content",
            "Deploying unfinished features",
            "Deploying work that skipped QA",
          ],
          dontStyle: "dark",
          footnote: "If a feature cannot be safely tested in Production, stop and raise it before proceeding.",
        },
      },
      {
        key: "principles_grid",
        title: "Every deployment leaves production…",
        description: "The standard we hold.",
        data: {
          style: "dark",
          columns: 3,
          items: [
            { title: "Stable" },
            { title: "Clean" },
            { title: "Free from test data" },
            { title: "Free from unfinished work" },
            { title: "Fully tested" },
            { title: "Ready for customers" },
          ],
        },
      },
    ],
  },

  // ── Incident post-mortem ───────────────────────────────────────────────────
  {
    slug: "dev-incident-postmortem",
    name: "Incident post-mortem",
    documentType: "REPORT",
    description: "A blameless post-mortem — impact, timeline, root cause and the follow-up actions.",
    sections: [
      cover("Incident Post-Mortem", "What happened, and what we changed"),
      {
        key: "kpi_strip",
        title: "Impact at a glance",
        description: "The headline numbers.",
        data: {
          items: [
            { value: "—", label: "Duration", context: "detection → resolution" },
            { value: "—", label: "Users affected" },
            { value: "—", label: "Severity" },
            { value: "—", label: "Detected by", context: "alert / customer" },
          ],
        },
      },
      {
        key: "prose",
        title: "Summary",
        description: "A short, blameless account of what happened.",
        data: {
          content:
            "A plain-English summary of the incident — what broke, who noticed, and the customer-facing effect. Keep it factual and blameless; the goal is a stronger system, not blame.",
        },
      },
      {
        key: "process_steps",
        title: "Response timeline",
        description: "How the incident was handled.",
        data: {
          layout: "stack",
          arrows: false,
          steps: [
            { label: "Detection", note: "HH:MM" },
            { label: "Mitigation", note: "HH:MM" },
            { label: "Root cause found", note: "HH:MM" },
            { label: "Resolution", note: "HH:MM" },
          ],
        },
      },
      {
        key: "do_dont",
        title: "What went well / what to improve",
        description: "Honest reflection.",
        data: {
          doTitle: "What went well",
          doItems: ["", "", ""],
          dontTitle: "What to improve",
          dontItems: ["", "", ""],
          dontStyle: "light",
        },
      },
      {
        key: "category_checklist",
        title: "Action items",
        description: "Concrete follow-ups, with owners.",
        data: {
          columns: 3,
          groups: [
            { title: "Prevent", items: [""] },
            { title: "Detect sooner", items: [""] },
            { title: "Respond faster", items: [""] },
          ],
        },
      },
      {
        key: "callout",
        title: "Owner & follow-up",
        description: "Who owns the actions.",
        data: {
          tone: "info",
          headline: "Owner & review date",
          body: "Name the owner for the action items above and a date to review that they've landed.",
        },
      },
    ],
  },

  // ── Sprint report ──────────────────────────────────────────────────────────
  {
    slug: "dev-sprint-report",
    name: "Sprint report",
    documentType: "REPORT",
    description: "An end-of-sprint summary — what shipped, what carried over, and what's next.",
    sections: [
      cover("Sprint Report", "Sprint summary"),
      {
        key: "kpi_strip",
        title: "Sprint at a glance",
        description: "The headline numbers.",
        data: {
          items: [
            { value: "—", label: "Planned" },
            { value: "—", label: "Shipped" },
            { value: "—", label: "Carried over" },
            { value: "—", label: "Velocity", context: "vs last sprint" },
          ],
        },
      },
      {
        key: "checklist",
        title: "Shipped this sprint",
        description: "Completed and merged.",
        data: { polarity: "INCLUDE", intro: "", items: ["", "", ""] },
      },
      {
        key: "checklist",
        title: "Carried over",
        description: "Not completed — moving to next sprint.",
        data: { polarity: "EXCLUDE", intro: "", items: ["", ""] },
      },
      {
        key: "prose",
        title: "Notes & blockers",
        description: "Anything the team should know.",
        data: { content: "Blockers hit, decisions made, and anything worth flagging for next sprint." },
      },
      {
        key: "process_steps",
        title: "Next sprint focus",
        description: "The priorities lined up.",
        data: { layout: "stack", arrows: false, steps: [{ label: "" }, { label: "" }, { label: "" }] },
      },
    ],
  },

  // ── Technical handover ─────────────────────────────────────────────────────
  {
    slug: "dev-technical-handover",
    name: "Technical handover",
    documentType: "HANDOVER",
    description: "Hand a project to another dev — architecture, access, setup and the gotchas.",
    sections: [
      cover("Technical Handover", "Everything the next team needs"),
      {
        key: "prose",
        title: "Overview",
        description: "What this project is, and its current state.",
        data: {
          content:
            "A short overview of the project — what it does, the stack, the current state, and anything in flight. Link the repo, the staging URL and the production URL.",
        },
      },
      {
        key: "category_checklist",
        title: "The moving parts",
        description: "Repos, environments, services and access.",
        data: {
          columns: 2,
          groups: [
            { title: "Repositories", items: [""] },
            { title: "Environments", items: ["Staging", "Production"] },
            { title: "Third-party services", items: [""] },
            { title: "Access needed", items: [""] },
          ],
        },
      },
      {
        key: "process_steps",
        title: "Local setup",
        description: "Getting it running from scratch.",
        data: {
          layout: "stack",
          arrows: false,
          steps: [
            { label: "Clone the repo & install dependencies" },
            { label: "Copy .env.example → .env and fill secrets" },
            { label: "Run the database / migrations" },
            { label: "Start the dev server" },
          ],
        },
      },
      {
        key: "data_table",
        title: "Access & credentials",
        description: "Where the keys live (never paste secrets here).",
        data: {
          columns: ["System", "Where it lives", "Owner"],
          rows: [
            ["Hosting", "", ""],
            ["Database", "", ""],
            ["Secrets / env", "", ""],
            ["Domain / DNS", "", ""],
          ],
          caption: "Point to the vault/manager — don't paste live secrets into the doc.",
        },
      },
      {
        key: "do_dont",
        title: "Working in this codebase",
        description: "Conventions to keep, traps to avoid.",
        data: {
          doTitle: "Do",
          doItems: ["Follow the existing patterns", "Run the tests before pushing", "Keep changes small and reviewed"],
          dontTitle: "Don't",
          dontItems: ["Commit secrets", "Push straight to main", "Skip the migration check"],
          dontStyle: "dark",
        },
      },
      {
        key: "callout",
        title: "Who to contact",
        description: "The humans to ask.",
        data: {
          tone: "info",
          headline: "Questions?",
          body: "List the people who know this project best and the best way to reach them.",
        },
      },
    ],
  },

  // ── Architecture Decision Record ───────────────────────────────────────────
  {
    slug: "dev-adr",
    name: "Architecture decision record",
    documentType: "BRIEF",
    description: "Capture one technical decision — the context, the options, and what you chose.",
    sections: [
      cover("Architecture Decision Record", "ADR-000 · Short decision title"),
      {
        key: "prose",
        title: "Context",
        description: "The forces at play.",
        data: {
          content:
            "What's the situation that forces a decision? The constraints, the problem, and why now. Keep it neutral — no solution yet.",
        },
      },
      {
        key: "do_dont",
        title: "Options weighed",
        description: "The trade-off that drove the call.",
        data: {
          doTitle: "For the chosen option",
          doItems: ["", ""],
          dontTitle: "Against / rejected options",
          dontItems: ["", ""],
          dontStyle: "light",
        },
      },
      {
        key: "callout",
        title: "Decision",
        description: "What we're doing.",
        data: {
          tone: "info",
          headline: "Decision",
          body: "State the decision in one or two sentences, in the present tense: “We will …”.",
        },
      },
      {
        key: "prose",
        title: "Consequences",
        description: "What becomes easier or harder.",
        data: {
          content: "What this makes easier, what it makes harder, and any follow-up work it creates.",
        },
      },
    ],
  },
];
