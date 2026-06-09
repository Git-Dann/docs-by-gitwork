"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, PlusIcon } from "@heroicons/react/24/outline";
import { WikiSidebar, type WikiSection } from "./wiki-sidebar";
import { WikiPageEditor, type WikiPageEditorHandle } from "./wiki-page-editor";
import { ChangelogSection } from "./changelog-section";
import { ChangelogEntryForm } from "./changelog-entry-form";
import { DesignSystemWorkspace } from "@/components/clients/design-system/design-system-workspace";
import {
  useClientWiki,
  useUpsertWikiPage,
  useSetWikiShare,
  useAddChangelogEntry,
  useDeleteChangelogEntry,
} from "@/hooks/use-wiki";

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
};

const SECTION_WIDGET_LABELS: Partial<Record<WikiSection, string>> = {
  ia: "IA GUIDE",
  "dev-guide": "DEVELOPER GUIDE",
  changelog: "CHANGELOG",
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

export function WikiWorkspace({ slug, clientName }: Props) {
  const [activeSection, setActiveSection] = useState<WikiSection>("design-system");
  const [showChangelogForm, setShowChangelogForm] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

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

  async function handleDeleteEntry(id: string) {
    setDeletingEntryId(id);
    try {
      await deleteEntry.mutateAsync(id);
    } finally {
      setDeletingEntryId(null);
    }
  }

  async function handleAddEntry(payload: {
    platform: string;
    version: string;
    title: string;
    body?: string;
    releasedAt?: string;
  }) {
    await addEntry.mutateAsync(payload);
    setShowChangelogForm(false);
  }

  function getDefaultContent(section: WikiSection): string {
    if (section === "ia") return IA_TEMPLATE;
    if (section === "dev-guide") return DEV_TEMPLATE;
    return "";
  }

  function renderContent() {
    // ── Design System — embedded inline (has its own action bar)
    // -mt-6 cancels the parent pt-6 so DS workspace content starts flush at top;
    // the DS workspace itself adds its own pt-6, keeping its action bar in line.
    if (activeSection === "design-system") {
      return (
        <div className="-mx-8 -mt-6">
          <DesignSystemWorkspace slug={slug} embedded />
        </div>
      );
    }

    // ── Changelog
    if (activeSection === "changelog") {
      return (
        <>
          {/* Page-level action bar */}
          <div className="mb-5 flex items-center justify-end">
            <button
              type="button"
              onClick={() => setShowChangelogForm(true)}
              className={chipBtn}
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add version
            </button>
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
                onAdd={() => setShowChangelogForm(true)}
                onDelete={handleDeleteEntry}
                deletingId={deletingEntryId}
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

      {/* Body */}
      <div className="flex flex-1">
        {/* Sidebar */}
        <div className="shrink-0 border-r border-[rgba(0,0,0,0.08)] px-2">
          <WikiSidebar
            slug={slug}
            active={activeSection}
            onSelect={setActiveSection}
            shareEnabled={wiki.shareEnabled}
            shareToken={wiki.shareToken}
            onToggleShare={() => void setShare.mutateAsync(!wiki.shareEnabled)}
            isTogglingShare={setShare.isPending}
          />
        </div>

        {/* Main content — pt-6 matches DesignSystemWorkspace's own pt-6 so action bars align */}
        <div className="flex-1 overflow-auto px-8 pt-6 pb-8">{renderContent()}</div>
      </div>

      {/* Changelog entry form modal */}
      {showChangelogForm && (
        <ChangelogEntryForm
          onSave={handleAddEntry}
          onClose={() => setShowChangelogForm(false)}
          isSaving={addEntry.isPending}
        />
      )}
    </div>
  );
}
