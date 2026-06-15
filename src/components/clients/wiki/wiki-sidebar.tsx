"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BookOpenIcon,
  ChevronDownIcon,
  CircleStackIcon,
  ClockIcon,
  CodeBracketIcon,
  CubeTransparentIcon,
  DocumentTextIcon,
  FlagIcon,
  PlusIcon,
  ServerStackIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";

export type WikiSection =
  | "design-system"
  | "ia"
  | "dev-guide"
  | "api-docs"
  | "architecture"
  | "runbook"
  | "data-model"
  | "changelog"
  | "course-requests";

/** Course Requests is currently a Wedge-only section. */
export const COURSE_REQUESTS_SLUGS = ["wedge"];

export const OPTIONAL_DOC_SECTIONS: Array<{
  section: WikiSection;
  label: string;
}> = [
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
  addableSections?: Array<{ section: WikiSection; label: string }>;
  onAddSection?: (section: WikiSection) => void;
  isAddingSection?: boolean;
}

export function WikiSidebar({
  slug,
  active,
  onSelect,
  availableSections,
  addableSections = [],
  onAddSection,
  isAddingSection = false,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addOpen) return;
    function handleClick(event: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
        setAddOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [addOpen]);

  const visibleSections = new Set<WikiSection>(
    availableSections ?? [
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

  const navItem = (
    section: WikiSection,
    label: string,
    icon: ReactNode,
  ) => {
    if (!visibleSections.has(section)) return null;
    const isActive = active === section;
    return (
      <button
        key={section}
        type="button"
        onClick={() => onSelect(section)}
        className={[
          "flex w-auto shrink-0 items-center gap-2.5 whitespace-nowrap rounded-[6px] px-3 py-2 text-left text-sm transition-colors md:w-full",
          isActive
            ? "bg-[var(--brand-50)] font-semibold text-[var(--brand-700)] md:border-l-2 md:border-[var(--brand-700)] md:rounded-l-none"
            : "text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
        ].join(" ")}
      >
        <span className="h-4 w-4 shrink-0">{icon}</span>
        <span
          className="flex-1 truncate"
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
    );
  };

  const hasAddItems = addableSections.length > 0 && Boolean(onAddSection);

  return (
    <div className="flex w-full shrink-0 flex-col gap-1 py-2 md:w-[220px] md:py-4 md:pr-2">
      {/* Horizontal scroll row on mobile, vertical list from md up */}
      <div className="flex gap-1 overflow-x-auto md:flex-col md:gap-0 md:space-y-0.5 md:overflow-visible">
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
          <div ref={addMenuRef} className="relative shrink-0 md:mt-2 md:border-t md:border-[var(--border-1)] md:pt-2">
            <button
              type="button"
              onClick={() => setAddOpen((open) => !open)}
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

            {addOpen && (
              <div className="absolute left-0 top-full z-30 mt-1.5 w-52 overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-white py-1.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)] md:bottom-full md:top-auto md:mb-1.5 md:mt-0">
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
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
