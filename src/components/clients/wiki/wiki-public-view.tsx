"use client";

import { useState } from "react";
import type { WikiDTO } from "@/lib/api";
import { WikiSidebar, type WikiSection } from "./wiki-sidebar";
import { WikiPageEditor } from "./wiki-page-editor";
import { ChangelogSection } from "./changelog-section";
import { CourseRequestsSection } from "./course-requests-section";

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

export function WikiPublicView({
  wiki,
  onlySection,
}: {
  wiki: WikiDTO;
  /** When set, render only this one section (per-page share) — no sidebar nav. */
  onlySection?: string | null;
}) {
  const [activeSection, setActiveSection] = useState<WikiSection>(
    (onlySection as WikiSection) ?? "ia",
  );

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
          onToggleStatus={async () => {}}
          readOnly
        />
      );
    }

    if (activeSection === "course-requests") {
      return (
        <CourseRequestsSection
          requests={wiki.courseRequests}
          onDelete={async () => {}}
          onSetStatus={async () => {}}
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
        isNew={page === null}
        onSave={async () => {}}
        mode={"preview" as const}
        readOnly
      />
    );
  }

  // Per-page share: render just the one section, no sidebar nav.
  if (onlySection) {
    return <div className="overflow-auto p-4 md:p-8">{renderContent()}</div>;
  }

  return (
    <div className="flex flex-col md:flex-row">
      <div className="shrink-0 border-b border-[rgba(0,0,0,0.08)] px-2 md:border-b-0 md:border-r">
        <WikiSidebar
          slug={wiki.clientSlug}
          active={activeSection}
          onSelect={setActiveSection}
        />
      </div>
      <div className="min-w-0 flex-1 overflow-auto p-4 md:p-8">
        {renderContent()}
      </div>
    </div>
  );
}
