"use client";

import { useState } from "react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import {
  PlusIcon,
  TrashIcon,
  PencilSquareIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  EllipsisHorizontalIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";
import type { ChangelogEntryRecord } from "@/lib/api";
import { menuItem, menuPanel } from "@/components/ui/menu-styles";

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

const GHOST_BTN =
  "inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] disabled:opacity-50";

/** The platform's pick-one control (DESIGN.md — Care views, wiki doc tabs). */
function Segmented({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; count?: number; tone?: "warn" }[];
}) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div
        role="tablist"
        aria-label={label}
        className="inline-flex min-w-max gap-0.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5"
      >
        {options.map((o) => {
          const on = o.value === value;
          const warn = o.tone === "warn" && (o.count ?? 0) > 0;
          return (
            <button
              key={o.value}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChange(o.value)}
              className={[
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] px-3 py-1.5 text-[11px] uppercase tracking-[0.05em] transition-colors",
                on
                  ? "bg-[var(--surface-0)] font-semibold text-[var(--brand-700)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                  : "text-[var(--text-3)] hover:text-[var(--text-1)]",
              ].join(" ")}
              style={{ fontFamily: MONO }}
            >
              {warn && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
              {o.label}
              {o.count !== undefined && (
                <span
                  className={[
                    "rounded-[4px] px-1 text-[10px] tabular-nums",
                    warn ? "bg-amber-100 text-amber-800" : "bg-[var(--surface-2,rgba(0,0,0,0.05))] text-[var(--text-3)]",
                  ].join(" ")}
                >
                  {o.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  /** Version whose Delete was clicked once — the second click deletes. */
  const [confirmDeleteVersion, setConfirmDeleteVersion] = useState<string | null>(null);
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

  // Apply both filters. Status counts are taken AFTER the platform filter, so the number
  // on "Pending" is always the number of cards that clicking it will show.
  const onPlatform = groups.filter(
    (g) => platformFilter === "ALL" || g.entries.some((e) => e.platform === platformFilter),
  );
  const statusCounts: Record<StatusFilter, number> = {
    ALL: onPlatform.length,
    PENDING: onPlatform.filter((g) => g.status === "PENDING").length,
    APPROVED: onPlatform.filter((g) => g.status === "APPROVED").length,
  };
  const filtered = onPlatform.filter((g) => statusFilter === "ALL" || g.status === statusFilter);

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
      {/* ── Filter bar ─────────────────────────────────────────────
          Two segmented controls (the platform's pick-one control, DESIGN.md). Status
          carries counts so "1 pending" is visible without clicking — a pending release is
          the thing someone needs to act on, and it used to be a grey pill among grey pills. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        {platformFilterTabs.length > 2 ? (
          <Segmented
            label="Platform"
            value={platformFilter}
            onChange={(v) => setPlatformFilter(v as FilterPlatform)}
            options={platformFilterTabs.map((p) => ({ value: p, label: PLATFORM_LABELS[p] ?? p }))}
          />
        ) : (
          <span />
        )}
        <Segmented
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={[
            { value: "ALL", label: "All", count: statusCounts.ALL },
            { value: "PENDING", label: "Pending", count: statusCounts.PENDING, tone: "warn" },
            { value: "APPROVED", label: "Approved", count: statusCounts.APPROVED },
          ]}
        />
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
                    {/* `flex-wrap`: the right-hand cluster is `shrink-0` (date + status
                        badge + three icon buttons), so on a phone it ran past the card —
                        and the card is overflow:hidden, so editing a release was simply
                        impossible there. It takes a second line instead. */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
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

                      {/* Right: date + status, then the actions. The status is a label
                          now, not a hidden toggle — approving has its own button below. */}
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                          {dateStr}
                        </span>
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
                      </div>
                    </div>

                    {/* ── Actions ─────────────────────────────── */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-1">
                      {activeEntry?.body && (
                        <button
                          type="button"
                          onClick={() => void handleCopy(group)}
                          title="Copy this platform's notes, ready to paste into the store"
                          className={GHOST_BTN}
                        >
                          {isCopied ? (
                            <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                          )}
                          {isCopied ? "Copied" : `Copy ${hasMultiplePlatforms ? `${PLATFORM_LABELS[activePlatform] ?? activePlatform} notes` : "notes"}`}
                        </button>
                      )}
                      {!readOnly && onEdit && (
                        <button
                          type="button"
                          onClick={() => onEdit(group.version)}
                          disabled={isProcessing}
                          className={GHOST_BTN}
                        >
                          <PencilSquareIcon className="h-3.5 w-3.5" />
                          Edit
                        </button>
                      )}
                      {!readOnly && (
                        <Menu>
                          <MenuButton
                            aria-label={`More actions for v${group.version}`}
                            disabled={isProcessing}
                            className={`${GHOST_BTN} px-1.5`}
                          >
                            <EllipsisHorizontalIcon className="h-4 w-4" />
                          </MenuButton>
                          <MenuItems anchor="bottom start" className={`${menuPanel} w-48`}>
                            {isApproved && (
                              <MenuItem>
                                <button type="button" onClick={() => void handleToggle(group)} className={`${menuItem} gap-2`}>
                                  <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                                  Mark as pending
                                </button>
                              </MenuItem>
                            )}
                            <MenuItem>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteVersion(group.version)}
                                className={`${menuItem} gap-2 text-red-600`}
                              >
                                <TrashIcon className="h-3.5 w-3.5" />
                                Delete version…
                              </button>
                            </MenuItem>
                          </MenuItems>
                        </Menu>
                      )}
                    </div>

                    {/* Delete asks once more, in place. It removes every platform's notes
                        for the version, so it was too easy as a lone bin icon. */}
                    {confirmDeleteVersion === group.version && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-[8px] border border-red-200 bg-red-50 px-3 py-2">
                        <span className="text-[12px] text-red-700">
                          Delete v{group.version} for {hasMultiplePlatforms ? "every platform" : "good"}?
                        </span>
                        <span className="ml-auto flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteVersion(null)}
                            className="rounded-[6px] px-2.5 py-1 text-[12px] font-medium text-[var(--text-2)] hover:bg-white"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => {
                              setConfirmDeleteVersion(null);
                              void handleDelete(group);
                            }}
                            className="rounded-[6px] bg-red-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </span>
                      </div>
                    )}

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
                                isActive ? "opacity-100" : "opacity-60 hover:opacity-100",
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

                    {/* ── Approve ─────────────────────────────── The action a pending
                        release is waiting for, so it is a real button with a sentence, not a
                        status pill that happened to be clickable. */}
                    {!readOnly && !isApproved && (
                      <div className="-mx-4 -mb-3.5 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-b-[10px] border-t border-amber-200 bg-amber-50 px-4 py-2.5">
                        <span className="text-[12px] text-amber-800">
                          Waiting for approval
                          {hasMultiplePlatforms
                            ? ` — check the notes for ${group.entries.length === 2 ? "both" : `all ${group.entries.length}`} platforms first.`
                            : "."}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleToggle(group)}
                          disabled={isProcessing}
                          className="ml-auto inline-flex items-center gap-1.5 rounded-[6px] bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckIcon className="h-3.5 w-3.5" />
                          {isProcessing ? "Approving…" : "Approve release"}
                        </button>
                      </div>
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
