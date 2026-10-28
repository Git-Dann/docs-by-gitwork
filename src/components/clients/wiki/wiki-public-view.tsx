"use client";

import { useState, useCallback } from "react";
import type { WikiDTO } from "@/lib/api";
import { WikiSidebar, type WikiSection } from "./wiki-sidebar";
import { WikiMobileNav } from "./wiki-mobile-nav";
import { WikiPageEditor } from "./wiki-page-editor";
import { ApiDocsReference, normalizeApiDocsContent } from "./api-docs-page-editor";
import { ChangelogSection } from "./changelog-section";
import { CourseRequestsSection } from "./course-requests-section";
import { WikiIntakeSection } from "./wiki-intake-section";
import { LaunchpadSection } from "@/components/clients/launchpad/launchpad-section";
import { WikiInsightsSectionView } from "@/components/clients/insights/insights-section";
import { WikiDeliverySection } from "@/components/clients/wiki/wiki-delivery-section";
import { WikiCostsSection } from "./wiki-costs-section";
import { WikiEstimatesSection } from "./wiki-estimates-section";
import { isPlannable } from "@/lib/wiki-estimates";
import { WikiComparisonsSectionView } from "./wiki-comparisons-section";
import { WikiSheetsSectionView } from "./wiki-sheets-section";
import { isPublishable as isPublishableComparison } from "@/lib/wiki-comparisons";
import { WikiRoundupSection } from "./wiki-roundup-section";
import { WikiSupportSectionView } from "@/components/clients/wiki/wiki-support-section";
import { WikiMetricsSectionView } from "@/components/clients/wiki/wiki-metrics-section";
import { WikiMeetingsSectionView } from "@/components/clients/wiki/wiki-meetings-section";
import { WikiPlatformsSectionView } from "@/components/clients/wiki/wiki-platforms-section";
import { WikiBlockersSection } from "./wiki-blockers-section";
import { WikiCodeSection } from "./wiki-code-section";
import { WikiTimelineSection } from "./wiki-timeline-section";
import { WikiDashboard } from "./wiki-dashboard";
import { DesignSystemViewer } from "@/components/clients/design-system/design-system-viewer";
import { MonitorStatusBoard } from "./monitors-section";
import { DocumentsList } from "./documents-section";
import { apiFetch } from "@/lib/api";
import { clientVisibleSections } from "@/lib/wiki-client-visibility";
import { isDocPageSection } from "@/lib/wiki-section-groups";
import { WikiDocTabs } from "./wiki-doc-tabs";

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


const SECTION_TITLES: Record<WikiSection, string> = {
  dashboard: "Dashboard",
  settings: "Settings",
  timeline: "Timeline",
  monitors: "Monitors",
  documents: "Resources",
  intake: "Requests",
  launchpad: "Launchpad",
  insights: "Charts",
  costs: "Running costs",
  estimates: "Estimates",
  comparisons: "Comparisons",
  sheets: "Sheets",
  roundup: "RoundUp",
  delivery: "Delivery",
  support: "Support",
  metrics: "Metrics",
  meetings: "Meetings",
  platforms: "Platforms",
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
  // Which sections the client sees — one rule, shared with the internal wiki's
  // "not shown to client" marker (`src/lib/wiki-client-visibility.ts`).
  const availableSections: WikiSection[] = clientVisibleSections(wiki);
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
      return (
        <DocumentsList
          documents={wiki.documents.documents}
          fileBase={`/api/wiki/${token}`}
          drive={wiki.drive}
          driveTarget={{ mode: "public", token }}
        />
      );
    }

    if (activeSection === "intake") {
      return (
        <>
          <WikiBlockersSection blockers={wiki.blockers} mode="public" token={token} />
          {wiki.intakeEnabled ? (
            <WikiIntakeSection
              slug={wiki.clientSlug}
              token={token}
              items={wiki.intakeItems}
              mode="public"
              categories={wiki.intakeCategories}
              firstNumber={wiki.blockers.length > 0 ? 2 : 1}
            />
          ) : null}
        </>
      );
    }

    if (activeSection === "delivery") {
      return (
        <WikiDeliverySection
          blocks={wiki.timeline.blocks}
          milestones={wiki.timeline.milestones}
          blockers={wiki.blockers}
         unassigned={wiki.timeline.unassigned} />
      );
    }
    if (activeSection === "metrics") {
      return <WikiMetricsSectionView metrics={wiki.metrics} />;
    }
    if (activeSection === "meetings") {
      return <WikiMeetingsSectionView meetings={wiki.meetings} />;
    }
    if (activeSection === "platforms") {
      return <WikiPlatformsSectionView platforms={wiki.clientPlatforms} />;
    }
    if (activeSection === "support") {
      return <WikiSupportSectionView support={wiki.support} />;
    }
    if (activeSection === "roundup") {
      return (
        <WikiRoundupSection
          blocks={wiki.timeline.blocks}
          milestones={wiki.timeline.milestones}
          blockers={wiki.blockers}
          unassigned={wiki.timeline.unassigned}
        />
      );
    }
    if (activeSection === "costs") {
      return <WikiCostsSection slug={wiki.clientSlug} model={wiki.costs} mode="public" />;
    }
    if (activeSection === "sheets") {
      return (
        <WikiSheetsSectionView
          slug={wiki.clientSlug}
          token={token}
          section={{ ...wiki.sheets, sheets: wiki.sheets.sheets.filter((s) => s.columns.length > 0) }}
          mode="public"        />
      );
    }
    if (activeSection === "comparisons") {
      return (
        <WikiComparisonsSectionView
          slug={wiki.clientSlug}
          section={{
            ...wiki.comparisons,
            comparisons: wiki.comparisons.comparisons.filter(isPublishableComparison),
          }}
          mode="public"
        />
      );
    }
    if (activeSection === "estimates") {
      return (
        <WikiEstimatesSection
          slug={wiki.clientSlug}
          // Only the estimates that have a timeline: a client must never land on one
          // that reads "still being put together".
          section={{ ...wiki.estimates, estimates: wiki.estimates.estimates.filter(isPlannable) }}
          mode="public"
        />
      );
    }
    if (activeSection === "insights") {
      return (
        <WikiInsightsSectionView slug={wiki.clientSlug} boards={wiki.insights.boards} mode="public" />
      );
    }
    if (activeSection === "launchpad") {
      if (!wiki.launchpad) return null;
      return (
        <LaunchpadSection
          launchpad={wiki.launchpad}
          slug={wiki.clientSlug}
          token={token}
          mode="public"
        />
      );
    }

    if (activeSection === "code-handover") {
      return <WikiCodeSection slug={wiki.clientSlug} section={wiki.codeHandover} mode="public" />;
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
    // Tabs between the doc pages the client can see. Not on a single-page share: the other
    // pages were not shared, so offering them would be offering links that go nowhere.
    const docTabs = (
      <WikiDocTabs
        sections={onlySection ? [] : availableSections.filter(isDocPageSection)}
        active={activeSection}
        titles={SECTION_TITLES}
        onSelect={setActiveSection}
      />
    );
    if (activeSection === "api-docs") {
      return (
        <>
          {docTabs}
          <ApiDocsReference
            content={normalizeApiDocsContent(page?.content, page?.title ?? SECTION_TITLES[activeSection])}
          />
        </>
      );
    }
    const existingContent = typeof page?.content === "string" ? page.content : "";
    return (
      <>
        {docTabs}
        <WikiPageEditor
          section={activeSection}
          title={page?.title ?? SECTION_TITLES[activeSection]}
          content={existingContent}
          isNew={page === null}
          onSave={async () => {}}
          mode={"preview" as const}
          readOnly
        />
      </>
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
