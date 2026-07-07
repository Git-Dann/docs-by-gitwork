"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BoltIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  Cog6ToothIcon,
  GlobeAltIcon,
  CircleStackIcon,
  ClockIcon,
  CodeBracketIcon,
  CpuChipIcon,
  DocumentDuplicateIcon,
  CubeTransparentIcon,
  DocumentTextIcon,
  FlagIcon,
  PlusIcon,
  ServerStackIcon,
  Squares2X2Icon,
  TrashIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";

export type WikiSection =
  | "dashboard"
  | "timeline"
  | "monitors"
  | "documents"
  | "intake"
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
  | "settings";

/** Course Requests is currently a Wedge-only section. */
export const COURSE_REQUESTS_SLUGS = ["wedge"];

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
  // Portal-positioned (fixed) so the menu escapes the sidebar's scroll/overflow
  // clipping. Opens upward from the pinned "Add New" button.
  const [addPos, setAddPos] = useState<{ bottom: number; left: number; width: number } | null>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const addPanelRef = useRef<HTMLDivElement>(null);

  function openAddMenu() {
    const el = addBtnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAddPos({ bottom: window.innerHeight - r.top + 6, left: r.left, width: r.width });
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

  const hasAddItems = addableSections.length > 0 && Boolean(onAddSection);

  return (
    <div className="flex w-full shrink-0 flex-col gap-1 py-2 md:h-full md:w-[248px] md:py-4 md:pr-2">
      {/* Horizontal scroll row on mobile, vertical list from md up. flex-1 lets
          the list grow so the pinned footer (Settings) sits at the very bottom. */}
      <div className="flex gap-1 overflow-x-auto md:min-h-0 md:flex-1 md:flex-col md:gap-0 md:space-y-0.5 md:overflow-x-visible md:overflow-y-auto">
        {navItem("dashboard", "Dashboard", <Squares2X2Icon />)}
        {navItem("timeline", "Timeline", <CalendarDaysIcon />)}
        {navItem("monitors", "Monitors", <BoltIcon />)}
        {navItem("documents", "Documents", <DocumentDuplicateIcon />)}
        {navItem("intake", "Requests", <FlagIcon />)}
        {navItem("code-handover", "Code Handover", <CpuChipIcon />)}
        {navItem("design-system", "Design System", <CubeTransparentIcon />)}
        {navItem("ia", "Info Architecture", <BookOpenIcon />)}
        {navItem("dev-guide", "Developer Guide", <CodeBracketIcon />)}
        {navItem("api-docs", "API Docs", <ServerStackIcon />)}
        {navItem("architecture", "Architecture", <DocumentTextIcon />)}
        {navItem("runbook", "Runbook", <WrenchScrewdriverIcon />)}
        {navItem("data-model", "Data Model", <CircleStackIcon />)}
        {navItem("changelog", "Changelog", <ClockIcon />)}
        {COURSE_REQUESTS_SLUGS.includes(slug) &&
          navItem("course-requests", "Course Requests", <FlagIcon />)}

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
                  style={{ position: "fixed", bottom: addPos.bottom, left: addPos.left, width: Math.max(addPos.width, 200) }}
                  className="z-[100] max-h-[60vh] overflow-auto rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-[var(--surface-0)] py-1.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.24)]"
                >
                  {addableSections.map((item) => (
                    <button
                      key={item.section}
                      type="button"
                      onClick={() => {
                        setAddOpen(false);
                        onAddSection?.(item.section);
                      }}
                      className="flex w-full items-center px-3 py-2 text-left text-[13px] text-[var(--text-2)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>,
                document.body,
              )}
          </div>
        )}
      </div>

      {/* Pinned footer — Settings anchored to the very bottom on md+ */}
      <div className="flex shrink-0 md:mt-2 md:border-t md:border-[var(--border-1)] md:pt-2">
        {navItem("settings", "Settings", <Cog6ToothIcon />)}
      </div>
    </div>
  );
}
