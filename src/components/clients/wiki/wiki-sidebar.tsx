"use client";

import {
  BookOpenIcon,
  ClockIcon,
  CodeBracketIcon,
  CubeTransparentIcon,
  ShareIcon,
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
  shareEnabled: boolean;
  shareToken: string | null;
  onToggleShare: () => void;
  isTogglingShare: boolean;
}

export function WikiSidebar({
  active,
  onSelect,
  shareEnabled,
  shareToken,
  onToggleShare,
  isTogglingShare,
}: Props) {
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

  const shareUrl =
    shareToken && shareEnabled
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/wiki/${shareToken}`
      : null;

  return (
    <div className="flex w-[220px] shrink-0 flex-col gap-1 py-4 pr-2">
      {/* Sections */}
      <div className="space-y-0.5">
        {navItem("design-system", "Design System", <CubeTransparentIcon />)}
        {navItem("ia", "Info Architecture", <BookOpenIcon />)}
        {navItem("dev-guide", "Developer Guide", <CodeBracketIcon />)}
        {navItem("changelog", "Changelog", <ClockIcon />)}
      </div>

      {/* Share toggle */}
      <div className="mt-auto border-t border-[rgba(0,0,0,0.06)] pt-4">
        <button
          type="button"
          onClick={onToggleShare}
          disabled={isTogglingShare}
          className={[
            "flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-sm transition-colors",
            shareEnabled
              ? "bg-[var(--brand-700)] text-white hover:bg-[var(--brand-800)]"
              : "border border-[rgba(0,0,0,0.1)] text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
          ].join(" ")}
        >
          <ShareIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 truncate text-xs">
            {shareEnabled ? "Sharing on" : "Share wiki"}
          </span>
        </button>

        {shareUrl && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(shareUrl);
            }}
            className="mt-1 w-full truncate rounded-[6px] px-3 py-1.5 text-left text-[10px] text-[var(--text-4)] hover:bg-[var(--surface-1)] transition"
            title="Copy share link"
          >
            {shareUrl.replace(/^https?:\/\//, "")}
          </button>
        )}
      </div>
    </div>
  );
}
