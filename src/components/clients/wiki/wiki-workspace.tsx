"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { WikiSidebar, type WikiSection } from "./wiki-sidebar";
import { WikiPageEditor } from "./wiki-page-editor";
import { AppStoreEditor } from "./app-store-editor";
import { ChangelogSection } from "./changelog-section";
import { ChangelogEntryForm } from "./changelog-entry-form";
import {
  useClientWiki,
  useUpsertWikiPage,
  useSetWikiShare,
  useAddChangelogEntry,
  useDeleteChangelogEntry,
} from "@/hooks/use-wiki";
type WikiPageType = "IA_GUIDE" | "DEV_API_GUIDE" | "APP_STORE_IOS" | "APP_STORE_ANDROID" | "APP_STORE_FIRESTICK" | "CUSTOM";

// Map sidebar sections → WikiPageType enum values
const SECTION_TO_TYPE: Partial<Record<WikiSection, WikiPageType>> = {
  ia: "IA_GUIDE",
  "dev-guide": "DEV_API_GUIDE",
  "app-store-ios": "APP_STORE_IOS",
  "app-store-android": "APP_STORE_ANDROID",
  "app-store-firestick": "APP_STORE_FIRESTICK",
};

const SECTION_TITLES: Record<WikiSection, string> = {
  "design-system": "Design System",
  ia: "Information Architecture",
  "dev-guide": "Developer Guide",
  "app-store-ios": "iOS App Store",
  "app-store-android": "Google Play",
  "app-store-firestick": "Amazon Fire TV",
  changelog: "Changelog",
};

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

  // Helper: find a page by type
  function getPage(section: WikiSection) {
    const type = SECTION_TO_TYPE[section];
    if (!type) return null;
    return wiki!.pages.find((p) => p.type === type) ?? null;
  }

  // Save handler for text pages (IA / Dev Guide)
  async function handleSavePage(section: WikiSection, title: string, content: string) {
    const type = SECTION_TO_TYPE[section];
    if (!type) return;
    await upsertPage.mutateAsync({ type, title, content });
  }

  // Save handler for app store pages
  async function handleSaveAppStore(section: WikiSection, content: Record<string, string>) {
    const type = SECTION_TO_TYPE[section];
    if (!type) return;
    const title = SECTION_TITLES[section];
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

  function renderContent() {
    if (activeSection === "design-system") {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="mb-4 text-sm text-[var(--text-3)]">
            The Design System lives on its own page.
          </p>
          <Link
            href={`/app/portal/${slug}/design-system`}
            className="rounded-[6px] bg-[var(--brand-700)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-800)] transition"
          >
            Open Design System →
          </Link>
        </div>
      );
    }

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

    if (activeSection === "app-store-ios" || activeSection === "app-store-android" || activeSection === "app-store-firestick") {
      const platformMap = {
        "app-store-ios": "ios",
        "app-store-android": "android",
        "app-store-firestick": "firestick",
      } as const;
      const page = getPage(activeSection);
      const content = (page?.content as Record<string, string>) ?? {};
      return (
        <AppStoreEditor
          platform={platformMap[activeSection]}
          content={content}
          onSave={(c) => handleSaveAppStore(activeSection, c)}
          isSaving={upsertPage.isPending}
        />
      );
    }

    // IA / Dev Guide — text editor
    const page = getPage(activeSection);
    const existingContent =
      typeof page?.content === "string" ? page.content : "";
    return (
      <WikiPageEditor
        title={page?.title ?? SECTION_TITLES[activeSection]}
        content={existingContent}
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
