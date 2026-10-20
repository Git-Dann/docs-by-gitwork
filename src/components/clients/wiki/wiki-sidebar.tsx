"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { COURSE_REQUESTS_SLUGS, GOLF_DATA_SLUGS } from "@/lib/wiki-sections";
import {
  GROUP_HEADINGS_ABOVE,
  SECTION_BLURB,
  SECTION_GROUP,
  WIKI_SECTION_GROUPS,
  groupAddable,
  type GroupedWikiSection,
  type WikiSectionGroupId,
} from "@/lib/wiki-section-groups";
import {
  BanknotesIcon,
  BoltIcon,
  BookOpenIcon,
  CalculatorIcon,
  TableCellsIcon,
  ViewColumnsIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  ChartBarSquareIcon,
  ChartPieIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleStackIcon,
  ClockIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  CubeTransparentIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  FlagIcon,
  GlobeAltIcon,
  LifebuoyIcon,
  NewspaperIcon,
  PlusIcon,
  PresentationChartLineIcon,
  RocketLaunchIcon,
  ServerStackIcon,
  Squares2X2Icon,
  TrashIcon,
  VideoCameraIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";

export type WikiSection =
  | "dashboard"
  | "timeline"
  | "monitors"
  | "documents"
  | "intake"
  | "launchpad"
  | "insights"
  | "costs"
  | "estimates"
  | "comparisons"
  | "sheets"
  | "roundup"
  | "delivery"
  | "support"
  | "metrics"
  | "meetings"
  | "platforms"
  | "code-handover"
  | "design-system"
  | "ia"
  | "dev-guide"
  | "api-docs"
  | "architecture"
  | "runbook"
  | "data-model"
  | "changelog"
  | "course-requests"
  | "golf-data"
  | "settings";

// The per-client section lists moved to `src/lib/wiki-sections.ts` so Care can import them without
// pulling a React component module in behind them. Re-exported here so existing importers are
// unchanged.
export { COURSE_REQUESTS_SLUGS, GOLF_DATA_SLUGS };

const COLLAPSED_KEY = "foundry.wiki.sidebar.collapsed.v1";

export const OPTIONAL_DOC_SECTIONS: Array<{
  section: WikiSection;
  label: string;
}> = [
  { section: "ia", label: "Info Architecture" },
  { section: "dev-guide", label: "Developer Guide" },
  { section: "api-docs", label: "API Docs" },
  { section: "architecture", label: "Architecture" },
  { section: "runbook", label: "Runbook" },
  { section: "data-model", label: "Data Model" },
];

interface Props {
  slug: string;
  active: WikiSection;
  onSelect: (section: WikiSection) => void;
  availableSections?: WikiSection[];
  /** Sections currently public (per-page share or covered by the whole-wiki link). */
  sharedSections?: WikiSection[];
  addableSections?: Array<{ section: WikiSection; label: string }>;
  onAddSection?: (section: WikiSection) => void;
  isAddingSection?: boolean;
  deletableSections?: WikiSection[];
  onDeleteSection?: (section: WikiSection) => void;
  isDeletingSection?: boolean;
}

export function WikiSidebar({
  slug,
  active,
  onSelect,
  availableSections,
  sharedSections = [],
  addableSections = [],
  onAddSection,
  isAddingSection = false,
  deletableSections = [],
  onDeleteSection,
  isDeletingSection = false,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  // Groups the reader folded away, remembered per browser. A per-person convenience, so it
  // lives in localStorage — and every read/write is guarded, because blocked storage must just
  // mean "everything open".
  const [collapsed, setCollapsed] = useState<Set<WikiSectionGroupId>>(() => new Set());
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSED_KEY);
      const ids = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(ids)) setCollapsed(new Set(ids.filter((x): x is WikiSectionGroupId => typeof x === "string")));
    } catch {
      /* storage unavailable — everything stays open */
    }
  }, []);
  function toggleGroup(id: WikiSectionGroupId) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        /* not remembered, still toggled */
      }
      return next;
    });
  }
  // Portal-positioned (fixed) so the menu escapes the sidebar's scroll/overflow
  // clipping. Positioned relative to the pinned button, opening whichever way has
  // more room, and height-capped to that room so it never runs off the viewport
  // (i.e. never disappears under the browser chrome).
  const [addPos, setAddPos] = useState<{
    up: boolean;
    top: number;
    bottom: number;
    left: number;
    width: number;
    maxH: number;
  } | null>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const addPanelRef = useRef<HTMLDivElement>(null);

  function openAddMenu() {
    const el = addBtnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    // Wide enough for a section name and its one-line description.
    const width = Math.max(r.width, 260);
    const spaceAbove = r.top - margin;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const up = spaceAbove >= spaceBelow;
    const maxH = Math.max(140, (up ? spaceAbove : spaceBelow) - 6);
    const left = Math.max(margin, Math.min(r.left, window.innerWidth - width - margin));
    setAddPos({
      up,
      top: r.bottom + 6,
      bottom: window.innerHeight - r.top + 6,
      left,
      width,
      maxH,
    });
    setAddOpen(true);
  }

  useEffect(() => {
    if (!addOpen) return;
    function handleClick(event: MouseEvent) {
      const t = event.target as Node;
      if (addBtnRef.current?.contains(t) || addPanelRef.current?.contains(t)) return;
      setAddOpen(false);
    }
    const onScroll = () => setAddOpen(false);
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [addOpen]);

  const visibleSections = new Set<WikiSection>(
    availableSections ?? [
      "dashboard",
      "timeline",
      "monitors",
      "documents",
      "intake",
      "launchpad",
      "insights",
      "costs",
      "estimates",
      "comparisons",
      "sheets",
      "roundup",
      "delivery",
      "support",
      "metrics",
      "meetings",
      "platforms",
      "code-handover",
      "design-system",
      "ia",
      "dev-guide",
      "api-docs",
      "architecture",
      "runbook",
      "data-model",
      "changelog",
      "course-requests",
      "golf-data",
    ],
  );
  visibleSections.add(active);

  const deletable = new Set(deletableSections);
  const shared = new Set(sharedSections);
  const navItem = (
    section: WikiSection,
    label: string,
    icon: ReactNode,
  ) => {
    if (!visibleSections.has(section)) return null;
    const isActive = active === section;
    const isShared = shared.has(section);
    const canDelete = deletable.has(section) && Boolean(onDeleteSection);
    // Only reserve right padding when there's a trailing control, so labels keep
    // the maximum width and avoid truncating where they'd otherwise fit.
    const hasTrailing = isShared || canDelete;
    return (
      <div key={section} className="group relative flex w-auto shrink-0 items-center md:w-full">
        <button
          type="button"
          onClick={() => onSelect(section)}
          className={[
            "flex min-w-0 flex-1 items-center gap-2.5 whitespace-nowrap rounded-[6px] py-2 pl-3 text-left text-sm transition-colors",
            hasTrailing ? "pr-8" : "pr-3",
            isActive
              ? "bg-[var(--brand-50)] font-semibold text-[var(--brand-700)] md:border-l-2 md:border-[var(--brand-700)] md:rounded-l-none"
              : "text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
          ].join(" ")}
        >
          <span className="h-4 w-4 shrink-0">{icon}</span>
          <span
            className="min-w-0 flex-1 truncate"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </span>
        </button>

        {/* Share indicator — pinned flush to the sidebar's right edge so every
            globe sits in one clean column. Hidden on hover (desktop) where the
            row is deletable, so the trash takes its place without overlapping. */}
        {isShared && (
          <GlobeAltIcon
            title="Shared publicly"
            className={[
              "pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--brand-600)]",
              canDelete ? "opacity-0 md:opacity-100 md:group-hover:opacity-0" : "",
            ].join(" ")}
          />
        )}

        {canDelete ? (
          <button
            type="button"
            onClick={() => onDeleteSection?.(section)}
            disabled={isDeletingSection}
            title={`Delete ${label}`}
            className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[6px] text-[var(--text-4)] opacity-100 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 md:opacity-0 md:group-hover:opacity-100"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    );
  };

  // Headings only pay for themselves on a long list; a short one stays flat (see
  // GROUP_HEADINGS_ABOVE). Settings and Dashboard sit outside the groups.
  const navCount = [...visibleSections].filter((x) => x !== "settings" && x !== "dashboard").length;
  const grouped = navCount > GROUP_HEADINGS_ABOVE;

  /**
   * One labelled group. Below md the sidebar is a horizontal strip, so headings are hidden and
   * a folded group's items still show (`contents md:hidden`) — folding is a desktop affordance.
   * The group holding the open section is never folded: the reader would lose their place.
   */
  const group = (id: WikiSectionGroupId, items: ReactNode[]) => {
    const shown = items.filter(Boolean);
    if (shown.length === 0) return null;
    if (!grouped) return <div key={id} className="contents">{shown}</div>;
    const label = WIKI_SECTION_GROUPS.find((g) => g.id === id)?.label ?? id;
    const holdsActive = SECTION_GROUP[active as GroupedWikiSection] === id;
    const folded = collapsed.has(id) && !holdsActive;
    return (
      <div key={id} className="contents">
        <button
          type="button"
          onClick={() => toggleGroup(id)}
          disabled={holdsActive}
          aria-expanded={!folded}
          title={holdsActive ? `${label} — the open section is in this group` : undefined}
          className="mt-3 hidden w-full items-center gap-1.5 rounded-[6px] px-3 py-1 text-left text-[var(--text-4)] transition-colors hover:text-[var(--text-2)] disabled:cursor-default disabled:hover:text-[var(--text-4)] md:flex"
          style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}
        >
          <ChevronRightIcon
            className={`h-3 w-3 shrink-0 transition-transform ${folded ? "" : "rotate-90"} ${holdsActive ? "opacity-0" : ""}`}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {folded ? <span className="shrink-0 tabular-nums">{shown.length}</span> : null}
        </button>
        <div className={folded ? "contents md:hidden" : "contents"}>{shown}</div>
      </div>
    );
  };

  const hasAddItems = addableSections.length > 0 && Boolean(onAddSection);

  return (
    <div className="flex w-full shrink-0 flex-col gap-1 py-2 md:h-full md:w-[248px] md:py-4 md:pr-2">
      {/* Horizontal scroll row on mobile, vertical list from md up. flex-1 lets
          the list grow so the pinned footer (Settings) sits at the very bottom. */}
      <div className="flex gap-1 overflow-x-auto md:min-h-0 md:flex-1 md:flex-col md:gap-0.5 md:overflow-x-visible md:overflow-y-auto">
        {navItem("dashboard", "Dashboard", <Squares2X2Icon />)}
        {group("overview", [
          navItem("timeline", "Timeline", <CalendarDaysIcon />),
          navItem("delivery", "Delivery", <ChartBarSquareIcon />),
          navItem("roundup", "RoundUp", <NewspaperIcon />),
          navItem("meetings", "Meetings", <VideoCameraIcon />),
        ])}
        {group("together", [
          navItem("intake", "Requests", <FlagIcon />),
          navItem("launchpad", "Launchpad", <RocketLaunchIcon />),
          navItem("support", "Support", <LifebuoyIcon />),
          COURSE_REQUESTS_SLUGS.includes(slug) && navItem("course-requests", "Course Requests", <FlagIcon />),
        ])}
        {group("numbers", [
          navItem("metrics", "Metrics", <PresentationChartLineIcon />),
          navItem("insights", "Charts", <ChartPieIcon />),
          navItem("sheets", "Sheets", <ViewColumnsIcon />),
          navItem("comparisons", "Comparisons", <TableCellsIcon />),
          navItem("estimates", "Estimates", <CalculatorIcon />),
          navItem("costs", "Running costs", <BanknotesIcon />),
          GOLF_DATA_SLUGS.includes(slug) && navItem("golf-data", "Golf Data", <ChartBarIcon />),
        ])}
        {group("product", [
          navItem("platforms", "Platforms", <GlobeAltIcon />),
          navItem("monitors", "Monitors", <BoltIcon />),
          navItem("changelog", "Changelog", <ClockIcon />),
          navItem("documents", "Resources", <DocumentDuplicateIcon />),
        ])}
        {group("docs", [
          navItem("design-system", "Design System", <CubeTransparentIcon />),
          navItem("code-handover", "Code Handover", <CpuChipIcon />),
          navItem("ia", "Info Architecture", <BookOpenIcon />),
          navItem("dev-guide", "Developer Guide", <CodeBracketIcon />),
          navItem("api-docs", "API Docs", <ServerStackIcon />),
          navItem("architecture", "Architecture", <DocumentTextIcon />),
          navItem("runbook", "Runbook", <WrenchScrewdriverIcon />),
          navItem("data-model", "Data Model", <CircleStackIcon />),
        ])}

        {hasAddItems && (
          <div className="relative shrink-0 md:mt-2 md:border-t md:border-[var(--border-1)] md:pt-2">
            <button
              ref={addBtnRef}
              type="button"
              onClick={() => (addOpen ? setAddOpen(false) : openAddMenu())}
              disabled={isAddingSection}
              className={[
                "flex w-auto shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[6px] border border-dashed border-[var(--border-2)] px-3 py-2 text-left text-sm transition-colors md:w-full",
                "text-[var(--text-3)] hover:border-[var(--brand-500)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] disabled:opacity-50",
              ].join(" ")}
            >
              <PlusIcon className="h-4 w-4 shrink-0" />
              <span
                className="flex-1 truncate"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                Add New
              </span>
              <ChevronDownIcon className="h-3 w-3 shrink-0 text-[var(--text-4)]" />
            </button>

            {addOpen && addPos && typeof document !== "undefined" &&
              createPortal(
                <div
                  ref={addPanelRef}
                  style={{
                    position: "fixed",
                    left: addPos.left,
                    width: addPos.width,
                    maxHeight: addPos.maxH,
                    ...(addPos.up ? { bottom: addPos.bottom } : { top: addPos.top }),
                  }}
                  className="z-[100] overflow-auto rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-[var(--surface-0)] py-1.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.24)]"
                >
                  {groupAddable(addableSections).map((g) => (
                    <div key={g.id ?? "other"} className="py-1 first:pt-0">
                      {g.label ? (
                        <p
                          className="px-3 pb-1 pt-1.5 text-[var(--text-4)]"
                          style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}
                        >
                          {g.label}
                        </p>
                      ) : null}
                      {g.items.map((item) => {
                        const blurb = SECTION_BLURB[item.section as GroupedWikiSection];
                        return (
                          <button
                            key={item.section}
                            type="button"
                            onClick={() => {
                              setAddOpen(false);
                              onAddSection?.(item.section);
                            }}
                            className="flex w-full flex-col items-start px-3 py-1.5 text-left transition hover:bg-[var(--surface-1)]"
                          >
                            <span className="text-[13px] text-[var(--text-1)]">{item.label}</span>
                            {blurb ? <span className="text-[11px] text-[var(--text-4)]">{blurb}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>,
                document.body,
              )}
          </div>
        )}
      </div>

      {/* Pinned footer — Settings anchored to the very bottom on md+. Only render
          when Settings is actually visible (staff/edit view); on the client-facing
          wiki it's hidden, so skip the whole footer — otherwise its top border
          renders as a stray divider line with no item beneath it. */}
      {visibleSections.has("settings") && (
        <div className="flex shrink-0 md:mt-2 md:border-t md:border-[var(--border-1)] md:pt-2">
          {navItem("settings", "Settings", <Cog6ToothIcon />)}
        </div>
      )}
    </div>
  );
}
