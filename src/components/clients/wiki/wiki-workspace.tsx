"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { WikiSidebar, type WikiSection } from "./wiki-sidebar";
import { WikiPageEditor } from "./wiki-page-editor";
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

// Default starter templates — pre-filled when the page has never been saved
const IA_TEMPLATE = `## Overview
Describe the product's information hierarchy and navigation structure here.

## Navigation Structure
- Primary nav items
- Secondary nav / sidebar items
- Key user flows

## Content Taxonomy
List the content types, categories, and tags the product uses.

## URL Structure
Document URL patterns and routing conventions.

## Search & Discovery
How users find content — search, filters, browse.
`;

const DEV_TEMPLATE = `## Getting Started
How to clone, install, and run the project locally.

\`\`\`bash
git clone https://github.com/org/repo
npm install
npm run dev
\`\`\`

## Architecture
High-level overview of the technical stack and folder structure.

## Environment Variables
| Variable | Description | Required |
|----------|-------------|----------|
| DATABASE_URL | Postgres connection string | Yes |
| API_KEY | External API auth token | Yes |

## API Reference
Key endpoints, request shapes, and response formats.

## Deployment
Steps to deploy to staging and production.

## Key Contacts
Who to contact for access, questions, or on-call incidents.
`;

interface Props {
  slug: string;
  clientName: string;
}

export function WikiWorkspace({ slug, clientName }: Props) {
  const [activeSection, setActiveSection] = useState<WikiSection>("ia");
  const [showChangelogForm, setShowChangelogForm] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

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
    // ── Design System — embedded inline (no external link)
    if (activeSection === "design-system") {
      return (
        <div className="-mx-8 -mt-8">
          <DesignSystemWorkspace slug={slug} embedded />
        </div>
      );
    }

    // ── Changelog
    if (activeSection === "changelog") {
      return (
        <ChangelogSection
          entries={wiki!.changelog}
          onAdd={() => setShowChangelogForm(true)}
          onDelete={handleDeleteEntry}
          deletingId={deletingEntryId}
        />
      );
    }

    // ── IA / Developer Guide — rich markdown editor
    const page = getPage(activeSection);
    const savedContent = typeof page?.content === "string" ? page.content : "";
    const initialContent = savedContent || getDefaultContent(activeSection);
    return (
      <WikiPageEditor
        key={activeSection}
        section={activeSection}
        title={page?.title ?? SECTION_TITLES[activeSection]}
        content={initialContent}
        isNew={!page}
        onSave={(title, content) => handleSavePage(activeSection, title, content)}
        isSaving={upsertPage.isPending}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <div className="widget-header sticky top-0 z-10 border-b border-[rgba(0,0,0,0.08)] bg-white">
        <div className="flex items-center gap-3">
          <Link
            href={`/app/portal/${slug}`}
            className="flex items-center gap-1.5 text-xs text-[var(--text-4)] hover:text-[var(--text-1)] transition"
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
            onToggleShare={() => setShare.mutateAsync(!wiki.shareEnabled)}
            isTogglingShare={setShare.isPending}
          />
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-auto p-8">
          {renderContent()}
        </div>
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
