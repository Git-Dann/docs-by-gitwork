"use client";

import { useState } from "react";
import {
  BookOpenIcon,
  ClockIcon,
  CodeBracketIcon,
  CubeTransparentIcon,
  ShareIcon,
  XMarkIcon,
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
  const [confirmShare, setConfirmShare] = useState(false);
  const [copied, setCopied] = useState(false);

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

  function handleShareClick() {
    if (shareEnabled) {
      // Turning off — no confirmation needed
      onToggleShare();
    } else {
      // Turning on — show confirmation first
      setConfirmShare(true);
    }
  }

  function handleConfirm() {
    setConfirmShare(false);
    onToggleShare();
  }

  function handleCopyLink() {
    if (!shareUrl) return;
    void navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex w-[220px] shrink-0 flex-col gap-1 py-4 pr-2">
      {/* Sections */}
      <div className="space-y-0.5">
        {navItem("design-system", "Design System", <CubeTransparentIcon />)}
        {navItem("ia", "Info Architecture", <BookOpenIcon />)}
        {navItem("dev-guide", "Developer Guide", <CodeBracketIcon />)}
        {navItem("changelog", "Changelog", <ClockIcon />)}
      </div>

      {/* Share section */}
      <div className="mt-auto border-t border-[rgba(0,0,0,0.06)] pt-4">

        {/* Inline confirmation — shown before enabling share */}
        {confirmShare && (
          <div className="mb-2 rounded-[8px] border border-[rgba(0,0,0,0.1)] bg-[var(--surface-0)] p-3">
            <div className="mb-2 flex items-start justify-between gap-1">
              <p className="text-[11px] font-semibold text-[var(--text-1)]">Make wiki public?</p>
              <button
                type="button"
                onClick={() => setConfirmShare(false)}
                className="rounded p-0.5 text-[var(--text-4)] hover:text-[var(--text-1)] transition"
              >
                <XMarkIcon className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-[var(--text-3)]">
              This shares the <strong className="text-[var(--text-2)]">entire wiki</strong> — Design System, IA Guide, Developer Guide, and Changelog — at a single public link. Anyone with the URL can view all pages.
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isTogglingShare}
                className="flex-1 rounded-[6px] bg-[var(--brand-700)] px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-[var(--brand-800)] disabled:opacity-50"
              >
                Enable sharing
              </button>
              <button
                type="button"
                onClick={() => setConfirmShare(false)}
                className="rounded-[6px] border border-[rgba(0,0,0,0.1)] px-2.5 py-1.5 text-[11px] text-[var(--text-3)] transition hover:bg-[var(--surface-1)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Share toggle button */}
        {!confirmShare && (
          <button
            type="button"
            onClick={handleShareClick}
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
        )}

        {/* Share link — copy button */}
        {shareUrl && !confirmShare && (
          <button
            type="button"
            onClick={handleCopyLink}
            className="mt-1 w-full truncate rounded-[6px] px-3 py-1.5 text-left text-[10px] text-[var(--text-4)] hover:bg-[var(--surface-1)] transition"
            title="Copy share link"
          >
            {copied ? "Copied ✓" : shareUrl.replace(/^https?:\/\//, "")}
          </button>
        )}
      </div>
    </div>
  );
}
