import { DocumentType, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_PROPOSAL_METADATA, getDefaultProposalSections } from "@/lib/default-template";
import {
  TEMPLATE_NAME_BY_TYPE,
  TEMPLATE_SLUG_BY_TYPE,
  getTemplateBlueprintsForType,
} from "@/lib/templates";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_TEMPLATE_SLUG,
  DEFAULT_USER_EMAIL,
  DEFAULT_WORKSPACE_SLUG,
  getDefaultAssetPayload,
  getDefaultCostsPayload,
  getDefaultCtaPayload,
  getDefaultLinkPayload,
  getDefaultSectionPayload,
  getDefaultTimelinePayload,
} from "@/server/proposals";
import { getDefaultRateCardPeoplePayload } from "@/server/rate-card";
import { getDefaultCodeClearCandidatePayloads } from "@/server/codeclear";

// Adds columns/tables introduced by the Portal schema extension that
// prisma db push may not apply reliably through a pooler connection.
async function ensurePortalSchema() {
  const statements = [
    // New nullable columns on Client (@@map("Client") = WorkspaceClient model)
    `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "website" TEXT`,
    `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "addressLine1" TEXT`,
    `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "addressLine2" TEXT`,
    `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "city" TEXT`,
    `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "postcode" TEXT`,
    `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "country" TEXT`,
    `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "notes" TEXT`,
    `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "primaryContactName" TEXT`,
    `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "primaryContactEmail" TEXT`,
    `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "primaryContactPhone" TEXT`,
    `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "googleDriveFolderUrl" TEXT`,
    // New FK on Document → Client
    `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "clientId" TEXT`,
    // New FK on SupportClient → Client
    `ALTER TABLE "SupportClient" ADD COLUMN IF NOT EXISTS "workspaceClientId" TEXT`,
    // Workspace: Slack channels + branding (multi-channel Slack + Sprint 1)
    `ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "slackChannels" JSONB`,
    `ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "branding" JSONB`,
    // Document: share token, sharing flag, document number (Sprint 1)
    `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "shareToken" TEXT`,
    `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "isShared" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "documentNumber" TEXT`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Document_shareToken_key" ON "Document"("shareToken")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Document_documentNumber_key" ON "Document"("documentNumber")`,
    `CREATE INDEX IF NOT EXISTS "Document_shareToken_idx" ON "Document"("shareToken")`,
    // DocumentCounter table (Sprint 1 — atomic numbering)
    `CREATE TABLE IF NOT EXISTS "DocumentCounter" (
      "id" TEXT NOT NULL,
      "workspaceId" TEXT NOT NULL,
      "docType" TEXT NOT NULL,
      "year" INTEGER NOT NULL,
      "lastNumber" INTEGER NOT NULL DEFAULT 0,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "DocumentCounter_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "DocumentCounter_workspaceId_docType_year_key" UNIQUE ("workspaceId", "docType", "year")
    )`,
    `CREATE INDEX IF NOT EXISTS "DocumentCounter_workspaceId_idx" ON "DocumentCounter"("workspaceId")`,
    // ClientPlatform table
    `CREATE TABLE IF NOT EXISTS "ClientPlatform" (
      "id" TEXT NOT NULL,
      "clientId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "platformType" TEXT,
      "url" TEXT,
      "stagingUrl" TEXT,
      "repoUrl" TEXT,
      "credentials" TEXT,
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ClientPlatform_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "ClientPlatform_clientId_idx" ON "ClientPlatform"("clientId")`,
  ];

  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch {
      // Column/table already exists or non-critical — continue
    }
  }

  // FK constraints — use DO blocks to guard with IF NOT EXISTS check
  const fkStatements = [
    `DO $migration$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ClientPlatform_clientId_fkey') THEN
         ALTER TABLE "ClientPlatform" ADD CONSTRAINT "ClientPlatform_clientId_fkey"
           FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       END IF;
     END $migration$`,
    `DO $migration$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Document_clientId_fkey') THEN
         ALTER TABLE "Document" ADD CONSTRAINT "Document_clientId_fkey"
           FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
       END IF;
     END $migration$`,
    `DO $migration$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SupportClient_workspaceClientId_fkey') THEN
         ALTER TABLE "SupportClient" ADD CONSTRAINT "SupportClient_workspaceClientId_fkey"
           FOREIGN KEY ("workspaceClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
       END IF;
     END $migration$`,
  ];

  for (const sql of fkStatements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch {
      // FK already exists — continue
    }
  }
}

export async function ensureBaseRecords() {
  await ensurePortalSchema();

  const user = await prisma.user.upsert({
    where: {
      email: DEFAULT_USER_EMAIL,
    },
    update: {},
    create: {
      email: DEFAULT_USER_EMAIL,
      name: "Foundry Owner",
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: {
      slug: DEFAULT_WORKSPACE_SLUG,
    },
    update: {},
    create: {
      slug: DEFAULT_WORKSPACE_SLUG,
      name: "Foundry by Gitwork",
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: "ADMIN",
      permissions: [],
    },
  });

  // Create the initial admin account from env vars on first run
  await ensureInitialAdmin(workspace.id);

  const template = await prisma.documentTemplate.upsert({
    where: {
      slug: DEFAULT_TEMPLATE_SLUG,
    },
    update: {
      sections: getDefaultProposalSections() as unknown as Prisma.InputJsonValue,
      metadata: DEFAULT_PROPOSAL_METADATA as unknown as Prisma.InputJsonValue,
      isDefault: true,
    },
    create: {
      workspaceId: workspace.id,
      slug: DEFAULT_TEMPLATE_SLUG,
      name: "Foundry Proposal Template",
      description: "Default structured proposal template for Foundry by Gitwork.",
      documentType: DocumentType.PROPOSAL,
      sections: getDefaultProposalSections() as unknown as Prisma.InputJsonValue,
      metadata: DEFAULT_PROPOSAL_METADATA as unknown as Prisma.InputJsonValue,
      isDefault: true,
    },
  });

  // Seed SLA and SOW default templates (Sprint 3). Each is keyed by slug so the upsert is
  // idempotent on subsequent boots, and `update` refreshes the sections if we evolve the
  // blueprints in the codebase.
  for (const type of [DocumentType.SLA, DocumentType.SOW] as const) {
    const blueprints = getTemplateBlueprintsForType(type);
    const slug = TEMPLATE_SLUG_BY_TYPE[type];
    const name = TEMPLATE_NAME_BY_TYPE[type];
    const sections = blueprints.map((blueprint, index) => ({
      key: blueprint.key,
      title: blueprint.title,
      description: blueprint.description,
      sortOrder: index,
      isVisible: blueprint.visible ?? true,
      data: blueprint.data,
    }));
    await prisma.documentTemplate.upsert({
      where: { slug },
      update: {
        sections: sections as unknown as Prisma.InputJsonValue,
        isDefault: true,
      },
      create: {
        workspaceId: workspace.id,
        slug,
        name,
        description: `Default ${name.replace(" — default", "")} template for Foundry by Gitwork.`,
        documentType: type,
        sections: sections as unknown as Prisma.InputJsonValue,
        isDefault: true,
      },
    });
  }

  await prisma.rateCardPerson.createMany({
    data: getDefaultRateCardPeoplePayload(workspace.id),
    skipDuplicates: true,
  });

  await ensureSampleProposal({ workspace, user, template });
  await ensureSampleCodeClearCandidates({ workspace });

  return {
    user,
    workspace,
    template,
  };
}

/**
 * Versioned seed identifier — bump when the demo blueprint changes so existing workspaces
 * get the new demo replacing their old one. Seed proposals tagged with an older version are
 * deleted on next boot.
 */
const SAMPLE_PROPOSAL_SEED_VERSION = "2026-06-blocks-v1";

async function ensureSampleProposal({
  workspace,
  user,
  template,
}: {
  workspace: { id: string };
  user: { id: string; name: string | null };
  template: { id: string };
}) {
  // Look for an existing seed. If it's the current version, leave it alone. If it's an older
  // version (or has no version stamp), delete it so we can replace with the fresh demo.
  const existing = await prisma.document.findFirst({
    where: { workspaceId: workspace.id, documentType: "PROPOSAL" },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    const metadata = (existing.metadata as { seedVersion?: string } | null) ?? {};
    if (metadata.seedVersion === SAMPLE_PROPOSAL_SEED_VERSION) {
      return; // Already up-to-date
    }
    // Only remove seed-tagged or untitled demo docs — never touch real customer proposals.
    if (metadata.seedVersion || existing.title.toLowerCase().includes("sample")) {
      await prisma.document.delete({ where: { id: existing.id } });
    } else {
      return; // Real proposal exists; don't intrude
    }
  }

  // Build the demo using the registry's defaultData so it stays in sync with whatever the
  // blocks currently support. We compose a realistic Foundry → Acme proposal that walks
  // through every major block category.
  const id = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);

  const demoSections: Array<{
    key: string;
    title: string;
    description: string;
    sortOrder: number;
    isVisible: boolean;
    data: Prisma.InputJsonValue;
  }> = [
    {
      key: "cover",
      title: "Cover",
      description: "Front page and confidentiality metadata.",
      sortOrder: 0,
      isVisible: true,
      data: {
        proposalTitle: "Foundry by Gitwork — Sample Proposal",
        productName: "Foundry",
        clientName: "Acme Health",
        subtitle: "v1.0",
        date: new Date().toISOString().slice(0, 10),
        confidentiality: "Confidential — For Acme Health stakeholder review only.",
        confidentialityMode: "INTERNAL",
        heroImage: "",
        brandLockup: "CLIENT_X_GITWORK",
      } as Prisma.InputJsonValue,
    },
    {
      key: "prose",
      title: "Executive summary",
      description: "Two-paragraph framing of the engagement.",
      sortOrder: 1,
      isVisible: true,
      data: {
        content:
          "Acme Health asked Gitwork to take their existing patient onboarding flow from a Figma prototype to a production-ready web app. We're proposing a 12-week engagement across discovery, design, build, and launch — anchored by a small dedicated Gitwork team and a clear weekly cadence with your product owner.\n\n" +
          "This proposal sets out the scope, deliverables, timeline, and commercial structure. Where decisions are still pending we've left placeholders tagged [REVIEW] — please flag anything that needs adjusting before sign-off.",
      } as Prisma.InputJsonValue,
    },
    {
      key: "heading",
      title: "Engagement shape",
      description: "Visual divider.",
      sortOrder: 2,
      isVisible: true,
      data: { level: "h2", text: "Engagement shape", eyebrow: "PART 01" } as Prisma.InputJsonValue,
    },
    {
      key: "objectives",
      title: "Objectives",
      description: "What this engagement needs to achieve.",
      sortOrder: 3,
      isVisible: true,
      data: {
        items: [
          {
            id: id(),
            title: "Ship a production-grade patient onboarding flow",
            description:
              "Take the existing Figma into a deployed Next.js + Postgres app that passes Acme's accessibility and security review.",
            icon: "rocket",
          },
          {
            id: id(),
            title: "Reduce time-to-first-appointment by 40%",
            description:
              "Streamline the patient journey from sign-up to confirmed appointment so the average drops from 14 days to under 8.",
            icon: "trending-up",
          },
          {
            id: id(),
            title: "Hand over a maintainable codebase",
            description:
              "End the engagement with documentation, test coverage, and an internal-team walkthrough so Acme can iterate independently.",
            icon: "code",
          },
        ],
      } as Prisma.InputJsonValue,
    },
    {
      key: "touchpoints",
      title: "Touchpoints",
      description: "Features or deliverables grouped by area.",
      sortOrder: 4,
      isVisible: true,
      data: {
        items: [
          {
            id: id(),
            title: "Patient sign-up",
            summary: "Mobile-first onboarding flow with progressive disclosure of health questions.",
            features: ["3-step wizard", "Form autosave", "Country-aware ID capture", "Accessibility AA"],
            notes: "Built on react-hook-form + Zod validators.",
            callout: "",
          },
          {
            id: id(),
            title: "Clinician dashboard",
            summary: "Triage queue with at-a-glance patient status, search, and case-history detail.",
            features: ["Realtime queue", "Saved filters", "Inline notes", "Audit trail"],
            notes: "",
            callout: "",
          },
          {
            id: id(),
            title: "Appointment booking",
            summary: "Live calendar with timezone-aware slot picker integrated to the clinician calendars.",
            features: ["Conflict detection", "Reminder emails", "Reschedule self-serve"],
            notes: "",
            callout: "Hands-off rebooking saves clinic staff ~6 hours/week per location.",
          },
        ],
      } as Prisma.InputJsonValue,
    },
    {
      key: "callout",
      title: "Tech-stack note",
      description: "A highlighted note.",
      sortOrder: 5,
      isVisible: true,
      data: {
        tone: "info",
        headline: "Why we recommend Next.js + Postgres + Vercel",
        body:
          "Acme's current stack (React Native + Firebase) is a fine prototype platform but adds friction for the team's planned web-first rollout. The proposed stack is closer to what your in-house engineers already know and removes the Firebase lock-in.",
      } as Prisma.InputJsonValue,
    },
    {
      key: "heading",
      title: "Plan",
      description: "Section heading.",
      sortOrder: 6,
      isVisible: true,
      data: { level: "h2", text: "Plan & schedule", eyebrow: "PART 02" } as Prisma.InputJsonValue,
    },
    {
      key: "timeline",
      title: "Timeline",
      description: "Project phases, durations, and target milestones.",
      sortOrder: 7,
      isVisible: true,
      data: { viewMode: "MILESTONE" } as Prisma.InputJsonValue,
    },
    {
      key: "costing",
      title: "Costing",
      description: "Budget, payment schedule, and commercial notes.",
      sortOrder: 8,
      isVisible: true,
      data: {
        currency: "GBP",
        discount: 0,
        taxRate: 20,
        monthlyCostSummary: "£24,000 / month for a 2-person Gitwork team across 12 weeks.",
        durationSummary: "12 weeks",
        totalCostLabel: "Total fees",
        supportingNarrative:
          "Two Gitwork engineers full-time for 12 weeks, plus part-time design and project management. Fixed scope, fixed price.",
        paymentScheduleIntro: "Invoiced in three milestones with Net 30 terms.",
        paymentTerms: "Net 30 from invoice date",
        vatNotice: "All amounts exclusive of VAT, added at prevailing rate where applicable.",
        ipTransferNotice:
          "Intellectual property created under this engagement transfers to Acme on full payment of all fees due.",
        teamAllocations: [],
        paymentSchedule: [
          {
            id: id(),
            action: "On signature",
            periodCovered: "On execution of this proposal",
            paymentPercent: 30,
            includedWork: "Mobilisation, kick-off, discovery week 1",
            amount: 21600,
          },
          {
            id: id(),
            action: "On Phase 2 acceptance",
            periodCovered: "Week 7",
            paymentPercent: 40,
            includedWork: "Sign-up + clinician dashboard delivered to staging",
            amount: 28800,
          },
          {
            id: id(),
            action: "On launch",
            periodCovered: "Week 12",
            paymentPercent: 30,
            includedWork: "Booking flow live, full handover complete",
            amount: 21600,
          },
        ],
        additionalNotes: [],
      } as Prisma.InputJsonValue,
    },
    {
      key: "assumptions",
      title: "Assumptions",
      description: "Working assumptions about scope, dependencies, and constraints.",
      sortOrder: 9,
      isVisible: true,
      data: {
        items: [
          "Acme's product team is available for a 30-minute sync at least twice per week.",
          "Existing Figma is final — additional design iterations are out of scope unless agreed via change order.",
          "Acme provides access to staging Firebase environment for data migration testing.",
          "Production launch happens during a low-traffic window agreed at least 2 weeks in advance.",
        ],
      } as Prisma.InputJsonValue,
    },
    {
      key: "out_of_scope",
      title: "Out of scope",
      description: "Items expressly excluded.",
      sortOrder: 10,
      isVisible: true,
      data: {
        items: [
          "Native iOS / Android apps — web responsive only in this engagement.",
          "Migration of historical patient records older than 24 months.",
          "Custom analytics dashboards beyond GA4 + posthog standard reports.",
          "Ongoing support after launch — covered separately by an SLA.",
        ],
      } as Prisma.InputJsonValue,
    },
    {
      key: "divider",
      title: "Divider",
      description: "Page break.",
      sortOrder: 11,
      isVisible: true,
      data: { variant: "page-break", spacing: 24 } as Prisma.InputJsonValue,
    },
    {
      key: "cta_next_steps",
      title: "Next steps",
      description: "Closing call to action.",
      sortOrder: 12,
      isVisible: true,
      data: {
        headline: "Ready to move on this?",
        body:
          "Sign below to kick off discovery on the agreed start date. If anything in this proposal needs adjusting, just reply with your feedback and we'll turn around a v2 within 48 hours.",
      } as Prisma.InputJsonValue,
    },
    {
      key: "signoff_footer",
      title: "Signoff",
      description: "Prepared-by line and signature placeholders.",
      sortOrder: 13,
      isVisible: true,
      data: {
        preparedBy: user.name ?? "Dan Lindsay",
        team: "Gitwork",
        contactDetails: "hello@gitwork.io",
        footerNote:
          "This proposal is valid for 30 days from the date above. Get in touch if you need an extension.",
        showBrandingBlock: true,
        signatureName: "",
        signatureDate: "",
      } as Prisma.InputJsonValue,
    },
  ];

  await prisma.document.create({
    data: {
      workspaceId: workspace.id,
      ownerId: user.id,
      templateId: template.id,
      documentType: "PROPOSAL",
      status: "DRAFT",
      title: "Foundry by Gitwork — Sample Proposal",
      productName: "Foundry",
      clientName: "Acme Health",
      summary: "",
      version: "v1.0",
      metadata: {
        ...DEFAULT_PROPOSAL_METADATA,
        client: "Acme Health",
        owner: user.name ?? DEFAULT_PROPOSAL_METADATA.owner,
        seedVersion: SAMPLE_PROPOSAL_SEED_VERSION,
      } as unknown as Prisma.InputJsonValue,
      sections: { create: demoSections },
      costLineItems: { create: getDefaultCostsPayload() },
      timelinePhases: { create: getDefaultTimelinePayload() },
      links: { create: getDefaultLinkPayload() },
      ctas: { create: getDefaultCtaPayload() },
      assets: { create: getDefaultAssetPayload() },
    },
  });
}

async function ensureSampleCodeClearCandidates({
  workspace,
}: {
  workspace: { id: string };
}) {
  const rateCardPeople = await prisma.rateCardPerson.findMany({
    where: {
      workspaceId: workspace.id,
    },
    select: {
      id: true,
      seedIdentifier: true,
      name: true,
      area: true,
    },
  });

  const candidates = getDefaultCodeClearCandidatePayloads(workspace.id, rateCardPeople);
  const existingHandles = new Set(
    (
      await prisma.candidate.findMany({
        where: {
          workspaceId: workspace.id,
          githubHandle: {
            in: candidates.map((candidate) => candidate.githubHandle),
          },
        },
        select: {
          githubHandle: true,
        },
      })
    ).map((candidate) => candidate.githubHandle),
  );

  for (const candidate of candidates) {
    if (existingHandles.has(candidate.githubHandle)) {
      continue;
    }

    await prisma.candidate.create({
      data: candidate,
    });
  }
}

// Creates (or patches) the admin user from INITIAL_ADMIN_EMAIL + INITIAL_ADMIN_PASSWORD.
// Runs on every bootstrap call — idempotent. If the user exists but has no passwordHash
// (e.g. created as a placeholder before auth was added), the hash is set from env vars.
export async function ensureInitialAdmin(workspaceId?: string) {
  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!email || !password) return;

  // Resolve workspaceId if not provided
  let wsId = workspaceId;
  if (!wsId) {
    const ws = await prisma.workspace.findFirst({ where: { slug: DEFAULT_WORKSPACE_SLUG } });
    if (!ws) return;
    wsId = ws.id;
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Patch passwordHash if it was never set
    if (!existing.passwordHash) {
      const passwordHash = await bcrypt.hash(password, 12);
      await prisma.user.update({ where: { email }, data: { passwordHash } });
    }
    // Ensure membership exists
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: wsId, userId: existing.id } },
      update: {},
      create: { workspaceId: wsId, userId: existing.id, role: "ADMIN", permissions: [] },
    });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.create({
    data: { email, name: email.split("@")[0], passwordHash },
  });

  await prisma.workspaceMember.create({
    data: { workspaceId: wsId, userId: admin.id, role: "ADMIN", permissions: [] },
  });
}
