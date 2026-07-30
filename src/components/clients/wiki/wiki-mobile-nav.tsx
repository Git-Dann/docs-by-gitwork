"use client";

import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import {
  BoltIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronDownIcon,
  ChartBarIcon,
  CircleStackIcon,
  ClockIcon,
  CodeBracketIcon,
  CpuChipIcon,
  Cog6ToothIcon,
  CubeTransparentIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  FlagIcon,
  ServerStackIcon,
  Squares2X2Icon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import type { WikiSection } from "./wiki-sidebar";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

const SECTION_ICON: Record<WikiSection, IconType> = {
  dashboard: Squares2X2Icon,
  timeline: CalendarDaysIcon,
  monitors: BoltIcon,
  documents: DocumentDuplicateIcon,
  intake: FlagIcon,
  "code-handover": CpuChipIcon,
  "design-system": CubeTransparentIcon,
  ia: BookOpenIcon,
  "dev-guide": CodeBracketIcon,
  "api-docs": ServerStackIcon,
  architecture: DocumentTextIcon,
  runbook: WrenchScrewdriverIcon,
  "data-model": CircleStackIcon,
  changelog: ClockIcon,
  "course-requests": BookOpenIcon,
  "golf-data": ChartBarIcon,
  agreements: DocumentTextIcon,
  settings: Cog6ToothIcon,
};

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

/**
 * Compact wiki nav for narrow (mobile) viewports — a single menu button that
 * opens a popover list of the available sections, instead of the horizontal
 * carousel (which overflowed and was awkward to scroll on a phone). Used only
 * on the public portal; the desktop sidebar is unchanged.
 */
export function WikiMobileNav({
  sections,
  active,
  titles,
  onSelect,
}: {
  sections: WikiSection[];
  active: WikiSection;
  titles: Record<WikiSection, string>;
  onSelect: (section: WikiSection) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const ActiveIcon = SECTION_ICON[active] ?? Squares2X2Icon;

  return (
    <div ref={ref} className="relative py-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex w-full items-center gap-2.5 rounded-[8px] border border-[rgba(0,0,0,0.10)] bg-white px-3 py-2.5 text-left transition hover:bg-[var(--surface-1)]"
      >
        <ActiveIcon className="h-4 w-4 shrink-0 text-[var(--brand-700)]" />
        <span
          className="min-w-0 flex-1 truncate font-semibold uppercase text-[var(--brand-700)]"
          style={{ fontFamily: MONO, fontSize: "12px", letterSpacing: "0.05em" }}
        >
          {titles[active]}
        </span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-[var(--text-4)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-[70vh] overflow-y-auto rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-white py-1.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)]"
        >
          {sections.map((section) => {
            const Icon = SECTION_ICON[section] ?? Squares2X2Icon;
            const isActive = section === active;
            return (
              <button
                key={section}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSelect(section);
                }}
                className={[
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition",
                  isActive
                    ? "bg-[var(--brand-50)] text-[var(--brand-700)]"
                    : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span
                  className="min-w-0 flex-1 truncate uppercase"
                  style={{ fontFamily: MONO, fontSize: "11px", letterSpacing: "0.05em" }}
                >
                  {titles[section]}
                </span>
                {isActive && <CheckIcon className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
