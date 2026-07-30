"use client";

import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import Link from "next/link";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  ArrowLeftIcon,
  Cog6ToothIcon,
  PlusIcon,
  XMarkIcon,
  InboxArrowDownIcon,
  CodeBracketIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  CheckIcon,
  TrashIcon,
  EllipsisHorizontalIcon,
  PencilSquareIcon,
  EyeIcon,
  BookmarkSquareIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import {
  WikiSidebar,
  type WikiSection,
  COURSE_REQUESTS_SLUGS,
  GOLF_DATA_SLUGS,
  OPTIONAL_DOC_SECTIONS,
} from "./wiki-sidebar";
import { WikiPageEditor, type WikiPageEditorHandle } from "./wiki-page-editor";
import { ChangelogSection } from "./changelog-section";
import { ChangelogEntryForm } from "./changelog-entry-form";
import { CourseRequestsSection } from "./course-requests-section";
import { GolfDataConsoleView } from "./golf-data-console";
import { WikiIntakeSection } from "./wiki-intake-section";
import { WikiBlockersSection } from "./wiki-blockers-section";
import { WikiCodeSection } from "./wiki-code-section";
import { CourseRequestForm, type CourseRequestPayload } from "./course-request-form";
import { CourseFeedbackImportModal } from "./course-feedback-import-modal";
import { CourseApiIntakeModal } from "./course-api-intake-modal";
import { WikiTimelineSection } from "./wiki-timeline-section";
import { WikiDashboard } from "./wiki-dashboard";
import { MonitorsManager } from "./monitors-section";
import { DocumentsManager } from "./documents-section";
import { WikiAccessSettings } from "./wiki-access-settings";
import {
  ApiDocsPageEditor,
  normalizeApiDocsContent,
  type ApiDocsContent,
} from "./api-docs-page-editor";
import { DesignSystemWorkspace } from "@/components/clients/design-system/design-system-workspace";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  useClientWiki,
  useUpsertWikiPage,
  useDeleteWikiPage,
  useAddChangelogEntry,
  useDeleteChangelogEntry,
  useUpdateWikiPlatforms,
  useUpdateEntryStatus,
  useUpdateChangelogEntry,
  useAddCourseRequest,
  useUpdateCourseRequest,
  useDeleteCourseRequest,
  useSyncBigWedgeStatus,
  useSetWikiMonitorsEnabled,
  useSetWikiDocumentsEnabled,
  useSetWikiIntakeEnabled,
  useSetWikiCodeEnabled,
} from "@/hooks/use-wiki";
import type { BigWedgeSyncResult } from "@/lib/api";
import type { ChangelogEntryPayload, ChangelogEditInitial } from "./changelog-entry-form";
import type { CourseRequestRecord } from "@/lib/api";

type WikiPageType =
  | "IA_GUIDE"
  | "DEV_API_GUIDE"
  | "API_DOCS"
  | "ARCHITECTURE"
  | "RUNBOOK"
  | "DATA_MODEL"
  | "CUSTOM";

const SECTION_TO_TYPE: Partial<Record<WikiSection, WikiPageType>> = {
  ia: "IA_GUIDE",
  "dev-guide": "DEV_API_GUIDE",
  "api-docs": "API_DOCS",
  architecture: "ARCHITECTURE",
  runbook: "RUNBOOK",
  "data-model": "DATA_MODEL",
};

const TYPE_TO_SECTION: Partial<Record<WikiPageType, WikiSection>> = {
  IA_GUIDE: "ia",
  DEV_API_GUIDE: "dev-guide",
  API_DOCS: "api-docs",
  ARCHITECTURE: "architecture",
  RUNBOOK: "runbook",
  DATA_MODEL: "data-model",
};

const SECTION_TITLES: Record<WikiSection, string> = {
  dashboard: "Dashboard",
  settings: "Settings",
  timeline: "Timeline",
  monitors: "Monitors",
  documents: "Documents",
  intake: "Requests",
  "code-handover": "Code Handover",
  "design-system": "Design System",
  ia: "Information Architecture",
  "dev-guide": "Developer Guide",
  "api-docs": "API Docs",
  architecture: "Architecture",
  runbook: "Runbook",
  "data-model": "Data Model",
  changelog: "Changelog",
  "course-requests": "Course Requests",
  "golf-data": "Golf Data",
  agreements: "Agreements",
};

const SECTION_WIDGET_LABELS: Partial<Record<WikiSection, string>> = {
  timeline: "TIMELINE",
  ia: "IA GUIDE",
  "dev-guide": "DEVELOPER GUIDE",
  "api-docs": "API DOCS",
  architecture: "ARCHITECTURE",
  runbook: "RUNBOOK",
  "data-model": "DATA MODEL",
  changelog: "CHANGELOG",
  "course-requests": "COURSE REQUESTS",
};

const MARKDOWN_DOC_SECTIONS = [
  "ia",
  "dev-guide",
  "architecture",
  "runbook",
  "data-model",
] as const satisfies readonly WikiSection[];

type MarkdownDocSection = (typeof MARKDOWN_DOC_SECTIONS)[number];

function isMarkdownDocSection(section: WikiSection): section is MarkdownDocSection {
  return (MARKDOWN_DOC_SECTIONS as readonly string[]).includes(section);
}

function isDocsPageSection(section: WikiSection): section is MarkdownDocSection | "api-docs" {
  return isMarkdownDocSection(section) || section === "api-docs";
}

const chipBtn =
  "inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1.5 text-[13px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50";
const menuPanel =
  "z-50 mt-1.5 min-w-[12rem] rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-white p-1.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)] focus:outline-none";
const menuItemCls =
  "flex w-full items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] text-[var(--text-2)] transition data-[focus]:bg-[var(--surface-1)] disabled:opacity-40";

interface ActionItem {
  key: string;
  label: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Shows a check on the right (used for the current Edit/Preview mode). */
  active?: boolean;
}

/** Clean 3-dot overflow menu — every wiki page folds its tools in here. */
function ActionMenu({ items, label = "Page actions" }: { items: ActionItem[]; label?: string }) {
  if (items.length === 0) return null;
  return (
    <Menu as="div" className="relative">
      <MenuButton className={`${chipBtn} px-2`} aria-label={label}>
        <EllipsisHorizontalIcon className="h-4 w-4" />
      </MenuButton>
      <MenuItems anchor="bottom end" className={menuPanel}>
        {items.map((item) => (
          <MenuItem key={item.key}>
            <button
              type="button"
              onClick={item.onClick}
              disabled={item.disabled}
              className={[
                menuItemCls,
                item.danger ? "text-rose-600 data-[focus]:bg-rose-50" : "",
              ].join(" ")}
            >
              {item.icon ? <item.icon className="h-4 w-4 shrink-0" /> : null}
              <span className="flex-1">{item.label}</span>
              {item.active ? (
                <CheckIcon className="h-3.5 w-3.5 shrink-0 text-[var(--brand-600)]" />
              ) : null}
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}

// ─── Default starter templates ────────────────────────────────────────────────

const IA_TEMPLATE = `## Product Overview
One sentence describing what this product is, who it's for, and its core value.

---

## User Roles & Permissions

| Role | Description | Access level |
|------|-------------|--------------|
| Admin | Full access — manages users, settings, and content | Full |
| Member | Standard registered account | Standard |
| Guest / Public | Unauthenticated or free-tier access | Limited |

---

## Site Map

### Primary Navigation
- **Home** \`/\`
- **Dashboard** \`/dashboard\`
- **[Feature]** \`/feature\`
- **Settings** \`/settings\`
  - Profile
  - Billing
  - Notifications

### Authenticated Areas
- **[Area]** — describe what lives here
- **[Area]** — describe what lives here

### Admin / Internal
- **[Admin area]** — accessible only to Admin role

---

## Content Types

| Type | Description | Key Fields | Status States |
|------|-------------|------------|---------------|
| [Entity] | What this represents | title, body, author | draft / published |
| [Entity] | What this represents | name, price, sku | active / archived |

---

## URL Structure

| Pattern | Description | Example |
|---------|-------------|---------|
| \`/\` | Marketing homepage | — |
| \`/[slug]\` | Public content pages | \`/about\` |
| \`/app\` | Authenticated app shell | — |
| \`/app/[feature]\` | Feature pages | \`/app/dashboard\` |
| \`/api/v1/[resource]\` | REST API | \`/api/v1/users\` |

---

## Key User Flows

### Sign Up / Onboarding
1. Land on homepage
2. Click Sign up → enter email + password
3. Verify email → complete profile
4. Redirected to dashboard / onboarding checklist

### Core Flow — [Primary Action]
1. Navigate to [feature]
2. [Action] → [Outcome]
3. Confirm / save → success state or error feedback

### [Second Key Flow]
1. Step one
2. Step two

---

## Search & Discovery
Describe how users find content — global search, filters, category browse, autocomplete, empty states.

---

## Navigation Conventions
- **Mobile:** bottom tab bar / hamburger menu / full-screen nav
- **Desktop:** sidebar / top nav / split view
- **Active state:** highlighted nav item / left border / underline
- **Breadcrumbs:** shown on [pages] — format: Parent › Child
- **Deep links:** describe any shareable or bookmarkable URLs

---

## Integrations & Third-Party Services

| Service | Purpose | Auth method | Docs |
|---------|---------|-------------|------|
| [Service name] | What it does | API key / OAuth | [link] |
| [Service name] | What it does | Webhook | [link] |

---

## Error & Empty States

| State | Where it appears | Message / Treatment |
|-------|-----------------|---------------------|
| 404 Not found | Any invalid URL | "Page not found" + back link |
| 500 Server error | API failure | "Something went wrong" + retry |
| Empty list | No data yet | Illustration + CTA to create first item |
| No results | Search / filter | "No results for [query]" + clear filter |
| Offline | Network unavailable | [describe behaviour] |

---

## Notifications

| Type | Channel | Trigger |
|------|---------|---------|
| [e.g. New message] | In-app / Email / Push | [when it fires] |
| [e.g. Payment success] | Email | [when it fires] |
`;

const DEV_TEMPLATE = `## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 18+ | Use nvm or fnm for version management |
| npm | Latest | Or pnpm — see package.json |
| Git | Latest | — |
| [Database] | — | See Database Setup below |

---

## Quick Start

\`\`\`bash
# 1. Clone the repo
git clone https://github.com/[org]/[repo]
cd [repo]

# 2. Install dependencies
npm install

# 3. Copy the env file and fill in values
cp .env.example .env.local

# 4. Push the database schema
npm run db:push

# 5. Start the dev server
npm run dev
\`\`\`

Open **http://localhost:3000**

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | [e.g. Next.js 15 / React 19] |
| Language | TypeScript |
| Database | [e.g. PostgreSQL (Neon) + Prisma ORM] |
| Styling | [e.g. Tailwind CSS] |
| Deployment | [e.g. Vercel] |
| Auth | [e.g. NextAuth / Clerk / custom JWT] |

---

## Folder Structure

\`\`\`
src/
  app/         ← Pages and API routes (App Router)
  components/  ← React components
  server/      ← Server-side business logic
  lib/         ← Shared utilities and helpers
  hooks/       ← Data-fetching hooks
prisma/
  schema.prisma ← Database schema
\`\`\`

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| \`DATABASE_URL\` | Postgres connection string (pooled) | ✓ |
| \`DIRECT_URL\` | Postgres direct URL (for migrations) | ✓ |
| \`NEXTAUTH_SECRET\` | Auth session signing secret | ✓ |
| \`NEXTAUTH_URL\` | Base URL for auth callbacks | ✓ |
| \`API_KEY\` | Internal API authentication | ✓ |
| \`[SERVICE]_API_KEY\` | [Third-party service] | — |

---

## Database Setup

\`\`\`bash
npm run db:generate   # Regenerate Prisma client after schema changes
npm run db:push       # Push schema changes to the database (dev / preview)
npm run db:migrate    # Create a named migration (staging / production)
\`\`\`

Schema file: \`prisma/schema.prisma\`

---

## Key API Endpoints

| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| \`GET\` | \`/api/health\` | Health check | None |
| \`GET\` | \`/api/[resource]\` | List resources | Bearer |
| \`POST\` | \`/api/[resource]\` | Create resource | Bearer |
| \`PATCH\` | \`/api/[resource]/[id]\` | Update resource | Bearer |
| \`DELETE\` | \`/api/[resource]/[id]\` | Delete resource | Bearer |

All authenticated routes require: \`Authorization: Bearer {API_KEY}\`

---

## Authentication
Describe the auth approach — session model, protected routes, token refresh, role-based access.

---

## Testing

\`\`\`bash
npm run test          # Run all tests
npm run test:watch    # Watch mode
npm run test:e2e      # End-to-end tests (Playwright/Cypress)
\`\`\`

Test files live alongside the source: \`*.test.ts\` / \`*.spec.ts\`. E2E tests in \`/e2e\` or \`/tests\`.

**Conventions:**
- Unit tests: pure functions and server logic
- Integration tests: API routes with a test database
- E2E: critical user journeys (sign in, core action, sign out)

---

## Deployment

### Preview (auto)
Push any branch → a preview URL is created automatically.

### Production
\`\`\`bash
# Merge PR to main → auto-deploys to production
# Manual: vercel --prod
\`\`\`

Build command runs \`prisma db push\` (additive-only) before \`next build\`. Destructive schema changes must be applied manually.

---

## CI / CD Pipeline

| Trigger | What runs |
|---------|-----------|
| Every PR | Lint · TypeScript · Unit tests |
| Merge to main | Full build · Deploy to production |
| Nightly | [e.g. E2E test suite] |

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| LCP (Largest Contentful Paint) | < 2.5s | Measured on 4G mobile |
| FID / INP | < 100ms | Interaction responsiveness |
| CLS | < 0.1 | No layout shifts |
| API p95 response time | < 500ms | Key read endpoints |
| API p95 response time | < 2s | Write endpoints |

---

## Monitoring & Observability

| Tool | What it tracks |
|------|---------------|
| [e.g. Sentry] | Runtime errors + stack traces |
| [e.g. Vercel Analytics] | Web vitals + traffic |
| [e.g. Logflare / Papertrail] | Server logs |
| [e.g. PlanetScale Insights] | Slow queries |

---

## Code Conventions
- **TypeScript strict** — avoid \`any\`; use explicit types
- **Absolute imports** — use \`@/\` prefix for cross-directory imports
- **API responses** — use \`apiOk()\` / \`apiError()\` helpers consistently
- **Components** — one component per file, PascalCase filenames
- **Commits** — Conventional Commits format (\`feat:\`, \`fix:\`, \`chore:\`)

---

## Branching Strategy

| Branch | Purpose |
|--------|---------|
| \`main\` | Production — every merge auto-deploys |
| \`feature/*\` | New features → squash merge via PR |
| \`fix/*\` | Bug fixes → squash merge via PR |

Rebase feature branches on \`main\` — do not merge \`main\` into the branch.

---

## Troubleshooting

| Issue | Likely cause | Fix |
|-------|-------------|-----|
| \`prisma generate\` fails | Node version mismatch | Use Node 18+ via nvm |
| \`next build\` fails on types | Strict mode violations | Run \`tsc --noEmit\` and fix errors |
| Database connection refused | Wrong \`DATABASE_URL\` | Check .env.local matches Neon/DB credentials |
| Stale data after update | React Query cache | Add \`queryClient.invalidateQueries()\` on mutation |
| API returns 401 | Missing \`API_KEY\` header | Ensure \`Authorization: Bearer ...\` header is set |

---

## Key Contacts

| Role | Name | Contact |
|------|------|---------|
| Tech Lead | — | — |
| DevOps / Infra | — | — |
| Product / Design | — | — |
| On-call / Incidents | — | — |
`;

const API_DOCS_TEMPLATE: ApiDocsContent = normalizeApiDocsContent(
  {
    title: "Client API",
    schemaPath: "/api/schema/",
    environment: "STAGE",
    specVersion: "OAS 3.0",
    description: "API documentation for the client application.",
    websiteLabel: "Client Website",
    websiteUrl: "",
    servers: [
      { url: "https://api.example.com", label: "STAGE" },
      { url: "https://api.example.com", label: "PRODUCTION" },
    ],
    endpoints: [
      {
        tag: "analytics",
        method: "GET",
        path: "/api/analytics/reports/",
        operationId: "analytics_reports_retrieve",
        auth: true,
        summary: "Retrieve analytics reports.",
      },
      {
        tag: "analytics",
        method: "GET",
        path: "/api/analytics/subscriptions/",
        operationId: "analytics_subscriptions_retrieve",
        auth: true,
        summary: "Retrieve subscription analytics.",
      },
      {
        tag: "users",
        method: "POST",
        path: "/api/users/",
        operationId: "users_create",
        auth: true,
        summary: "Create a user record.",
      },
    ],
  },
  "API Docs",
);

const ARCHITECTURE_TEMPLATE = `## System Summary
Describe the system boundaries, major apps/services, and the high-level data flow.

---

## Architecture Map

| Area | Responsibility | Owner |
|------|----------------|-------|
| Web app | User interface and app shell | — |
| API | Business logic and integrations | — |
| Database | Persistent product data | — |
| Background jobs | Scheduled or async work | — |
| Third-party services | Payments, email, analytics, storage | — |

---

## Runtime Environments

| Environment | Purpose | Deployment |
|-------------|---------|------------|
| Local | Developer work | Manual |
| Preview | Branch testing | Automatic |
| Staging | Client/UAT sign-off | Automatic/manual |
| Production | Live users | Protected |

---

## Core Data Flow

1. User enters the app through [entry point].
2. App reads/writes through [API/service].
3. Server validates auth, permissions, and payload.
4. Data persists to [database/storage].
5. Events trigger [notifications/jobs/webhooks].
6. Monitoring captures success/failure signals.

---

## Key Services

| Service | Purpose | Criticality | Failure mode |
|---------|---------|-------------|--------------|
| [Service] | [What it does] | High/Med/Low | [What breaks] |
| [Service] | [What it does] | High/Med/Low | [What breaks] |

---

## Security Boundaries

| Boundary | Rule | Notes |
|----------|------|-------|
| Authentication | [Session/API key/OAuth] | — |
| Authorization | [Roles/scopes] | — |
| Secrets | [Where stored] | Never commit secrets |
| Public data | [What can be shared] | — |

---

## Known Constraints

- [Constraint]
- [Constraint]
- [Constraint]

---

## Decision Log

| Date | Decision | Reason | Owner |
|------|----------|--------|-------|
| YYYY-MM-DD | [Decision] | [Why] | — |
`;

const RUNBOOK_TEMPLATE = `## Operating Model
Define how this product is operated day to day: owners, escalation paths, routine checks, and recovery steps.

---

## Contacts

| Role | Person/team | Channel |
|------|-------------|---------|
| Product owner | — | — |
| Technical owner | — | — |
| Support owner | — | — |
| Escalation | — | — |

---

## Routine Checks

| Cadence | Check | Owner |
|---------|-------|-------|
| Daily | Review error logs and support queue | — |
| Weekly | Check analytics, uptime, failed jobs | — |
| Monthly | Rotate keys, review access, archive stale data | — |

---

## Common Incidents

### API outage

1. Confirm health endpoint and hosting status.
2. Check recent deploys and environment variables.
3. Review logs for request ids and repeated errors.
4. Roll back or patch forward.
5. Record incident notes and follow-up actions.

### Failed integration

1. Confirm provider status.
2. Check credentials and rate limits.
3. Retry a known-safe request.
4. Notify affected stakeholders.

---

## Deployment Checklist

- [ ] Change reviewed
- [ ] TypeScript/lint/tests pass
- [ ] Database changes are additive or migration-approved
- [ ] Environment variables configured
- [ ] Rollback path understood
- [ ] Stakeholders notified where needed

---

## Recovery Notes

| Scenario | Recovery step | Verification |
|----------|---------------|--------------|
| Bad deploy | Roll back to previous deployment | Smoke critical routes |
| Broken env var | Restore last known value | Check service health |
| Data issue | Restore/fix with approved script | Confirm affected records |

---

## Post-Incident Template

| Field | Notes |
|-------|-------|
| Start/end time | — |
| Impact | — |
| Root cause | — |
| Resolution | — |
| Follow-ups | — |
`;

const DATA_MODEL_TEMPLATE = `## Data Model Overview
Document the core entities, relationships, and ownership rules.

---

## Entities

| Entity | Description | Owner | Lifecycle |
|--------|-------------|-------|-----------|
| User | Authenticated account | Product | invited / active / disabled |
| Organisation | Customer workspace | Product | trial / active / churned |
| [Entity] | [What it represents] | — | — |

---

## Relationships

| Parent | Child | Cardinality | Notes |
|--------|-------|-------------|-------|
| Organisation | User | 1:many | Members belong to one org |
| User | [Entity] | 1:many | Created by / assigned to |

---

## Key Fields

| Entity | Field | Type | Required | Notes |
|--------|-------|------|----------|-------|
| [Entity] | \`id\` | string | Yes | Primary identifier |
| [Entity] | \`status\` | enum | Yes | Drives lifecycle |
| [Entity] | \`createdAt\` | datetime | Yes | Audit trail |

---

## Statuses

| Status | Meaning | Allowed transitions |
|--------|---------|---------------------|
| \`DRAFT\` | Not yet published | ACTIVE / ARCHIVED |
| \`ACTIVE\` | Live and usable | ARCHIVED |
| \`ARCHIVED\` | Hidden from normal use | ACTIVE |

---

## Data Ownership

| Data | Source of truth | Edited by | Retention |
|------|-----------------|-----------|-----------|
| Profile data | App database | User/admin | Account lifetime |
| Billing data | Payment provider | Provider/admin | Legal requirement |
| Analytics | Analytics provider | System | Policy-defined |

---

## Privacy & Compliance

- Identify personal data fields.
- Identify sensitive operational data.
- Record export/delete expectations.
- Record audit-log coverage.

---

## Import / Export Notes

| Flow | Format | Owner | Notes |
|------|--------|-------|-------|
| Import | CSV / API / manual | — | Validate before write |
| Export | CSV / JSON | — | Include timestamps and ids |
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  slug: string;
  clientName: string;
}

const ALL_PLATFORM_OPTIONS = [
  { value: "IOS", label: "iOS App Store" },
  { value: "ANDROID", label: "Google Play" },
  { value: "FIRESTICK", label: "Amazon Fire TV" },
  { value: "WEB", label: "Web" },
];

/** Every valid section id — used to validate a section restored from the URL hash. */
const ALL_WIKI_SECTIONS: WikiSection[] = [
  "dashboard", "timeline", "monitors", "documents", "intake", "code-handover",
  "design-system", "ia", "dev-guide", "api-docs", "architecture", "runbook",
  "data-model", "changelog", "course-requests", "golf-data", "settings",
];

/** Read the active section from the URL hash (e.g. `#api-docs`), defaulting to dashboard. */
function readSectionFromHash(): WikiSection {
  if (typeof window === "undefined") return "dashboard";
  const raw = window.location.hash.replace(/^#/, "");
  return (ALL_WIKI_SECTIONS as string[]).includes(raw) ? (raw as WikiSection) : "dashboard";
}

export function WikiWorkspace({ slug, clientName }: Props) {
  // Restore the open section from the URL hash so a refresh lands on the same page.
  // Safe from hydration mismatch: the first render shows the loader (below), which
  // doesn't depend on activeSection, so server/client output match until wiki loads.
  const [activeSection, setActiveSection] = useState<WikiSection>(readSectionFromHash);
  /** Latest available sections, mirrored from render so the guard effect can read them. */
  const availableSectionsRef = useRef<WikiSection[]>([]);
  const [showChangelogForm, setShowChangelogForm] = useState(false);
  /** Version string currently being edited, or null when adding a new one. */
  const [editingVersion, setEditingVersion] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPlatformModal, setShowPlatformModal] = useState(false);
  const [pendingPlatforms, setPendingPlatforms] = useState<string[]>([]);
  // Course requests (Wedge)
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseRequestRecord | null>(null);
  const [showCourseImport, setShowCourseImport] = useState(false);
  const [showCourseApi, setShowCourseApi] = useState(false);
  const [courseSaving, setCourseSaving] = useState(false);
  const [syncResult, setSyncResult] = useState<BigWedgeSyncResult | null>(null);
  const syncMutation = useSyncBigWedgeStatus(slug);

  // Page editor state — controlled by this workspace, not the editor itself
  const [pageMode, setPageMode] = useState<"edit" | "preview">("edit");
  const [pageSavedLabel, setPageSavedLabel] = useState<string | null>(null);
  const editorRef = useRef<WikiPageEditorHandle>(null);

  // Reset editor state when switching sections
  useEffect(() => {
    setPageMode(activeSection === "api-docs" ? "preview" : "edit");
    setPageSavedLabel(null);
  }, [activeSection]);

  // Mirror the active section into the URL hash so a browser refresh restores it.
  useEffect(() => {
    const next = `#${activeSection}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [activeSection]);

  // Follow back/forward navigation between sections.
  useEffect(() => {
    const onHashChange = () => setActiveSection(readSectionFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const { data: wiki, isPending } = useClientWiki(slug);

  // If the restored section isn't available for this client (e.g. a deleted page or
  // a Wedge-only section on another client), fall back to the dashboard once loaded.
  // Design System + Changelog are exempt: they have no enable flag and are
  // deliberately navigable before they have any content — that's how content
  // gets added (see handleAddSection) — so they never count as "unavailable"
  // here. Without this exemption, clicking either from "+ Add New" bounced
  // straight back to the dashboard before the operator could add anything.
  useEffect(() => {
    if (activeSection === "dashboard") return;
    if (activeSection === "design-system" || activeSection === "changelog") return;
    const avail = availableSectionsRef.current;
    if (avail.length && !avail.includes(activeSection)) setActiveSection("dashboard");
  }, [activeSection, wiki]);

  const upsertPage = useUpsertWikiPage(slug);
  const deletePage = useDeleteWikiPage(slug);
  const setMonitorsEnabled = useSetWikiMonitorsEnabled(slug);
  const setDocumentsEnabled = useSetWikiDocumentsEnabled(slug);
  const setIntakeEnabled = useSetWikiIntakeEnabled(slug);
  const setCodeEnabled = useSetWikiCodeEnabled(slug);
  const addEntry = useAddChangelogEntry(slug);
  const deleteEntry = useDeleteChangelogEntry(slug);
  const updatePlatforms = useUpdateWikiPlatforms(slug);
  const updateStatus = useUpdateEntryStatus(slug);
  const updateEntry = useUpdateChangelogEntry(slug);
  const addCourse = useAddCourseRequest(slug);
  const updateCourse = useUpdateCourseRequest(slug);
  const deleteCourse = useDeleteCourseRequest(slug);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-[var(--text-4)]">Loading wiki…</div>
      </div>
    );
  }

  if (!wiki) return null;

  const allDocsPageSections = OPTIONAL_DOC_SECTIONS.map((item) => item.section);
  const docsPageSectionSet = new Set<WikiSection>(allDocsPageSections);
  const hiddenSections = new Set<WikiSection>(
    (wiki.hiddenSections ?? []).filter((section): section is WikiSection =>
      docsPageSectionSet.has(section as WikiSection),
    ),
  );
  const existingDocsPageSections = new Set<WikiSection>(
    wiki.pages
      .map((page) => TYPE_TO_SECTION[page.type as WikiPageType])
      .filter((section): section is WikiSection => {
        if (!section) return false;
        return docsPageSectionSet.has(section);
      }),
  );
  const monitorsOn = wiki.monitors.enabled;
  const documentsOn = wiki.documents.enabled;
  // Requests section shows when intake is enabled OR there are dev-raised blockers to surface.
  const intakeOn = wiki.intakeEnabled || wiki.blockers.length > 0;
  const codeOn = wiki.codeHandover.enabled;
  // A fresh wiki shows only Dashboard + Timeline (both permanent, non-deletable).
  // Every other section appears once it has real content OR is explicitly enabled,
  // and is otherwise offered under "+ Add New".
  const designSystemOn = Boolean(wiki.designSystem);
  const changelogOn = wiki.changelog.length > 0;
  const availableSections: WikiSection[] = [
    "dashboard",
    "timeline",
    ...(monitorsOn ? (["monitors"] as const) : []),
    ...(documentsOn ? (["documents"] as const) : []),
    ...(intakeOn ? (["intake"] as const) : []),
    ...(codeOn ? (["code-handover"] as const) : []),
    ...(designSystemOn ? (["design-system"] as const) : []),
    ...OPTIONAL_DOC_SECTIONS.filter(
      (item) => !hiddenSections.has(item.section) && existingDocsPageSections.has(item.section),
    ).map((item) => item.section),
    ...(changelogOn ? (["changelog"] as const) : []),
    ...(COURSE_REQUESTS_SLUGS.includes(slug) ? (["course-requests"] as const) : []),
    ...(GOLF_DATA_SLUGS.includes(slug) ? (["golf-data"] as const) : []),
    "settings",
  ];
  availableSectionsRef.current = availableSections;
  const addableSections = [
    ...OPTIONAL_DOC_SECTIONS.filter(
      (item) => hiddenSections.has(item.section) || !existingDocsPageSections.has(item.section),
    ),
    ...(monitorsOn ? [] : [{ section: "monitors" as WikiSection, label: "Monitors" }]),
    ...(documentsOn ? [] : [{ section: "documents" as WikiSection, label: "Documents" }]),
    ...(intakeOn ? [] : [{ section: "intake" as WikiSection, label: "Requests" }]),
    ...(codeOn ? [] : [{ section: "code-handover" as WikiSection, label: "Code Handover" }]),
    ...(designSystemOn ? [] : [{ section: "design-system" as WikiSection, label: "Design System" }]),
    ...(changelogOn ? [] : [{ section: "changelog" as WikiSection, label: "Changelog" }]),
  ];

  // Which sections are publicly shared (for the sidebar globe indicator):
  // the whole-wiki link covers every page; otherwise only per-page-shared ones.
  const wikiShareOn = wiki.shareEnabled && Boolean(wiki.shareToken);
  const sharedSections: WikiSection[] = (
    wikiShareOn
      ? availableSections
      : (Object.keys(wiki.pageShares ?? {}) as WikiSection[])
  ).filter((section) => section !== "settings");

  function getPage(section: WikiSection) {
    const type = SECTION_TO_TYPE[section];
    if (!type) return null;
    return wiki!.pages.find((p) => p.type === type) ?? null;
  }

  async function handleSavePage(section: WikiSection, title: string, content: unknown) {
    const type = SECTION_TO_TYPE[section];
    if (!type) return;
    await upsertPage.mutateAsync({ type, title, content });
  }

  async function handleAddSection(section: WikiSection) {
    if (section === "monitors") {
      await setMonitorsEnabled.mutateAsync(true);
      setActiveSection("monitors");
      return;
    }
    if (section === "documents") {
      await setDocumentsEnabled.mutateAsync(true);
      setActiveSection("documents");
      return;
    }
    if (section === "intake") {
      await setIntakeEnabled.mutateAsync(true);
      setActiveSection("intake");
      return;
    }
    if (section === "code-handover") {
      await setCodeEnabled.mutateAsync(true);
      setActiveSection("code-handover");
      return;
    }
    // Design System + Changelog have no enable flag — they persist by content
    // (imported tokens / a changelog entry). Adding just opens them so the
    // operator can add that content; they then stay in the sidebar.
    if (section === "design-system" || section === "changelog") {
      setActiveSection(section);
      return;
    }
    if (!isDocsPageSection(section)) return;
    const type = SECTION_TO_TYPE[section];
    if (!type) return;
    await upsertPage.mutateAsync({
      type,
      title: SECTION_TITLES[section],
      content: getDefaultContent(section),
    });
    setActiveSection(section);
    setPageMode("edit");
  }

  async function handleDeletePage(section: WikiSection) {
    if (section === "monitors") {
      await setMonitorsEnabled.mutateAsync(false);
      setActiveSection(availableSections.find((s) => s !== "monitors") ?? "dashboard");
      return;
    }
    if (section === "documents") {
      await setDocumentsEnabled.mutateAsync(false);
      setActiveSection(availableSections.find((s) => s !== "documents") ?? "dashboard");
      return;
    }
    if (section === "intake") {
      await setIntakeEnabled.mutateAsync(false);
      setActiveSection(availableSections.find((s) => s !== "intake") ?? "dashboard");
      return;
    }
    if (section === "code-handover") {
      await setCodeEnabled.mutateAsync(false);
      setActiveSection(availableSections.find((s) => s !== "code-handover") ?? "dashboard");
      return;
    }
    if (!isDocsPageSection(section)) return;
    const type = SECTION_TO_TYPE[section];
    if (!type) return;
    await deletePage.mutateAsync({ type });
    const nextSection = availableSections.find((item) => item !== section) ?? "design-system";
    setActiveSection(nextSection);
  }

  function confirmDeletePage(section: WikiSection) {
    if (
      !isDocsPageSection(section) &&
      section !== "monitors" &&
      section !== "documents" &&
      section !== "intake" &&
      section !== "code-handover"
    )
      return;
    const extra =
      section === "intake"
        ? " Clients and the intake API can no longer add items until you re-add it."
        : "";
    const ok = window.confirm(
      `Delete ${SECTION_TITLES[section]} from this wiki?${extra} You can add it back later from Add New.`,
    );
    if (!ok) return;
    void handleDeletePage(section);
  }

  /** Delete all entries in a version group (called with all their IDs). */
  async function handleDeleteVersion(ids: string[]) {
    await Promise.all(ids.map((id) => deleteEntry.mutateAsync(id)));
  }

  /** Toggle PENDING ↔ APPROVED for all entries in a version group. */
  async function handleToggleStatus(ids: string[], newStatus: string) {
    await Promise.all(ids.map((id) => updateStatus.mutateAsync({ id, status: newStatus })));
  }

  function openAddForm() {
    setEditingVersion(null);
    setShowChangelogForm(true);
  }

  function openEditForm(version: string) {
    setEditingVersion(version);
    setShowChangelogForm(true);
  }

  function closeForm() {
    setShowChangelogForm(false);
    setEditingVersion(null);
  }

  /** Build the form's pre-fill data for the version currently being edited. */
  function buildEditInitial(): ChangelogEditInitial | undefined {
    if (!editingVersion) return undefined;
    const groupEntries = wiki!.changelog.filter((e) => e.version === editingVersion);
    if (groupEntries.length === 0) return undefined;
    return {
      version: editingVersion,
      title: groupEntries[0].title,
      releasedAt: groupEntries[0].releasedAt,
      status: groupEntries[0].status ?? "PENDING",
      entries: groupEntries.map((e) => ({ id: e.id, platform: e.platform, body: e.body })),
    };
  }

  /**
   * Save the form. When adding, creates one entry per filled platform. When
   * editing, updates existing platform entries in place, creates entries for
   * newly-filled platforms, and deletes entries for platforms that were cleared.
   */
  async function handleSaveEntries(entries: ChangelogEntryPayload[]) {
    setIsSubmitting(true);
    try {
      if (editingVersion) {
        const original = wiki!.changelog.filter((e) => e.version === editingVersion);
        const returnedPlatforms = new Set(entries.map((e) => e.platform));
        await Promise.all([
          ...entries.map((e) =>
            e.id
              ? updateEntry.mutateAsync({
                  id: e.id,
                  data: {
                    version: e.version,
                    title: e.title,
                    body: e.body ?? null,
                    releasedAt: e.releasedAt ?? null,
                    status: e.status,
                  },
                })
              : addEntry.mutateAsync(e),
          ),
          // Platforms that had an entry but were cleared in the form → delete
          ...original
            .filter((o) => !returnedPlatforms.has(o.platform))
            .map((o) => deleteEntry.mutateAsync(o.id)),
        ]);
      } else {
        await Promise.all(entries.map((e) => addEntry.mutateAsync(e)));
      }
      closeForm();
    } finally {
      setIsSubmitting(false);
    }
  }

  function getDefaultContent(section: WikiSection): unknown {
    if (section === "ia") return IA_TEMPLATE;
    if (section === "dev-guide") return DEV_TEMPLATE;
    if (section === "api-docs") return API_DOCS_TEMPLATE;
    if (section === "architecture") return ARCHITECTURE_TEMPLATE;
    if (section === "runbook") return RUNBOOK_TEMPLATE;
    if (section === "data-model") return DATA_MODEL_TEMPLATE;
    return "";
  }

  // ── Course requests ──────────────────────────────────────────
  function openAddCourse() {
    setEditingCourse(null);
    setShowCourseForm(true);
  }
  function openEditCourse(req: CourseRequestRecord) {
    setEditingCourse(req);
    setShowCourseForm(true);
  }
  function closeCourseForm() {
    setShowCourseForm(false);
    setEditingCourse(null);
  }
  async function handleSaveCourse(payload: CourseRequestPayload) {
    setCourseSaving(true);
    try {
      if (editingCourse) {
        await updateCourse.mutateAsync({ id: editingCourse.id, data: payload });
      } else {
        await addCourse.mutateAsync(payload);
      }
      closeCourseForm();
    } finally {
      setCourseSaving(false);
    }
  }
  async function handleDeleteCourses(ids: string[]) {
    await Promise.all(ids.map((id) => deleteCourse.mutateAsync(id)));
  }
  async function handleSetCourseStatus(ids: string[], status: string) {
    await Promise.all(ids.map((id) => updateCourse.mutateAsync({ id, data: { status } })));
  }

  function renderContent() {
    // ── Dashboard — the client-facing landing overview. Same component the
    // public wiki uses; tiles deep-link into the other sections.
    if (activeSection === "dashboard") {
      return (
        <WikiDashboard
          wiki={wiki!}
          availableSections={availableSections}
          onSelect={setActiveSection}
        />
      );
    }

    // ── Settings — set the public-link username/password gate (internal only).
    if (activeSection === "settings") {
      return (
        <WikiAccessSettings slug={slug} wiki={wiki!} availableSections={availableSections} />
      );
    }

    // ── Timeline — read-only Gantt preview of the client's delivery roadmap.
    // Sourced from the client's task-board feature blocks (loadWikiTimeline),
    // so it matches the public /timeline/[token] share. Edit phases on the
    // client's Tasks board, not here.
    if (activeSection === "timeline") {
      return (
        <>
          <div className="mb-4 flex h-9 items-center justify-between gap-2">
            <p className="text-[13px] text-[var(--text-4)]">
              Pulls live from this client&apos;s project phases — edit on the Tasks board.
            </p>
            <ActionMenu
              items={[
                {
                  key: "tasks",
                  label: "Edit on Tasks board",
                  icon: ArrowTopRightOnSquareIcon,
                  onClick: () => window.location.assign(`/app/portal/${slug}/tasks`),
                },
              ]}
            />
          </div>
          <WikiTimelineSection timeline={wiki!.timeline} />
        </>
      );
    }

    // ── Monitors — automated uptime checks (HTTP/TCP connectors).
    if (activeSection === "monitors") {
      return <MonitorsManager slug={slug} monitors={wiki!.monitors.monitors} />;
    }

    // ── Documents — clean list of links / Foundry docs / uploaded files.
    if (activeSection === "documents") {
      return <DocumentsManager slug={slug} documents={wiki!.documents.documents} />;
    }

    // ── Client intake — bugs/feedback/requests stay in Wiki until promoted by Admin+.
    if (activeSection === "code-handover") {
      return <WikiCodeSection slug={slug} section={wiki!.codeHandover} mode="internal" />;
    }
    if (activeSection === "intake") {
      return (
        <>
          <WikiBlockersSection blockers={wiki!.blockers} mode="internal" />
          {wiki!.intakeEnabled ? <WikiIntakeSection slug={slug} items={wiki!.intakeItems} mode="internal" /> : null}
        </>
      );
    }

    // ── Design System — embedded inline (has its own action bar)
    // -mt-6 cancels the parent pt-6 so DS workspace content starts flush at top;
    // the DS workspace itself adds its own pt-6, keeping its action bar in line.
    if (activeSection === "design-system") {
      return (
        <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6">
          {/* Sharing is managed centrally in the wiki Settings tab — no inline control. */}
          <DesignSystemWorkspace slug={slug} embedded />
        </div>
      );
    }

    // ── Changelog
    if (activeSection === "changelog") {
      const wikiPlatforms = wiki!.platforms;
      return (
        <>
          {/* Page-level action bar — folded into a 3-dot menu */}
          <div className="mb-4 flex h-9 items-center justify-end gap-2">
            <ActionMenu
              items={[
                {
                  key: "platforms",
                  label: "Manage platforms",
                  icon: Cog6ToothIcon,
                  onClick: () => {
                    setPendingPlatforms(wikiPlatforms);
                    setShowPlatformModal(true);
                  },
                },
                {
                  key: "add-version",
                  label: "Add version",
                  icon: PlusIcon,
                  onClick: openAddForm,
                },
              ]}
            />
          </div>

          {/* Widget card */}
          <section className="widget-card">
            <div className="widget-header">
              <span className="widget-header__label">
                <span className="widget-header__label--number">01</span>
                {" // CHANGELOG"}
              </span>
            </div>
            <div className="p-6">
              <ChangelogSection
                entries={wiki!.changelog}
                platforms={wikiPlatforms}
                onAdd={openAddForm}
                onDelete={handleDeleteVersion}
                onToggleStatus={handleToggleStatus}
                onEdit={openEditForm}
              />
            </div>
          </section>
        </>
      );
    }

    // ── Course Requests (Wedge only)
    if (activeSection === "course-requests") {
      if (!COURSE_REQUESTS_SLUGS.includes(slug)) {
        return (
          <div className="rounded-[10px] border border-dashed border-[rgba(0,0,0,0.12)] py-14 text-center">
            <p className="text-[13px] text-[var(--text-4)]">
              Course Requests isn&apos;t enabled for this client.
            </p>
          </div>
        );
      }
      return (
        <>
          <div className="mb-4 flex h-9 items-center justify-end gap-2">
            <ActionMenu
              items={[
                {
                  key: "import",
                  label: "Import from feedback",
                  icon: InboxArrowDownIcon,
                  onClick: () => setShowCourseImport(true),
                },
                {
                  key: "api",
                  label: "API intake",
                  icon: CodeBracketIcon,
                  onClick: () => setShowCourseApi(true),
                },
                {
                  key: "add",
                  label: "Add request",
                  icon: PlusIcon,
                  onClick: openAddCourse,
                },
                {
                  key: "sync",
                  label: syncMutation.isPending ? "Syncing…" : "Sync status",
                  icon: ArrowPathIcon,
                  disabled: syncMutation.isPending,
                  onClick: () => {
                    setSyncResult(null);
                    syncMutation.mutate(
                      { dryRun: true },
                      { onSuccess: (data) => setSyncResult(data) },
                    );
                  },
                },
              ]}
            />
          </div>

          {/* Sync error panel */}
          {syncMutation.isError && !syncResult && (
            <div className="mb-5 rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 flex items-start justify-between gap-3">
              <p className="text-sm text-red-700">
                <span className="font-semibold">Sync failed: </span>
                {syncMutation.error?.message ?? "Unknown error"}
              </p>
              <button
                type="button"
                onClick={() => syncMutation.reset()}
                className="shrink-0 rounded-[6px] p-1 text-red-400 hover:text-red-600"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Sync result panel */}
          {syncResult && (
            <div className="mb-5 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-text-secondary)] mb-1">
                    Sync preview
                  </p>
                  {syncResult.toMarkCount === 0 ? (
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      No new requests to mark as Added — {syncResult.actionTakenCount} actioned on Big Wedge, none matched unresolved records here.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-[var(--color-text-primary)] mb-2">
                        <span className="font-semibold">{syncResult.toMarkCount}</span>{" "}
                        {syncResult.toMarkCount === 1 ? "request" : "requests"} would be marked{" "}
                        <span className="font-semibold text-emerald-600">ADDED</span>.
                      </p>
                      {syncResult.sample.length > 0 && (
                        <ul className="mb-2 space-y-0.5">
                          {syncResult.sample.map((s, i) => (
                            <li key={i} className="font-mono text-xs text-[var(--color-text-secondary)] truncate">
                              {s.courseName}{s.country ? ` · ${s.country}` : ""}
                            </li>
                          ))}
                          {syncResult.toMarkCount > syncResult.sample.length && (
                            <li className="font-mono text-xs text-[var(--color-text-secondary)]">
                              +{syncResult.toMarkCount - syncResult.sample.length} more
                            </li>
                          )}
                        </ul>
                      )}
                    </>
                  )}
                  {syncResult.errors.length > 0 && (
                    <p className="mt-1 text-xs text-red-500">{syncResult.errors[0]}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {syncResult.toMarkCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        syncMutation.mutate(
                          { dryRun: false },
                          {
                            onSuccess: () => setSyncResult(null),
                          },
                        );
                      }}
                      disabled={syncMutation.isPending}
                      className="inline-flex items-center gap-1.5 rounded-[6px] bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <CheckCircleIcon className="h-3.5 w-3.5" />
                      Mark {syncResult.toMarkCount} as Added
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSyncResult(null)}
                    className="rounded-[6px] p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          <section className="widget-card">
            <div className="widget-header">
              <span className="widget-header__label">
                <span className="widget-header__label--number">01</span>
                {" // COURSE REQUESTS"}
              </span>
            </div>
            <div className="p-6">
              <CourseRequestsSection
                requests={wiki!.courseRequests}
                onAdd={openAddCourse}
                onEdit={openEditCourse}
                onDelete={handleDeleteCourses}
                onSetStatus={handleSetCourseStatus}
              />
            </div>
          </section>
        </>
      );
    }

    // ── Golf Data Console (Wedge only) — the Gitwork Golf Data platform console.
    // Renders its own numbered widget cards, so it is not wrapped in one card.
    if (activeSection === "golf-data") {
      if (!GOLF_DATA_SLUGS.includes(slug)) {
        return (
          <div className="rounded-[10px] border border-dashed border-[rgba(0,0,0,0.12)] py-14 text-center">
            <p className="text-[13px] text-[var(--text-4)]">
              The Golf Data Console isn&apos;t enabled for this client.
            </p>
          </div>
        );
      }
      return <GolfDataConsoleView slug={slug} clientName={clientName} />;
    }

    // ── Documentation pages
    const page = getPage(activeSection);
    const savedContent = page?.content ?? null;
    const initialContent =
      activeSection === "api-docs"
        ? normalizeApiDocsContent(savedContent, SECTION_TITLES[activeSection])
        : typeof savedContent === "string"
          ? savedContent
          : getDefaultContent(activeSection);
    const widgetLabel = SECTION_WIDGET_LABELS[activeSection] ?? activeSection.toUpperCase();

    return (
      <>
        {/* Page-level action bar — folded into a 3-dot menu */}
        <div className="mb-4 flex h-9 items-center justify-between gap-2">
          <span
            className="text-[11px] text-[var(--text-4)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {pageSavedLabel ?? ""}
          </span>
          <ActionMenu
            items={[
              {
                key: "edit",
                label: "Edit",
                icon: PencilSquareIcon,
                onClick: () => setPageMode("edit"),
                active: pageMode === "edit",
              },
              {
                key: "preview",
                label: "Preview",
                icon: EyeIcon,
                onClick: () => setPageMode("preview"),
                active: pageMode === "preview",
              },
              {
                key: "save",
                label: upsertPage.isPending ? "Saving…" : "Save",
                icon: BookmarkSquareIcon,
                disabled: upsertPage.isPending,
                onClick: () => void editorRef.current?.save(),
              },
              {
                key: "delete",
                label: deletePage.isPending ? "Deleting…" : "Delete page",
                icon: TrashIcon,
                danger: true,
                disabled: deletePage.isPending,
                onClick: () => confirmDeletePage(activeSection),
              },
            ]}
          />
        </div>

        {/* Widget card */}
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">01</span>
              {` // ${widgetLabel}`}
            </span>
          </div>
          <div className="p-6">
            {activeSection === "api-docs" ? (
              <ApiDocsPageEditor
                key={activeSection}
                ref={editorRef}
                title={page?.title ?? SECTION_TITLES[activeSection]}
                content={initialContent}
                onSave={(title, content) => handleSavePage(activeSection, title, content)}
                mode={pageMode}
                onSaved={(label) => {
                  setPageSavedLabel(label);
                  setTimeout(() => setPageSavedLabel(null), 2000);
                }}
              />
            ) : (
              <WikiPageEditor
                key={activeSection}
                ref={editorRef}
                section={activeSection}
                title={page?.title ?? SECTION_TITLES[activeSection]}
                content={typeof initialContent === "string" ? initialContent : ""}
                isNew={!page}
                onSave={(title, content) => handleSavePage(activeSection, title, content)}
                mode={pageMode}
                onSaved={(label) => {
                  setPageSavedLabel(label);
                  setTimeout(() => setPageSavedLabel(null), 2000);
                }}
              />
            )}
          </div>
        </section>
      </>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Header */}
      <div className="widget-header sticky top-0 z-10 flex items-center justify-between border-b border-[rgba(0,0,0,0.08)] bg-white">
        <div className="flex items-center gap-3">
          <Link
            href={`/app/portal/${slug}`}
            className="flex items-center gap-1.5 text-xs text-[var(--text-4)] transition hover:text-[var(--text-1)]"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            {clientName}
          </Link>
          <span className="text-[var(--text-4)]">/</span>
          <span className="widget-header__label">
            <span className="widget-header__label--number">01</span>
            {" // WIKI"}
          </span>
        </div>
        {/* Same Light/Dark/System control as the rest of Foundry. */}
        <ThemeToggle iconOnly />
      </div>

      {/* Body — stacks on mobile (nav on top), side-by-side from md up.
          min-h-0 lets the columns own their scroll so the sidebar stays in view. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
        {/* Sidebar / mobile top-nav — pinned in view; its list scrolls internally */}
        <div className="shrink-0 border-b border-[rgba(0,0,0,0.08)] px-2 md:border-b-0 md:border-r">
          <WikiSidebar
            slug={slug}
            active={activeSection}
            onSelect={setActiveSection}
            availableSections={availableSections}
            sharedSections={sharedSections}
            addableSections={addableSections}
            onAddSection={(section) => void handleAddSection(section)}
            isAddingSection={upsertPage.isPending}
            deletableSections={availableSections.filter(
              (s) =>
                isDocsPageSection(s) ||
                s === "monitors" ||
                s === "documents" ||
                s === "intake" ||
                s === "code-handover",
            )}
            onDeleteSection={confirmDeletePage}
            isDeletingSection={deletePage.isPending}
          />
        </div>

        {/* Main content — pt-6 matches DesignSystemWorkspace's own pt-6 so action bars align */}
        <div className="min-h-0 min-w-0 flex-1 overflow-auto px-4 pt-4 pb-8 md:px-8 md:pt-6">{renderContent()}</div>
      </div>

      {/* Changelog entry form modal */}
      {showChangelogForm && (
        <ChangelogEntryForm
          platforms={wiki.platforms}
          initial={buildEditInitial()}
          onSave={handleSaveEntries}
          onClose={closeForm}
          isSaving={isSubmitting}
        />
      )}

      {/* Course request form + import modals */}
      {showCourseForm && (
        <CourseRequestForm
          initial={editingCourse ?? undefined}
          onSave={handleSaveCourse}
          onClose={closeCourseForm}
          isSaving={courseSaving}
        />
      )}
      {showCourseImport && (
        <CourseFeedbackImportModal slug={slug} onClose={() => setShowCourseImport(false)} />
      )}
      {showCourseApi && (
        <CourseApiIntakeModal slug={slug} onClose={() => setShowCourseApi(false)} />
      )}

      {/* Platform management modal */}
      {showPlatformModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-[12px] bg-white shadow-xl">
            <div className="widget-header rounded-t-[12px]">
              <span className="widget-header__label">Changelog Platforms</span>
              <button
                type="button"
                onClick={() => setShowPlatformModal(false)}
                className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6">
              <p className="mb-4 text-[13px] text-[var(--text-3)]">
                Choose which platforms appear in the changelog tabs and the &quot;Add version&quot; form.
              </p>
              <div className="space-y-3">
                {ALL_PLATFORM_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={pendingPlatforms.includes(opt.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setPendingPlatforms((prev) => [...prev, opt.value]);
                        } else {
                          // Must keep at least one platform
                          if (pendingPlatforms.length > 1) {
                            setPendingPlatforms((prev) =>
                              prev.filter((p) => p !== opt.value),
                            );
                          }
                        }
                      }}
                      className="h-4 w-4 rounded border-[var(--border-2)] accent-[var(--brand-700)]"
                    />
                    <span className="text-sm text-[var(--text-1)]">{opt.label}</span>
                  </label>
                ))}
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPlatformModal(false)}
                  className="inline-flex items-center rounded-[6px] border border-[var(--border-2)] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pendingPlatforms.length === 0 || updatePlatforms.isPending}
                  onClick={async () => {
                    await updatePlatforms.mutateAsync(pendingPlatforms);
                    setShowPlatformModal(false);
                  }}
                  className="inline-flex items-center rounded-[6px] bg-[var(--brand-700)] px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-[var(--brand-800)] disabled:opacity-60"
                >
                  {updatePlatforms.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
