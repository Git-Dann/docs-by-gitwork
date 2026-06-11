"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  Cog6ToothIcon,
  PlusIcon,
  XMarkIcon,
  InboxArrowDownIcon,
  CodeBracketIcon,
  ArrowPathIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { WikiSidebar, type WikiSection, COURSE_REQUESTS_SLUGS } from "./wiki-sidebar";
import { WikiPageEditor, type WikiPageEditorHandle } from "./wiki-page-editor";
import { ChangelogSection } from "./changelog-section";
import { ChangelogEntryForm } from "./changelog-entry-form";
import { CourseRequestsSection } from "./course-requests-section";
import { CourseRequestForm, type CourseRequestPayload } from "./course-request-form";
import { CourseFeedbackImportModal } from "./course-feedback-import-modal";
import { CourseApiIntakeModal } from "./course-api-intake-modal";
import { WikiShareMenu } from "./wiki-share-menu";
import { DesignSystemWorkspace } from "@/components/clients/design-system/design-system-workspace";
import {
  useClientWiki,
  useUpsertWikiPage,
  useSetWikiShare,
  useAddChangelogEntry,
  useDeleteChangelogEntry,
  useUpdateWikiPlatforms,
  useUpdateEntryStatus,
  useUpdateChangelogEntry,
  useSetWikiSectionShare,
  useAddCourseRequest,
  useUpdateCourseRequest,
  useDeleteCourseRequest,
  useSyncBigWedgeStatus,
} from "@/hooks/use-wiki";
import type { BigWedgeSyncResult } from "@/lib/api";
import type { ChangelogEntryPayload, ChangelogEditInitial } from "./changelog-entry-form";
import type { CourseRequestRecord } from "@/lib/api";

type WikiPageType = "IA_GUIDE" | "DEV_API_GUIDE" | "CUSTOM";

const SECTION_TO_TYPE: Partial<Record<WikiSection, WikiPageType>> = {
  ia: "IA_GUIDE",
  "dev-guide": "DEV_API_GUIDE",
};

const SECTION_TITLES: Record<WikiSection, string> = {
  "design-system": "Design System",
  ia: "Information Architecture",
  "dev-guide": "Developer Guide",
  changelog: "Changelog",
  "course-requests": "Course Requests",
};

const SECTION_WIDGET_LABELS: Partial<Record<WikiSection, string>> = {
  ia: "IA GUIDE",
  "dev-guide": "DEVELOPER GUIDE",
  changelog: "CHANGELOG",
  "course-requests": "COURSE REQUESTS",
};

const chipBtn =
  "inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1.5 text-[13px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-50";

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

export function WikiWorkspace({ slug, clientName }: Props) {
  const [activeSection, setActiveSection] = useState<WikiSection>("design-system");
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
    setPageMode("edit");
    setPageSavedLabel(null);
  }, [activeSection]);

  const { data: wiki, isPending } = useClientWiki(slug);
  const upsertPage = useUpsertWikiPage(slug);
  const setShare = useSetWikiShare(slug);
  const addEntry = useAddChangelogEntry(slug);
  const deleteEntry = useDeleteChangelogEntry(slug);
  const updatePlatforms = useUpdateWikiPlatforms(slug);
  const updateStatus = useUpdateEntryStatus(slug);
  const updateEntry = useUpdateChangelogEntry(slug);
  const sectionShare = useSetWikiSectionShare(slug);
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

  function getPage(section: WikiSection) {
    const type = SECTION_TO_TYPE[section];
    if (!type) return null;
    return wiki!.pages.find((p) => p.type === type) ?? null;
  }

  async function handleSavePage(section: WikiSection, title: string, content: string) {
    const type = SECTION_TO_TYPE[section];
    if (!type) return;
    await upsertPage.mutateAsync({ type, title, content });
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

  function getDefaultContent(section: WikiSection): string {
    if (section === "ia") return IA_TEMPLATE;
    if (section === "dev-guide") return DEV_TEMPLATE;
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

  /** Share dropdown for a wiki page — per-page link + whole-wiki link. */
  function renderShareMenu(section: "ia" | "dev-guide" | "changelog" | "course-requests") {
    return (
      <WikiShareMenu
        pageLabel={SECTION_TITLES[section]}
        pageToken={(wiki!.pageShares?.[section] as string | undefined) ?? null}
        pageBusy={sectionShare.isPending}
        onTogglePage={(enabled) => void sectionShare.mutateAsync({ section, enabled })}
        wikiEnabled={wiki!.shareEnabled}
        wikiToken={wiki!.shareToken}
        wikiBusy={setShare.isPending}
        onToggleWiki={(enabled) => void setShare.mutateAsync(enabled)}
      />
    );
  }

  function renderContent() {
    // ── Design System — embedded inline (has its own action bar)
    // -mt-6 cancels the parent pt-6 so DS workspace content starts flush at top;
    // the DS workspace itself adds its own pt-6, keeping its action bar in line.
    if (activeSection === "design-system") {
      return (
        <div className="-mx-4 -mt-4 md:-mx-8 md:-mt-6">
          <DesignSystemWorkspace
            slug={slug}
            embedded
            wikiShare={{
              enabled: wiki!.shareEnabled,
              token: wiki!.shareToken,
              busy: setShare.isPending,
              onToggle: (enabled) => void setShare.mutateAsync(enabled),
            }}
          />
        </div>
      );
    }

    // ── Changelog
    if (activeSection === "changelog") {
      const wikiPlatforms = wiki!.platforms;
      return (
        <>
          {/* Page-level action bar */}
          <div className="mb-5 flex flex-wrap items-center justify-end gap-2">
            {/* Platform settings gear */}
            <button
              type="button"
              onClick={() => {
                setPendingPlatforms(wikiPlatforms);
                setShowPlatformModal(true);
              }}
              className={chipBtn}
              title="Manage platforms"
            >
              <Cog6ToothIcon className="h-3.5 w-3.5" />
              Platforms
            </button>
            <button
              type="button"
              onClick={openAddForm}
              className={chipBtn}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add version
            </button>
            {renderShareMenu("changelog")}
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
          <div className="mb-5 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCourseImport(true)}
              className={chipBtn}
              title="Import from support feedback"
            >
              <InboxArrowDownIcon className="h-3.5 w-3.5" />
              Import from feedback
            </button>
            <button
              type="button"
              onClick={() => setShowCourseApi(true)}
              className={chipBtn}
              title="Inbound course-request API"
            >
              <CodeBracketIcon className="h-3.5 w-3.5" />
              API intake
            </button>
            <button type="button" onClick={openAddCourse} className={chipBtn}>
              <PlusIcon className="h-3.5 w-3.5" />
              Add request
            </button>
            <button
              type="button"
              onClick={() => {
                setSyncResult(null);
                syncMutation.mutate(
                  { dryRun: true },
                  { onSuccess: (data) => setSyncResult(data) },
                );
              }}
              disabled={syncMutation.isPending}
              className={chipBtn}
              title="Sync action_taken status from Big Wedge API"
            >
              <ArrowPathIcon
                className={`h-3.5 w-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`}
              />
              {syncMutation.isPending ? "Syncing…" : "Sync status"}
            </button>
            {renderShareMenu("course-requests")}
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
                      No new requests to mark as Added — {syncResult.actionTakenCount} actioned on Big Wedge,
                      none matched unresolved records here.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-[var(--color-text-primary)] mb-2">
                        <span className="font-semibold">{syncResult.toMarkCount}</span>{" "}
                        {syncResult.toMarkCount === 1 ? "request" : "requests"} would be marked{" "}
                        <span className="font-semibold text-emerald-600">ADDED</span>
                        {" "}({syncResult.actionTakenCount} total actioned on Big Wedge side, {syncResult.totalFetched} fetched).
                      </p>
                      {syncResult.sample.length > 0 && (
                        <ul className="mb-2 space-y-0.5">
                          {syncResult.sample.map((s, i) => (
                            <li key={i} className="font-mono text-xs text-[var(--color-text-secondary)] truncate">
                              {s.courseName}{s.country ? ` · ${s.country}` : ""}
                            </li>
                          ))}
                          {syncResult.toMarkCount > syncResult.sample.length && (
                            <li className="font-mono text-xs text-[var(--color-text-tertiary)]">
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

    // ── IA / Developer Guide — rich markdown editor
    const page = getPage(activeSection);
    const savedContent = typeof page?.content === "string" ? page.content : "";
    const initialContent = savedContent || getDefaultContent(activeSection);
    const widgetLabel = SECTION_WIDGET_LABELS[activeSection] ?? activeSection.toUpperCase();

    return (
      <>
        {/* Page-level action bar — mirrors the DS workspace pattern */}
        <div className="mb-5 flex items-center justify-end gap-2">
          {pageSavedLabel && (
            <span
              className="text-[11px] text-[var(--text-4)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {pageSavedLabel}
            </span>
          )}

          {/* Edit | Preview segmented toggle */}
          <div className="flex overflow-hidden rounded-[6px] border border-[var(--border-2)]">
            <button
              type="button"
              onClick={() => setPageMode("edit")}
              className={[
                "px-3 py-1.5 text-[13px] font-medium transition",
                pageMode === "edit"
                  ? "bg-[var(--text-1)] text-white"
                  : "bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
              ].join(" ")}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setPageMode("preview")}
              className={[
                "border-l border-[var(--border-2)] px-3 py-1.5 text-[13px] font-medium transition",
                pageMode === "preview"
                  ? "bg-[var(--text-1)] text-white"
                  : "bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
              ].join(" ")}
            >
              Preview
            </button>
          </div>

          {/* Save */}
          <button
            type="button"
            onClick={() => void editorRef.current?.save()}
            disabled={upsertPage.isPending}
            className={chipBtn}
          >
            {upsertPage.isPending ? "Saving…" : "Save"}
          </button>
          {(activeSection === "ia" || activeSection === "dev-guide") &&
            renderShareMenu(activeSection)}
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
            <WikiPageEditor
              key={activeSection}
              ref={editorRef}
              section={activeSection}
              title={page?.title ?? SECTION_TITLES[activeSection]}
              content={initialContent}
              isNew={!page}
              onSave={(title, content) => handleSavePage(activeSection, title, content)}
              mode={pageMode}
              onSaved={(label) => {
                setPageSavedLabel(label);
                // Clear after 2s
                setTimeout(() => setPageSavedLabel(null), 2000);
              }}
            />
          </div>
        </section>
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <div className="widget-header sticky top-0 z-10 border-b border-[rgba(0,0,0,0.08)] bg-white">
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
      </div>

      {/* Body — stacks on mobile (nav on top), side-by-side from md up */}
      <div className="flex min-w-0 flex-1 flex-col md:flex-row">
        {/* Sidebar / mobile top-nav */}
        <div className="shrink-0 border-b border-[rgba(0,0,0,0.08)] px-2 md:border-b-0 md:border-r">
          <WikiSidebar
            slug={slug}
            active={activeSection}
            onSelect={setActiveSection}
          />
        </div>

        {/* Main content — pt-6 matches DesignSystemWorkspace's own pt-6 so action bars align */}
        <div className="min-w-0 flex-1 overflow-auto px-4 pt-4 pb-8 md:px-8 md:pt-6">{renderContent()}</div>
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
