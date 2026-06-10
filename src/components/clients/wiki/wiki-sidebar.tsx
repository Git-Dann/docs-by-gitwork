"use client";

import {
  BookOpenIcon,
  ClockIcon,
  CodeBracketIcon,
  CubeTransparentIcon,
  FlagIcon,
} from "@heroicons/react/24/outline";

export type WikiSection =
  | "design-system"
  | "ia"
  | "dev-guide"
  | "changelog"
  | "course-requests";

/** Course Requests is currently a Wedge-only section. */
export const COURSE_REQUESTS_SLUGS = ["wedge"];

interface Props {
  slug: string;
  active: WikiSection;
  onSelect: (section: WikiSection) => void;
}

export function WikiSidebar({ slug, active, onSelect }: Props) {
  const navItem = (
    section: WikiSection,
    label: string,
    icon: React.ReactNode,
  ) => {
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

  return (
    <div className="flex w-full shrink-0 flex-col gap-1 py-2 md:w-[220px] md:py-4 md:pr-2">
      {/* Horizontal scroll row on mobile, vertical list from md up */}
      <div className="flex gap-1 overflow-x-auto md:flex-col md:gap-0 md:space-y-0.5 md:overflow-visible">
        {navItem("design-system", "Design System", <CubeTransparentIcon />)}
        {navItem("ia", "Info Architecture", <BookOpenIcon />)}
        {navItem("dev-guide", "Developer Guide", <CodeBracketIcon />)}
        {navItem("changelog", "Changelog", <ClockIcon />)}
        {COURSE_REQUESTS_SLUGS.includes(slug) &&
          navItem("course-requests", "Course Requests", <FlagIcon />)}
      </div>
    </div>
  );
}
