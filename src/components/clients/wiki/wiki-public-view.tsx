"use client";

import { useState } from "react";
import type { WikiDTO } from "@/lib/api";
import { WikiSidebar, type WikiSection } from "./wiki-sidebar";
import { WikiPageEditor } from "./wiki-page-editor";
import { ChangelogSection } from "./changelog-section";

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

export function WikiPublicView({ wiki }: { wiki: WikiDTO }) {
  const [activeSection, setActiveSection] = useState<WikiSection>("ia");

  function getPage(section: WikiSection) {
    const type = SECTION_TO_TYPE[section];
    if (!type) return null;
    return wiki.pages.find((p) => p.type === type) ?? null;
  }

  function renderContent() {
    if (activeSection === "design-system") {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm text-[var(--text-3)]">Design System is managed privately.</p>
        </div>
      );
    }

    if (activeSection === "changelog") {
      return (
        <ChangelogSection
          entries={wiki.changelog}
          onAdd={() => {}}
          onDelete={async () => {}}
          deletingId={null}
          readOnly
        />
      );
    }

    const page = getPage(activeSection);
    const existingContent = typeof page?.content === "string" ? page.content : "";
    return (
      <WikiPageEditor
        section={activeSection}
        title={page?.title ?? SECTION_TITLES[activeSection]}
        content={existingContent}
        isNew={!page}
        onSave={async () => {}}
        isSaving={false}
        readOnly
      />
    );
  }

  return (
    <div className="flex">
      <div className="shrink-0 border-r border-[rgba(0,0,0,0.08)] px-2">
        <WikiSidebar
          slug={wiki.clientSlug}
          active={activeSection}
          onSelect={setActiveSection}
          shareEnabled={false}
          shareToken={null}
          onToggleShare={() => {}}
          isTogglingShare={false}
        />
      </div>
      <div className="flex-1 overflow-auto p-8">
        {renderContent()}
      </div>
    </div>
  );
}
