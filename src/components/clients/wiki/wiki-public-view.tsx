"use client";

import { useState, useCallback } from "react";
import type { WikiDTO } from "@/lib/api";
import { WikiSidebar, COURSE_REQUESTS_SLUGS, type WikiSection } from "./wiki-sidebar";
import { WikiPageEditor } from "./wiki-page-editor";
import { ApiDocsReference, normalizeApiDocsContent } from "./api-docs-page-editor";
import { ChangelogSection } from "./changelog-section";
import { CourseRequestsSection } from "./course-requests-section";
import { WikiTimelineSection } from "./wiki-timeline-section";
import { WikiDashboard } from "./wiki-dashboard";
import { DesignSystemViewer } from "@/components/clients/design-system/design-system-viewer";
import { SystemStatusEditor } from "./system-status-editor";
import { parseSystemStatus } from "@/lib/wiki/system-status";
import { apiFetch } from "@/lib/api";

type WikiPageType =
  | "IA_GUIDE"
  | "DEV_API_GUIDE"
  | "API_DOCS"
  | "ARCHITECTURE"
  | "RUNBOOK"
  | "DATA_MODEL"
  | "SYSTEM_STATUS"
  | "CUSTOM";

const SECTION_TO_TYPE: Partial<Record<WikiSection, WikiPageType>> = {
  ia: "IA_GUIDE",
  "dev-guide": "DEV_API_GUIDE",
  "api-docs": "API_DOCS",
  architecture: "ARCHITECTURE",
  runbook: "RUNBOOK",
  "data-model": "DATA_MODEL",
  "system-status": "SYSTEM_STATUS",
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
  "system-status": "System Status",
  "design-system": "Design System",
  ia: "Information Architecture",
  "dev-guide": "Developer Guide",
  "api-docs": "API Docs",
  architecture: "Architecture",
  runbook: "Runbook",
  "data-model": "Data Model",
  changelog: "Changelog",
  "course-requests": "Course Requests",
};

// JetBrains Mono stack — consistent with wiki-workspace.tsx
const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

export function WikiPublicView({
  wiki,
  onlySection,
  token,
}: {
  wiki: WikiDTO;
  /** When set, render only this one section (per-page share) — no sidebar nav. */
  onlySection?: string | null;
  /** The share token from the URL — used to authenticate mutations on the public view. */
  token: string;
}) {
  // The public portal only surfaces sections that have real content. Empty doc
  // pages and the privately-managed Design System are hidden so the client never
  // lands on a blank or dead-end page (per Dan, June 2026).
  const hiddenSections = new Set(wiki.hiddenSections ?? []);
  const existingDocSections = wiki.pages
    .map((page) => TYPE_TO_SECTION[page.type as WikiPageType])
    .filter((section): section is WikiSection => {
      if (!section) return false;
      return !hiddenSections.has(section);
    });
  const hasTimeline =
    wiki.timeline.blocks.length > 0 || wiki.timeline.milestones.length > 0;
  const statusSystems = parseSystemStatus(
    wiki.pages.find((p) => p.type === "SYSTEM_STATUS")?.content,
  ).systems;
  const availableSections: WikiSection[] = [
    // Dashboard is always the public landing — a visual overview that links into
    // whatever sections exist below.
    "dashboard",
    ...(hasTimeline ? (["timeline"] as const) : []),
    ...(statusSystems.length > 0 ? (["system-status"] as const) : []),
    ...(wiki.designSystem ? (["design-system"] as const) : []),
    ...existingDocSections,
    ...(wiki.changelog.length > 0 ? (["changelog"] as const) : []),
    ...(COURSE_REQUESTS_SLUGS.includes(wiki.clientSlug)
      ? (["course-requests"] as const)
      : []),
  ];
  // Whole-wiki share opens on the Dashboard (the headline overview); per-page
  // shares open on their one section.
  const [activeSection, setActiveSection] = useState<WikiSection>(
    (onlySection as WikiSection) ?? "dashboard",
  );
  const [courseRequests, setCourseRequests] = useState(wiki.courseRequests);

  const handleSetStatus = useCallback(
    async (ids: string[], status: string) => {
      await Promise.all(
        ids.map((id) =>
          apiFetch(`/api/wiki/${token}/course-requests/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          }),
        ),
      );
      setCourseRequests((prev) =>
        prev.map((r) => (ids.includes(r.id) ? { ...r, status } : r)),
      );
    },
    [token],
  );

  const handleDelete = useCallback(
    async (ids: string[]) => {
      await Promise.all(
        ids.map((id) =>
          apiFetch(`/api/wiki/${token}/course-requests/${id}`, { method: "DELETE" }),
        ),
      );
      setCourseRequests((prev) => prev.filter((r) => !ids.includes(r.id)));
    },
    [token],
  );

  function getPage(section: WikiSection) {
    const type = SECTION_TO_TYPE[section];
    if (!type) return null;
    return wiki.pages.find((p) => p.type === type) ?? null;
  }

  function renderContent() {
    if (activeSection === "dashboard") {
      return (
        <WikiDashboard
          wiki={wiki}
          availableSections={availableSections}
          onSelect={setActiveSection}
        />
      );
    }

    if (activeSection === "timeline") {
      return <WikiTimelineSection timeline={wiki.timeline} />;
    }

    if (activeSection === "system-status") {
      const page = wiki.pages.find((p) => p.type === "SYSTEM_STATUS");
      return <SystemStatusEditor content={page?.content} readOnly />;
    }

    if (activeSection === "design-system") {
      if (!wiki.designSystem) return null;
      return (
        <DesignSystemViewer
          tokens={wiki.designSystem.tokens}
          clientLogoUrl={wiki.designSystem.logoUrl}
        />
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
        <section className="widget-card">
          <div className="widget-header">
            <span className="widget-header__label" style={{ fontFamily: MONO }}>
              <span className="widget-header__label--number">01</span>
              {" // COURSE REQUESTS"}
            </span>
          </div>
          <div className="p-6">
            <CourseRequestsSection
              requests={courseRequests}
              onDelete={handleDelete}
              onSetStatus={handleSetStatus}
            />
          </div>
        </section>
      );
    }

    const page = getPage(activeSection);
    if (activeSection === "api-docs") {
      return (
        <ApiDocsReference
          content={normalizeApiDocsContent(page?.content, page?.title ?? SECTION_TITLES[activeSection])}
        />
      );
    }
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
    return <div className="flex-1 overflow-auto p-4 md:p-8">{renderContent()}</div>;
  }

  return (
    // flex-1 lets this row fill the <main> height so the sidebar divider spans fully.
    <div className="flex flex-1 flex-col md:flex-row">
      <div className="shrink-0 border-b border-[rgba(0,0,0,0.08)] px-2 md:border-b-0 md:border-r">
        <WikiSidebar
          slug={wiki.clientSlug}
          active={activeSection}
          onSelect={setActiveSection}
          availableSections={availableSections}
        />
      </div>
      <div className="min-w-0 flex-1 overflow-auto p-4 md:p-8">
        {renderContent()}
      </div>
    </div>
  );
}
