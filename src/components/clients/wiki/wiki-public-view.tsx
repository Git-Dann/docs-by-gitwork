"use client";

import { useState, useCallback } from "react";
import type { WikiDTO } from "@/lib/api";
import { WikiSidebar, COURSE_REQUESTS_SLUGS, type WikiSection } from "./wiki-sidebar";
import { WikiMobileNav } from "./wiki-mobile-nav";
import { WikiPageEditor } from "./wiki-page-editor";
import { ApiDocsReference, normalizeApiDocsContent } from "./api-docs-page-editor";
import { ChangelogSection } from "./changelog-section";
import { CourseRequestsSection } from "./course-requests-section";
import { WikiIntakeSection } from "./wiki-intake-section";
import { WikiTimelineSection } from "./wiki-timeline-section";
import { WikiDashboard } from "./wiki-dashboard";
import { DesignSystemViewer } from "@/components/clients/design-system/design-system-viewer";
import { MonitorStatusBoard } from "./monitors-section";
import { DocumentsList } from "./documents-section";
import { apiFetch } from "@/lib/api";

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
  initialSection,
  token,
}: {
  wiki: WikiDTO;
  /** When set, render only this one section (per-page share) — no sidebar nav. */
  onlySection?: string | null;
  /** Optional deep-link (?section=) to open the whole-wiki view on a section. */
  initialSection?: string | null;
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
  const availableSections: WikiSection[] = [
    // Dashboard is always the public landing — a visual overview that links into
    // whatever sections exist below.
    "dashboard",
    ...(hasTimeline ? (["timeline"] as const) : []),
    ...(wiki.monitors.enabled && wiki.monitors.monitors.some((m) => m.enabled)
      ? (["monitors"] as const)
      : []),
    ...(wiki.documents.enabled && wiki.documents.documents.length > 0
      ? (["documents"] as const)
      : []),
    ...(wiki.intakeEnabled ? (["intake"] as const) : []),
    ...(wiki.designSystem ? (["design-system"] as const) : []),
    ...existingDocSections,
    ...(wiki.changelog.length > 0 ? (["changelog"] as const) : []),
    ...(COURSE_REQUESTS_SLUGS.includes(wiki.clientSlug)
      ? (["course-requests"] as const)
      : []),
  ];
  // Whole-wiki share opens on the Dashboard (the headline overview); per-page
  // shares open on their one section; a ?section= deep-link opens on that section
  // when it exists (else falls back to the Dashboard).
  const deepLink =
    initialSection && availableSections.includes(initialSection as WikiSection)
      ? (initialSection as WikiSection)
      : null;
  const [activeSection, setActiveSection] = useState<WikiSection>(
    (onlySection as WikiSection) ?? deepLink ?? "dashboard",
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

    if (activeSection === "monitors") {
      return <MonitorStatusBoard monitors={wiki.monitors.monitors} />;
    }

    if (activeSection === "documents") {
      return <DocumentsList documents={wiki.documents.documents} fileBase={`/api/wiki/${token}`} />;
    }

    if (activeSection === "intake") {
      return <WikiIntakeSection slug={wiki.clientSlug} token={token} items={wiki.intakeItems} mode="public" />;
    }

    if (activeSection === "design-system") {
      if (!wiki.designSystem) return null;
      return (
        <DesignSystemViewer
          tokens={wiki.designSystem.tokens}
          clientLogoUrl={wiki.designSystem.logoUrl}
          showFoundryBranding={wiki.designSystem.showFoundryBranding}
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
      {/* Mobile: a single menu button + popover (replaces the old carousel). */}
      <div className="shrink-0 border-b border-[rgba(0,0,0,0.08)] px-3 md:hidden">
        <WikiMobileNav
          sections={availableSections}
          active={activeSection}
          titles={SECTION_TITLES}
          onSelect={setActiveSection}
        />
      </div>
      {/* Desktop: the vertical sidebar. */}
      <div className="hidden shrink-0 px-2 md:block md:border-r md:border-[rgba(0,0,0,0.08)]">
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
