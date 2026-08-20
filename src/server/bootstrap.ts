import { DocumentType, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_PROPOSAL_METADATA, getDefaultProposalSections } from "@/lib/default-template";
import { GITWORK } from "@/lib/gitwork";
import {
  TEMPLATE_DESCRIPTION_BY_TYPE,
  TEMPLATE_NAME_BY_TYPE,
  TEMPLATE_SLUG_BY_TYPE,
  getTemplateBlueprintsForType,
} from "@/lib/templates";
import { EXTRA_TEMPLATES } from "@/lib/templates/dev-templates";
import {
  DEFAULT_ONBOARDING_FORM_SLUG,
  QUICK_ONBOARDING_FORM_SLUG,
  ENTERPRISE_ONBOARDING_FORM_SLUG,
  getDefaultOnboardingForm,
  getQuickOnboardingForm,
  getEnterpriseOnboardingForm,
} from "@/lib/onboarding/default-form";
import {
  DEFAULT_LAUNCHPAD_TEMPLATE_NAME,
  DEFAULT_LAUNCHPAD_TEMPLATE_SLUG,
  getDefaultLaunchpadStructure,
} from "@/lib/launchpad/default-template";
import { prisma } from "@/lib/prisma";
import { buildDefaultConfigRow } from "@/server/devsignal/config";
import { seedChallenges } from "@/server/devsignal/challenge-store";
import { seedNotice } from "@/server/devsignal/notice-store";
import {
  DEFAULT_TEMPLATE_SLUG,
  DEFAULT_USER_EMAIL,
  DEFAULT_WORKSPACE_SLUG,
  getDefaultAssetPayload,
  getDefaultCostsPayload,
  getDefaultCtaPayload,
  getDefaultLinkPayload,
  getDefaultTimelinePayload,
} from "@/server/proposals";
import { getDefaultRateCardPeoplePayload } from "@/server/rate-card";
import { getDefaultCodeClearCandidatePayloads } from "@/server/codeclear";
import { migratePermissionModel } from "@/server/permissions";
import { seedBuiltInStarters } from "@/server/starters-catalog";
import { seedStarterAdditions } from "@/server/starters-additions-seed";
import { seedDesignSystemStarters } from "@/server/design-starters-seed";
import { seedMasterPromptStarter } from "@/server/master-prompt-starter";
import { seedHandbookArticles } from "@/server/handbook-catalog";
import { seedGolfClubs } from "@/server/golf-clubs";
import { isSeedAccountEmail } from "@/server/seed-accounts";
import { resolveGeoForIp } from "@/server/ip-geo";

// Adds columns/tables introduced by the Portal schema extension that
// prisma db push may not apply reliably through a pooler connection.
async function ensurePortalSchema() {
  const statements = [
    // Private avatar blob column (base64 image moved off avatarUrl — see
    // backfillAvatarBlobs). Ensured here in case db push hasn't applied it yet.
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarImage" TEXT`,
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
    // Roles & Permissions — the role matrix + per-member override delta
    `ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "rolePermissions" JSONB`,
    `ALTER TABLE "WorkspaceMember" ADD COLUMN IF NOT EXISTS "permissionOverrides" JSONB NOT NULL DEFAULT '{}'`,
    // Read-only provider Admin keys for the Super-Admin AI Spend card
    `ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "anthropicAdminApiKey" TEXT`,
    `ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "openaiAdminApiKey" TEXT`,
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
      "usernameCipher" TEXT,
      "passwordCipher" TEXT,
      "notes" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ClientPlatform_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "ClientPlatform_clientId_idx" ON "ClientPlatform"("clientId")`,
    // Encrypted credential columns for ClientPlatform (additive for already-existing tables)
    `ALTER TABLE "ClientPlatform" ADD COLUMN IF NOT EXISTS "usernameCipher" TEXT`,
    `ALTER TABLE "ClientPlatform" ADD COLUMN IF NOT EXISTS "passwordCipher" TEXT`,
    // ClientPlatformLogin — multiple credential sets per platform (encrypted)
    `CREATE TABLE IF NOT EXISTS "ClientPlatformLogin" (
      "id" TEXT NOT NULL,
      "platformId" TEXT NOT NULL,
      "label" TEXT,
      "usernameCipher" TEXT,
      "passwordCipher" TEXT,
      "orderKey" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ClientPlatformLogin_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "ClientPlatformLogin_platformId_idx" ON "ClientPlatformLogin"("platformId")`,
    // Wave 3 — Push notifications
    // PulseScan: track who triggered the scan so we can target push notifications
    `ALTER TABLE "PulseScan" ADD COLUMN IF NOT EXISTS "triggeredByUserId" TEXT`,
    `CREATE INDEX IF NOT EXISTS "PulseScan_triggeredByUserId_idx" ON "PulseScan"("triggeredByUserId")`,
    // pgvector — semantic search for Care conversations
    `CREATE EXTENSION IF NOT EXISTS vector`,
    `ALTER TABLE "SupportConversation" ADD COLUMN IF NOT EXISTS embedding vector(1536)`,
    `CREATE INDEX IF NOT EXISTS "SupportConversation_embedding_hnsw" ON "SupportConversation" USING hnsw (embedding vector_cosine_ops)`,
    // DeviceToken table — one row per (user, APNs device)
    `CREATE TABLE IF NOT EXISTS "DeviceToken" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "platform" TEXT NOT NULL,
      "environment" TEXT NOT NULL,
      "appBuild" TEXT,
      "appVersion" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "failedAt" TIMESTAMP(3),
      CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "DeviceToken_token_key" ON "DeviceToken"("token")`,
    `CREATE INDEX IF NOT EXISTS "DeviceToken_userId_environment_idx" ON "DeviceToken"("userId", "environment")`,
    `CREATE INDEX IF NOT EXISTS "DeviceToken_token_idx" ON "DeviceToken"("token")`,
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
    // Wave 3 — Push notification FKs
    `DO $migration$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeviceToken_userId_fkey') THEN
         ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey"
           FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
       END IF;
     END $migration$`,
    `DO $migration$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PulseScan_triggeredByUserId_fkey') THEN
         ALTER TABLE "PulseScan" ADD CONSTRAINT "PulseScan_triggeredByUserId_fkey"
           FOREIGN KEY ("triggeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
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

type BaseRecords = Awaited<ReturnType<typeof _ensureBaseRecords>>;
let baseRecordsCache: BaseRecords | null = null;

export async function ensureBaseRecords(): Promise<BaseRecords> {
  if (baseRecordsCache) return baseRecordsCache;
  baseRecordsCache = await _ensureBaseRecords();
  return baseRecordsCache;
}

async function _ensureBaseRecords() {
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

  // Roles & Permissions — seed the role matrix and bring existing members onto the
  // matrix model without changing anyone's effective access (idempotent).
  await migratePermissionModel(workspace.id);

  const template = await prisma.documentTemplate.upsert({
    where: {
      slug: DEFAULT_TEMPLATE_SLUG,
    },
    update: {
      name: TEMPLATE_NAME_BY_TYPE.PROPOSAL,
      description: TEMPLATE_DESCRIPTION_BY_TYPE.PROPOSAL,
      sections: getDefaultProposalSections() as unknown as Prisma.InputJsonValue,
      metadata: DEFAULT_PROPOSAL_METADATA as unknown as Prisma.InputJsonValue,
      isDefault: true,
    },
    create: {
      workspaceId: workspace.id,
      slug: DEFAULT_TEMPLATE_SLUG,
      name: TEMPLATE_NAME_BY_TYPE.PROPOSAL,
      description: TEMPLATE_DESCRIPTION_BY_TYPE.PROPOSAL,
      documentType: DocumentType.PROPOSAL,
      sections: getDefaultProposalSections() as unknown as Prisma.InputJsonValue,
      metadata: DEFAULT_PROPOSAL_METADATA as unknown as Prisma.InputJsonValue,
      isDefault: true,
    },
  });

  // Seed every contract-type default template — SLA / SOW (Sprint 3), MSA / NDA / CO / DSA
  // (Sprint 8 agency library). Each is keyed by slug so the upsert is idempotent on subsequent
  // boots, and `update` refreshes the sections if we evolve the blueprints in the codebase.
  for (const type of [
    DocumentType.SLA,
    DocumentType.SOW,
    DocumentType.MSA,
    DocumentType.NDA,
    DocumentType.CO,
    DocumentType.DSA,
    // Lightweight everyday docs — no costing/timeline/sign-off.
    DocumentType.HANDOVER,
    DocumentType.REPORT,
    DocumentType.BRIEF,
    DocumentType.OTHER,
  ] as const) {
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
        // Refresh name + description on re-boot so existing rows drop the old "Foundry" copy.
        name,
        description: TEMPLATE_DESCRIPTION_BY_TYPE[type],
        sections: sections as unknown as Prisma.InputJsonValue,
        isDefault: true,
      },
      create: {
        workspaceId: workspace.id,
        slug,
        name,
        description: TEMPLATE_DESCRIPTION_BY_TYPE[type],
        documentType: type,
        sections: sections as unknown as Prisma.InputJsonValue,
        isDefault: true,
      },
    });
  }

  // Extra ready-to-use engineering templates (release/incident/sprint reports, technical handover,
  // ADR). Seeded as additional, NON-default rows keyed by slug so they show as options in the
  // create gallery. `update` refreshes their content on re-boot when the blueprints evolve.
  for (const tpl of EXTRA_TEMPLATES) {
    const sections = tpl.sections.map((blueprint, index) => ({
      key: blueprint.key,
      title: blueprint.title,
      description: blueprint.description,
      sortOrder: index,
      isVisible: blueprint.visible ?? true,
      data: blueprint.data,
    }));
    await prisma.documentTemplate.upsert({
      where: { slug: tpl.slug },
      update: {
        name: tpl.name,
        description: tpl.description,
        sections: sections as unknown as Prisma.InputJsonValue,
        isDefault: false,
      },
      create: {
        workspaceId: workspace.id,
        slug: tpl.slug,
        name: tpl.name,
        description: tpl.description,
        documentType: tpl.documentType,
        sections: sections as unknown as Prisma.InputJsonValue,
        isDefault: false,
      },
    });
  }

  // Seed the default onboarding form (the customisable replacement for the old
  // hard-coded flow). Unlike the Docs templates above, we DON'T clobber `steps` on
  // re-boot — operators edit forms via Settings → Onboarding and those edits must
  // persist. The empty `update` just ensures the row exists.
  await prisma.onboardingForm.upsert({
    where: { slug: DEFAULT_ONBOARDING_FORM_SLUG },
    update: {},
    create: {
      workspaceId: workspace.id,
      slug: DEFAULT_ONBOARDING_FORM_SLUG,
      name: "Standard onboarding",
      description: "The default Gitwork client onboarding form.",
      steps: getDefaultOnboardingForm() as unknown as Prisma.InputJsonValue,
      isDefault: true,
    },
  });

  // Two extra starter forms operators can pick when minting a link (or duplicate +
  // tweak). Like the default, `update: {}` so in-app edits aren't clobbered on re-boot.
  await prisma.onboardingForm.upsert({
    where: { slug: QUICK_ONBOARDING_FORM_SLUG },
    update: {},
    create: {
      workspaceId: workspace.id,
      slug: QUICK_ONBOARDING_FORM_SLUG,
      name: "Quick start",
      description: "Lightweight intro form for small or fast-moving engagements.",
      steps: getQuickOnboardingForm() as unknown as Prisma.InputJsonValue,
      isDefault: false,
    },
  });
  await prisma.onboardingForm.upsert({
    where: { slug: ENTERPRISE_ONBOARDING_FORM_SLUG },
    update: {},
    create: {
      workspaceId: workspace.id,
      slug: ENTERPRISE_ONBOARDING_FORM_SLUG,
      name: "Enterprise",
      description: "Thorough form with procurement, security & compliance, and stakeholder capture.",
      steps: getEnterpriseOnboardingForm() as unknown as Prisma.InputJsonValue,
      isDefault: false,
    },
  });

  // The default Launchpad template — the tracked requirements + legal drafts we ask
  // a client for. Same discipline as the onboarding forms above: `update: {}` so
  // operator edits in Settings → Launchpad survive a re-boot, and the empty update
  // only guarantees the row exists.
  await prisma.launchpadTemplate.upsert({
    where: { slug: DEFAULT_LAUNCHPAD_TEMPLATE_SLUG },
    update: {},
    create: {
      workspaceId: workspace.id,
      slug: DEFAULT_LAUNCHPAD_TEMPLATE_SLUG,
      name: DEFAULT_LAUNCHPAD_TEMPLATE_NAME,
      description:
        "Everything we need from a client to start and ship — foundations, website, payments, iOS, Android and compliance.",
      structure: getDefaultLaunchpadStructure() as unknown as Prisma.InputJsonValue,
      isDefault: true,
    },
  });

  // DevSignal default pipeline config. `update: {}` so in-app weight edits
  // aren't clobbered on re-boot (same discipline as the onboarding forms).
  {
    const devSignalDefault = buildDefaultConfigRow();
    await prisma.devSignalPipelineConfig.upsert({
      where: {
        workspaceId_name_version: {
          workspaceId: workspace.id,
          name: devSignalDefault.name,
          version: devSignalDefault.version,
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        name: devSignalDefault.name,
        version: devSignalDefault.version,
        isDefault: true,
        enabledStages: devSignalDefault.enabledStages,
        stageOrder: devSignalDefault.stageOrder,
        stageWeights: devSignalDefault.stageWeights as Prisma.InputJsonValue,
        blockingRules: devSignalDefault.blockingRules as Prisma.InputJsonValue,
        publishedAt: new Date(),
      },
    });

    // Seed the DevSignal coding-challenge bank from the in-code catalog.
    // Upsert with `update: {}` so UI edits to seeded challenges survive re-boot.
    await seedChallenges(workspace.id);
    // Seed the editable consent/processing notice (same discipline).
    await seedNotice(workspace.id);
  }

  await prisma.rateCardPerson.createMany({
    data: getDefaultRateCardPeoplePayload(workspace.id),
    skipDuplicates: true,
  });

  // Seed the built-in Starters library (Prompt→Production building blocks) so it's populated
  // with no manual "load" step. Idempotent upsert by slug — see seedBuiltInStarters.
  await seedBuiltInStarters(workspace.id);
  // Net-new Prompt starters added after a gap analysis pass — see starters-additions-seed.ts.
  await seedStarterAdditions(workspace.id);
  // iOS design-system Starters (one per app, reverse-engineered from awesome-ios-design-md).
  // See design-starters-seed.ts.
  await seedDesignSystemStarters(workspace.id);
  // The editable, versioned master build-prompt template — workspace-owned + create-only.
  await seedMasterPromptStarter(workspace.id);

  // Seed / refresh the built-in Handbook (developer standards, languages, how we operate) —
  // version-gated so improved content ships on deploy without clobbering members' edits.
  await seedHandbookArticles(workspace.id);

  // Seed the canonical golf equipment (clubs) dataset — the Equipment domain of
  // the Gitwork Golf Data platform, served to devs via /api/golf/clubs.
  // Idempotent: skips once populated (extend via the SEED_CLUBS catalogue).
  await seedGolfClubs(workspace.id);

  await ensureSampleProposal({ workspace, user, template });
  await ensureSampleCodeClearCandidates({ workspace });
  await ensureFellasLoadedReport();

  await backfillUiDoneLabel(workspace.id);
  await backfillAvatarBlobs();
  await backfillNotificationGeo();

  return {
    user,
    workspace,
    template,
  };
}

// One-time, idempotent migration (July 2026): move any base64 `data:` avatar out
// of User.avatarUrl into the private User.avatarImage column, and replace
// avatarUrl with the short served path (/api/avatars/{id}). Historically the
// account editor stored ~8MB data URLs directly in avatarUrl, which got inlined
// per-row into every list that embeds an avatar (task board, portal, standup…) —
// a single board response reached 156MB. After this runs, no avatarUrl is a blob,
// so those payloads carry a ~30-char URL instead. The WHERE clause makes it a
// no-op once migrated. Runs once per container via the ensureBaseRecords cache.
async function backfillAvatarBlobs() {
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "User"
         SET "avatarImage" = "avatarUrl",
             "avatarUrl" = '/api/avatars/' || "id"
       WHERE "avatarUrl" LIKE 'data:%'
         AND "avatarImage" IS NULL`,
    );
  } catch {
    // Non-critical — never block boot on a backfill.
  }
}

// One-time, idempotent backfill (July 2026): existing doc-open notifications
// have a raw IP baked into their stored `body` ("Opened from 154.192.49.228")
// because geo broke when we moved off Vercel (see src/server/ip-geo.ts). New
// notifications now carry a location, but historical rows keep the IP forever
// unless rewritten. Resolve each DISTINCT ip once (the resolver caches, so a
// repeated visitor costs one lookup) and rewrite to "Opened from Lahore, PK";
// if geo can't be resolved, drop the line rather than leave an IP on display.
// Bounded + fail-soft so it can never slow or break boot; after it runs the
// pattern no longer matches, so later boots are a single cheap query.
async function backfillNotificationGeo() {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ body: string }>>(
      `SELECT DISTINCT "body" FROM "Notification"
        WHERE "body" ~ '^Opened from [0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$'
        LIMIT 50`,
    );
    for (const row of rows) {
      const ip = row.body.replace("Opened from ", "").trim();
      const geo = await resolveGeoForIp(ip);
      const where = geo.city && geo.country ? `${geo.city}, ${geo.country}` : geo.country ?? null;
      await prisma.notification.updateMany({
        where: { body: row.body },
        data: { body: where ? `Opened from ${where}` : null },
      });
    }
  } catch {
    // Non-critical — never block boot on a backfill.
  }
}

// One-time, idempotent backfill (July 2026): the "UI Done" task status/column
// was retired. Two steps, in order:
//   1. Preserve the signal that those tasks were UI work — tag any that don't
//      yet carry a label with the UI/UX label. Scoped to `label: null` so an
//      existing label (BACKEND/FRONTEND/…) is never clobbered.
//   2. Fully retire the old value in the data — move every remaining UI_DONE
//      row to IN_REVIEW (its nearest surviving column). Must run AFTER step 1,
//      which keys off status = UI_DONE.
// Runs once per container via the ensureBaseRecords cache; after the first run
// both filters match nothing, so it's a no-op on later boots. The DB enum value
// UI_DONE is kept (dropping it is a data-losing migration) but is now unused.
// taskRowToDTO still coalesces UI_DONE → IN_REVIEW defensively for any row that
// predates this backfill running.
async function backfillUiDoneLabel(workspaceId: string) {
  try {
    await prisma.task.updateMany({
      where: { workspaceId, status: "UI_DONE", label: null },
      data: { label: "UI_UX" },
    });
    await prisma.task.updateMany({
      where: { workspaceId, status: "UI_DONE" },
      data: { status: "IN_REVIEW" },
    });
  } catch {
    // Non-critical — never block boot on a backfill.
  }
}

const FELLAS_MAY_2026_PAYLOAD = {
  author: "Dan Lindsay",
  periodStart: "2026-05-01",
  periodEnd: "2026-05-31",
  overviewText:
    "May 2026 saw the Fellas Loaded support desk handle 35 customer support tickets, the majority of which were cancellation and subscription-related enquiries. Cancellations accounted for the largest volume of activity this month, consistent with patterns from previous periods. The team maintained strong response times throughout, with most tickets addressed within 24 hours. A technical issue relating to Firestick device compatibility was reported by a customer and resolved the following business day following internal escalation.",
  totalTickets: 35,
  catCancellations: 28,
  catAccountQueries: 3,
  catRefunds: 28,
  catTechIssues: 2,
  catOther: 4,
  prioUrgent: 0,
  prioHigh: 0,
  prioMedium: 0,
  prioLow: 0,
  performanceText:
    "The majority of support tickets were responded to within 24 hours, in line with our agreed service standards. A Firestick compatibility issue was raised and required overnight escalation before a full resolution was communicated to the customer the following day — an acceptable turnaround given the technical complexity. No significant backlog was recorded during May.",
  refundRequests: 28,
  refundsProcessed: 28,
  refundTotalValue: 0,
  refundNotes: "",
  usageTotalUsers: 0,
  usageVerifiedUsers: 0,
  usageActiveSubscriptions: 0,
  usageSubIosMonthly: 0,
  usageSubIosYearly: 0,
  usageSubAndroidMonthly: 0,
  usageSubAndroidYearly: 0,
  usageSubStripeMonthly: 0,
  usageSubStripeYearly: 0,
  usageEventsTotal: 0,
  usageEventsRenewals: 0,
  usageEventsNew: 0,
  usageIosTotal: 0,
  usageIosNew: 0,
  usageAndroidTotal: 0,
  usageAndroidNew: 0,
  usageStripeTotal: 0,
  usageStripeNew: 0,
  summaryText:
    "May 2026 continued to see cancellations as the primary driver of support activity. Response times were strong throughout and the team handled the volume effectively. The Firestick issue is worth monitoring for potential recurrence as the device base grows. Looking ahead to June, continued focus on subscriber retention — particularly around renewal communications — is recommended to help reduce cancellation volumes.",
};

async function ensureFellasLoadedReport() {
  const client = await prisma.supportClient.findFirst({
    where: { name: { contains: "Fellas", mode: "insensitive" } },
  });
  if (!client) return;

  const existing = await prisma.supportReport.findFirst({
    where: { clientId: client.id, period: "May 2026" },
  });
  if (existing) return;

  await prisma.supportReport.create({
    data: {
      clientId: client.id,
      period: "May 2026",
      payload: FELLAS_MAY_2026_PAYLOAD as unknown as Prisma.InputJsonValue,
      createdBy: "Dan Lindsay",
    },
  });
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
        contactDetails: GITWORK.email,
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
      archivedAt: null,
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

  // Self-heal: any existing candidate row whose seed says PRO_BONO gets
  // its devGroup updated (idempotent — once set it stays). This catches
  // legacy rows that were seeded before the field existed. We DON'T flip
  // back to BENCH for non-pro-bono devs, so admins moving a dev between
  // groups by hand isn't overwritten.
  const proBonoHandles = candidates
    .filter((c) => c.devGroup === "PRO_BONO")
    .map((c) => c.githubHandle);
  if (proBonoHandles.length > 0) {
    await prisma.candidate.updateMany({
      where: {
        workspaceId: workspace.id,
        githubHandle: { in: proBonoHandles },
        devGroup: { not: "PRO_BONO" },
      },
      data: { devGroup: "PRO_BONO" },
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
  // Never (re)create or patch a placeholder admin — e.g. admin@example.com. These
  // are seed/junk, hidden from every list; recreating one on boot would resurrect
  // the very account we filter out. See src/server/seed-accounts.ts.
  if (isSeedAccountEmail(email)) return;

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
