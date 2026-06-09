"use client";

import {
  BookOpenIcon,
  ClockIcon,
  CodeBracketIcon,
  CubeTransparentIcon,
} from "@heroicons/react/24/outline";

export type WikiSection =
  | "design-system"
  | "ia"
  | "dev-guide"
  | "changelog";

interface Props {
  slug: string;
  active: WikiSection;
  onSelect: (section: WikiSection) => void;
}

export function WikiSidebar({ active, onSelect }: Props) {
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
          "flex w-full items-center gap-2.5 rounded-[6px] px-3 py-2 text-left text-sm transition-colors",
          isActive
            ? "bg-[var(--brand-50)] font-semibold text-[var(--brand-700)] border-l-2 border-[var(--brand-700)] rounded-l-none"
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
    <div className="flex w-[220px] shrink-0 flex-col gap-1 py-4 pr-2">
      <div className="space-y-0.5">
        {navItem("design-system", "Design System", <CubeTransparentIcon />)}
        {navItem("ia", "Info Architecture", <BookOpenIcon />)}
        {navItem("dev-guide", "Developer Guide", <CodeBracketIcon />)}
        {navItem("changelog", "Changelog", <ClockIcon />)}
      </div>
    </div>
  );
}
