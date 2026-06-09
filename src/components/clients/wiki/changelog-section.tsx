"use client";

import { useState } from "react";
import {
  PlusIcon,
  TrashIcon,
  PencilSquareIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import type { ChangelogEntryRecord } from "@/lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  IOS: "iOS",
  ANDROID: "Android",
  FIRESTICK: "Fire TV",
  WEB: "Web",
  ALL: "All",
};

const PLATFORM_COLORS: Record<string, { bg: string; text: string }> = {
  IOS: { bg: "#f5f5f7", text: "#1a1a1a" },
  ANDROID: { bg: "#f0fdf4", text: "#166534" },
  FIRESTICK: { bg: "#fff7ed", text: "#c45500" },
  WEB: { bg: "#eff6ff", text: "#1D4ED8" },
  ALL: { bg: "#f8fafc", text: "#475569" },
};

const SEMVER_STYLES = {
  MAJOR: "bg-red-50 text-red-700 border border-red-200",
  MINOR: "bg-amber-50 text-amber-700 border border-amber-200",
  PATCH: "bg-emerald-50 text-emerald-700 border border-emerald-200",
};

const MONO = "var(--font-mono), 'SF Mono', Menlo, Consolas, monospace";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSemverType(v: string): "MAJOR" | "MINOR" | "PATCH" | null {
  const match = v.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  const minor = parseInt(match[2], 10);
  const patch = parseInt(match[3], 10);
  if (patch === 0 && minor === 0) return "MAJOR";
  if (patch === 0) return "MINOR";
  return "PATCH";
}

/** Convert markdown body to plain text for App Store / Play Console pasting. */
function formatBodyForCopy(body: string): string {
  return body
    .split("\n")
    .map((line) => {
      if (/^#{2,3}\s/.test(line.trim())) {
        // "## New Features" → "\nNEW FEATURES" (blank line before section)
        return "\n" + line.replace(/^#{2,3}\s+/, "").toUpperCase();
      }
      if (/^[-•*]\s/.test(line.trim())) {
        return "• " + line.replace(/^[-•*]\s+/, "").trim();
      }
      return line;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Body rendering ───────────────────────────────────────────────────────────

type BodyPart =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "list"; items: string[] };

function parseBodyParts(text: string): BodyPart[] {
  const lines = text.split("\n");
  const parts: BodyPart[] = [];
  let currentList: string[] | null = null;

  for (const line of lines) {
    if (/^#{2,3}\s/.test(line.trim())) {
      currentList = null;
      const heading = line.replace(/^#{2,3}\s+/, "").trim();
      if (heading) parts.push({ type: "heading", text: heading });
    } else if (/^[-•*]\s/.test(line.trim())) {
      if (!currentList) {
        currentList = [];
        parts.push({ type: "list", items: currentList });
      }
      currentList.push(line.replace(/^[-•*]\s+/, "").trim());
    } else {
      currentList = null;
      if (line.trim()) {
        parts.push({ type: "text", text: line });
      }
    }
  }
  return parts;
}

function RenderBody({ text }: { text: string }) {
  const parts = parseBodyParts(text);
  return (
    <div className="mt-2 space-y-1">
      {parts.map((part, i) => {
        if (part.type === "heading") {
          return (
            <p
              key={i}
              className="mt-3 mb-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-3)] first:mt-1"
              style={{ fontFamily: MONO }}
            >
              {part.text}
            </p>
          );
        }
        if (part.type === "list") {
          return (
            <ul
              key={i}
              className="ml-4 list-disc space-y-0.5 text-[13px] leading-6 text-[var(--text-2)]"
            >
              {part.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-[13px] leading-6 text-[var(--text-2)]">
            {part.text}
          </p>
        );
      })}
    </div>
  );
}

// ─── Version grouping ─────────────────────────────────────────────────────────

type VersionGroup = {
  /** e.g. "1.1.0" */
  version: string;
  /** Title from the first/representative entry */
  title: string;
  releasedAt: string | null;
  /** Fallback sort date (oldest entry's createdAt) */
  createdAt: string;
  /** APPROVED only when ALL platform entries are approved; else PENDING */
  status: string;
  entries: ChangelogEntryRecord[];
};

function groupByVersion(entries: ChangelogEntryRecord[]): VersionGroup[] {
  const map = new Map<string, VersionGroup>();

  for (const entry of entries) {
    const existing = map.get(entry.version);
    if (!existing) {
      map.set(entry.version, {
        version: entry.version,
        title: entry.title,
        releasedAt: entry.releasedAt,
        createdAt: entry.createdAt,
        status: entry.status ?? "PENDING",
        entries: [entry],
      });
    } else {
      existing.entries.push(entry);
      // Any pending entry makes the whole group pending
      if ((entry.status ?? "PENDING") !== "APPROVED") {
        existing.status = "PENDING";
      }
    }
  }

  // Sort newest first
  return [...map.values()].sort((a, b) => {
    const ta = a.releasedAt
      ? new Date(a.releasedAt).getTime()
      : new Date(a.createdAt).getTime();
    const tb = b.releasedAt
      ? new Date(b.releasedAt).getTime()
      : new Date(b.createdAt).getTime();
    return tb - ta;
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterPlatform = "ALL" | "IOS" | "ANDROID" | "FIRESTICK" | "WEB";
type StatusFilter = "ALL" | "PENDING" | "APPROVED";

interface Props {
  entries: ChangelogEntryRecord[];
  /**
   * Enabled platforms for this wiki — controls which filter tabs are visible.
   * Defaults to ["IOS","ANDROID","WEB"].
   */
  platforms?: string[];
  /** Shown in the empty-state inline prompt. */
  onAdd?: () => void;
  /** Called with all entry IDs in the version group to delete. */
  onDelete: (ids: string[]) => Promise<void>;
  /** Called with all entry IDs in the version group + the new target status. */
  onToggleStatus: (ids: string[], newStatus: string) => Promise<void>;
  /** Called with the version string to edit the whole version group. */
  onEdit?: (version: string) => void;
  readOnly?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChangelogSection({
  entries,
  platforms: enabledPlatforms,
  onAdd,
  onDelete,
  onToggleStatus,
  onEdit,
  readOnly = false,
}: Props) {
  const [platformFilter, setPlatformFilter] = useState<FilterPlatform>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  /** Per-version active platform tab */
  const [activePlatformByVersion, setActivePlatformByVersion] = useState<
    Record<string, string>
  >({});
  /** Version currently being processed (delete / status toggle) */
  const [processingVersion, setProcessingVersion] = useState<string | null>(null);
  /** Version where the copy was just triggered — shows a brief ✓ */
  const [copiedVersion, setCopiedVersion] = useState<string | null>(null);

  // Build the platform filter tab list
  const ALL_ORDERED: FilterPlatform[] = ["IOS", "ANDROID", "FIRESTICK", "WEB"];
  const activePlatformList = enabledPlatforms ?? ["IOS", "ANDROID", "WEB"];
  const platformFilterTabs: FilterPlatform[] = [
    "ALL",
    ...ALL_ORDERED.filter((p) => activePlatformList.includes(p)),
  ];

  const groups = groupByVersion(entries);

  // Apply both filters
  const filtered = groups.filter((g) => {
    const matchesPlatform =
      platformFilter === "ALL" ||
      g.entries.some((e) => e.platform === platformFilter);
    const matchesStatus =
      statusFilter === "ALL" || g.status === statusFilter;
    return matchesPlatform && matchesStatus;
  });

  function getActivePlatform(group: VersionGroup): string {
    const saved = activePlatformByVersion[group.version];
    if (saved && group.entries.some((e) => e.platform === saved)) return saved;
    return group.entries[0]?.platform ?? "IOS";
  }

  async function handleDelete(group: VersionGroup) {
    setProcessingVersion(group.version);
    try {
      await onDelete(group.entries.map((e) => e.id));
    } finally {
      setProcessingVersion(null);
    }
  }

  async function handleToggle(group: VersionGroup) {
    const newStatus = group.status === "APPROVED" ? "PENDING" : "APPROVED";
    setProcessingVersion(group.version);
    try {
      await onToggleStatus(
        group.entries.map((e) => e.id),
        newStatus,
      );
    } finally {
      setProcessingVersion(null);
    }
  }

  async function handleCopy(group: VersionGroup) {
    const platform = getActivePlatform(group);
    const body = group.entries.find((e) => e.platform === platform)?.body;
    if (!body) return;
    try {
      await navigator.clipboard.writeText(formatBodyForCopy(body));
      setCopiedVersion(group.version);
      setTimeout(() => setCopiedVersion((v) => (v === group.version ? null : v)), 2000);
    } catch {
      /* clipboard access denied — ignore */
    }
  }

  return (
    <div>
      {/* ── Filter bar ─────────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center gap-1">
        {/* Platform tabs */}
        {platformFilterTabs.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatformFilter(p)}
            className={[
              "rounded-full px-3 py-1 text-xs font-medium transition",
              platformFilter === p
                ? "bg-[var(--text-1)] text-white"
                : "border border-[var(--border-2)] text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
            ].join(" ")}
          >
            {PLATFORM_LABELS[p] ?? p}
          </button>
        ))}

        {/* Status filter — pushed to the right */}
        <div className="ml-auto flex gap-1">
          {(["ALL", "PENDING", "APPROVED"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={[
                "rounded-full px-3 py-1 text-xs font-medium transition",
                statusFilter === s
                  ? s === "APPROVED"
                    ? "bg-emerald-600 text-white"
                    : s === "PENDING"
                    ? "bg-amber-500 text-white"
                    : "bg-[var(--text-1)] text-white"
                  : "border border-[var(--border-2)] text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]",
              ].join(" ")}
            >
              {s === "ALL" ? "All" : s === "PENDING" ? "Pending" : "Approved"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Timeline ───────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[rgba(0,0,0,0.12)] py-14 text-center">
          <p className="text-[13px] text-[var(--text-4)]">
            No entries for this selection.
          </p>
          {!readOnly && onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--brand-700)] hover:underline"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add the first version
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-[15px] top-0 h-full w-px bg-[rgba(0,0,0,0.07)]" />

          <div className="space-y-4">
            {filtered.map((group) => {
              const semver = getSemverType(group.version);
              const dateStr = group.releasedAt
                ? new Date(group.releasedAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : new Date(group.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });

              const isProcessing = processingVersion === group.version;
              const isCopied = copiedVersion === group.version;
              const activePlatform = getActivePlatform(group);
              const hasMultiplePlatforms = group.entries.length > 1;
              const activeEntry = group.entries.find(
                (e) => e.platform === activePlatform,
              );
              const isApproved = group.status === "APPROVED";

              return (
                <div
                  key={group.version}
                  className="group relative flex gap-4 pl-10"
                >
                  {/* Timeline dot */}
                  <div
                    className={[
                      "absolute left-[11px] top-[14px] h-[9px] w-[9px] rounded-full border-2 border-white ring-1",
                      isApproved
                        ? "bg-emerald-500 ring-emerald-200"
                        : "bg-[var(--text-3)] ring-[rgba(0,0,0,0.12)]",
                    ].join(" ")}
                  />

                  <div className="flex-1 rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white px-4 py-3.5">
                    {/* ── Header row ─────────────────────────── */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Version */}
                        <span
                          className="rounded-[4px] border border-[rgba(0,0,0,0.1)] bg-[var(--surface-0)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-2)]"
                          style={{ fontFamily: MONO }}
                        >
                          v{group.version}
                        </span>
                        {/* Semver type */}
                        {semver && (
                          <span
                            className={`rounded-[4px] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${SEMVER_STYLES[semver]}`}
                            style={{ fontFamily: MONO }}
                          >
                            {semver}
                          </span>
                        )}
                        <span className="text-[13px] font-semibold text-[var(--text-1)]">
                          {group.title}
                        </span>
                      </div>

                      {/* Right actions */}
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-[11px] text-[var(--text-4)]">
                          {dateStr}
                        </span>

                        {/* Status badge — clickable to toggle */}
                        {!readOnly ? (
                          <button
                            type="button"
                            onClick={() => void handleToggle(group)}
                            disabled={isProcessing}
                            title={
                              isApproved
                                ? "Mark as pending"
                                : "Approve this release"
                            }
                            className={[
                              "rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] transition disabled:opacity-50",
                              isApproved
                                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                : "bg-amber-50 text-amber-700 hover:bg-amber-100",
                            ].join(" ")}
                            style={{ fontFamily: MONO }}
                          >
                            {isApproved ? "✓ Approved" : "● Pending"}
                          </button>
                        ) : (
                          <span
                            className={[
                              "rounded-[4px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]",
                              isApproved
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-700",
                            ].join(" ")}
                            style={{ fontFamily: MONO }}
                          >
                            {isApproved ? "✓ Approved" : "● Pending"}
                          </span>
                        )}

                        {/* Copy button — copies active platform body */}
                        {activeEntry?.body && (
                          <button
                            type="button"
                            onClick={() => void handleCopy(group)}
                            title="Copy release notes (App Store–ready)"
                            className="rounded p-1 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                          >
                            {isCopied ? (
                              <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}

                        {/* Edit button */}
                        {!readOnly && onEdit && (
                          <button
                            type="button"
                            onClick={() => onEdit(group.version)}
                            disabled={isProcessing}
                            className="rounded p-1 text-[var(--text-4)] opacity-0 transition group-hover:opacity-100 hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] disabled:opacity-50"
                            title="Edit this version"
                          >
                            <PencilSquareIcon className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Delete button */}
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => void handleDelete(group)}
                            disabled={isProcessing}
                            className="rounded p-1 text-[var(--text-4)] opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            title="Delete this version"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── Platform tabs (multi-platform only) ─── */}
                    {hasMultiplePlatforms && (
                      <div className="mt-3 flex gap-1 border-b border-[rgba(0,0,0,0.06)] pb-2">
                        {group.entries.map((entry) => {
                          const pColor =
                            PLATFORM_COLORS[entry.platform] ?? {
                              bg: "#f8fafc",
                              text: "#475569",
                            };
                          const isActive = activePlatform === entry.platform;
                          return (
                            <button
                              key={entry.platform}
                              type="button"
                              onClick={() =>
                                setActivePlatformByVersion((prev) => ({
                                  ...prev,
                                  [group.version]: entry.platform,
                                }))
                              }
                              className={[
                                "rounded-[4px] px-2.5 py-1 text-[11px] font-semibold transition",
                                isActive ? "opacity-100" : "opacity-35 hover:opacity-60",
                              ].join(" ")}
                              style={{
                                background: isActive ? pColor.bg : "transparent",
                                color: isActive ? pColor.text : "var(--text-3)",
                                fontFamily: MONO,
                              }}
                            >
                              {PLATFORM_LABELS[entry.platform] ?? entry.platform}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* ── Body ───────────────────────────────── */}
                    {activeEntry?.body ? (
                      <RenderBody text={activeEntry.body} />
                    ) : (
                      <p className="mt-2 text-[12px] italic text-[var(--text-4)]">
                        No notes for this platform.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
