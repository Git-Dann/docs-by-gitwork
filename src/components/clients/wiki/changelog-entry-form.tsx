"use client";

import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

// ─── Constants ────────────────────────────────────────────────────────────────

const SEMVER_STYLES = {
  MAJOR: "bg-red-50 text-red-700 border-red-200",
  MINOR: "bg-amber-50 text-amber-700 border-amber-200",
  PATCH: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const PLATFORM_LABELS: Record<string, string> = {
  IOS: "iOS",
  ANDROID: "Android",
  FIRESTICK: "Fire TV",
  WEB: "Web",
  ALL: "All platforms",
};

// Platform display order (Web covers the "all platforms" case — no ALL tab)
const PLATFORM_ORDER = ["IOS", "ANDROID", "FIRESTICK", "WEB"];

// Release-notes character limits for each store's "What's new" field.
// null = no enforced limit (Web / All-platforms).
const PLATFORM_LIMITS: Record<string, number | null> = {
  IOS: 4000, // Apple App Store "What's New"
  ANDROID: 500, // Google Play "What's new" (recent changes)
  FIRESTICK: 4000, // Amazon Appstore "Recent changes"
  WEB: null,
  ALL: null,
};

const MONO = "var(--font-mono), 'SF Mono', Menlo, Consolas, monospace";

const fieldLabel =
  "mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]";
const fieldInput =
  "w-full rounded-[6px] border border-[rgba(0,0,0,0.1)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-500)]/20";

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

function normaliseBullets(text: string): string {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith("- ") ? l : `- ${l.replace(/^[-•*]\s*/, "")}`))
    .join("\n");
}

/** Strip a leading "v" so we never produce "vv2.4.1". */
function cleanVersion(v: string): string {
  return v.trim().replace(/^v/i, "");
}

function assembleBody(
  version: string,
  changelog: string,
  newFeatures: string,
  improvements: string,
  fixes: string,
): string {
  const v = cleanVersion(version);
  const parts: string[] = [];
  // Always lead with the Changelog heading carrying the version number.
  const heading = v ? `## Changelog v${v}` : "## Changelog";
  parts.push(changelog.trim() ? `${heading}\n${changelog.trim()}` : heading);
  if (newFeatures.trim()) parts.push(`## New Features\n${normaliseBullets(newFeatures)}`);
  if (improvements.trim()) parts.push(`## Improvements\n${normaliseBullets(improvements)}`);
  if (fixes.trim()) parts.push(`## Fixes\n${normaliseBullets(fixes)}`);
  return parts.join("\n\n");
}

/**
 * Format the assembled body the way it actually lands in a store's "What's new"
 * field (markdown stripped) — so the character count matches what gets pasted.
 */
function formatForStore(body: string): string {
  return body
    .split("\n")
    .map((line) => {
      if (/^#{2,3}\s/.test(line.trim())) return "\n" + line.replace(/^#{2,3}\s+/, "").toUpperCase();
      if (/^[-•*]\s/.test(line.trim())) return "• " + line.replace(/^[-•*]\s+/, "").trim();
      return line;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Inverse of assembleBody — parse a stored body back into the 4 structured fields. */
function parseBodyToFields(body: string | null): PlatformFields {
  const acc: Record<keyof PlatformFields, string[]> = {
    changelog: [],
    newFeatures: [],
    improvements: [],
    fixes: [],
  };
  if (!body) return { changelog: "", newFeatures: "", improvements: "", fixes: "" };

  let current: keyof PlatformFields | null = null;
  for (const line of body.split("\n")) {
    const h = line.trim().match(/^#{2,3}\s+(.*)$/);
    if (h) {
      const name = h[1].toLowerCase();
      // "## Changelog v2.4.1" (or legacy "## Summary") → changelog field
      if (name.startsWith("changelog") || name.startsWith("summary")) current = "changelog";
      else if (name.startsWith("new feature")) current = "newFeatures";
      else if (name.startsWith("improvement")) current = "improvements";
      else if (name.startsWith("fix")) current = "fixes";
      else current = null;
      continue;
    }
    if (current) {
      // Lists store one item per line (strip bullet); changelog keeps prose verbatim.
      acc[current].push(current === "changelog" ? line : line.replace(/^[-•*]\s+/, ""));
    }
  }

  return {
    changelog: acc.changelog.join("\n").trim(),
    newFeatures: acc.newFeatures.join("\n").trim(),
    improvements: acc.improvements.join("\n").trim(),
    fixes: acc.fixes.join("\n").trim(),
  };
}

/** ISO timestamp → YYYY-MM-DD for a <input type="date">. */
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlatformFields {
  changelog: string;
  newFeatures: string;
  improvements: string;
  fixes: string;
}

export interface ChangelogEntryPayload {
  /** Present when this payload maps to an existing entry (edit mode). */
  id?: string;
  platform: string;
  version: string;
  title: string;
  body?: string;
  releasedAt?: string;
  status: string;
}

/** Existing version-group data used to pre-fill the form in edit mode. */
export interface ChangelogEditInitial {
  version: string;
  title: string;
  releasedAt: string | null;
  status: string;
  /** One per platform that already has an entry for this version. */
  entries: { id: string; platform: string; body: string | null }[];
}

interface Props {
  /**
   * Enabled platforms for this wiki — controls which tabs appear.
   * Defaults to ["IOS","ANDROID","WEB"].
   */
  platforms?: string[];
  /** When provided, the form edits this existing version instead of adding one. */
  initial?: ChangelogEditInitial;
  onSave: (entries: ChangelogEntryPayload[]) => Promise<void>;
  onClose: () => void;
  isSaving: boolean;
}

const EMPTY_FIELDS: PlatformFields = {
  changelog: "",
  newFeatures: "",
  improvements: "",
  fixes: "",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ChangelogEntryForm({
  platforms: enabledPlatforms,
  initial,
  onSave,
  onClose,
  isSaving,
}: Props) {
  const isEditing = !!initial;

  // Build ordered tab list from enabled platforms
  const tabPlatforms = PLATFORM_ORDER.filter(
    (p) => !enabledPlatforms || enabledPlatforms.includes(p),
  );

  // platform → existing entry id (edit mode), so saved payloads update in place
  const [idByPlatform] = useState<Record<string, string>>(() =>
    Object.fromEntries((initial?.entries ?? []).map((e) => [e.platform, e.id])),
  );

  // Metadata (shared across all platforms)
  const [version, setVersion] = useState(initial?.version ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [releasedAt, setReleasedAt] = useState(toDateInput(initial?.releasedAt ?? null));
  const [status, setStatus] = useState<"PENDING" | "APPROVED">(
    initial?.status === "APPROVED" ? "APPROVED" : "PENDING",
  );

  // Per-platform content — pre-filled from existing entries in edit mode
  const [platformData, setPlatformData] = useState<Record<string, PlatformFields>>(() => {
    const byPlatform = new Map(
      (initial?.entries ?? []).map((e) => [e.platform, parseBodyToFields(e.body)]),
    );
    return Object.fromEntries(
      tabPlatforms.map((p) => [p, byPlatform.get(p) ?? { ...EMPTY_FIELDS }]),
    );
  });

  const [activeTab, setActiveTab] = useState(
    initial?.entries[0]?.platform ?? tabPlatforms[0] ?? "IOS",
  );
  const [error, setError] = useState<string | null>(null);

  const semver = getSemverType(version);

  function updateField(platform: string, field: keyof PlatformFields, value: string) {
    setPlatformData((prev) => ({
      ...prev,
      [platform]: { ...prev[platform], [field]: value },
    }));
  }

  function hasContent(platform: string): boolean {
    const d = platformData[platform];
    return !!(
      d?.changelog.trim() ||
      d?.newFeatures.trim() ||
      d?.improvements.trim() ||
      d?.fixes.trim()
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!version.trim()) {
      setError("Version is required");
      return;
    }
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    const entries: ChangelogEntryPayload[] = tabPlatforms
      .filter(hasContent)
      .map((p) => {
        const d = platformData[p];
        const body = assembleBody(version, d.changelog, d.newFeatures, d.improvements, d.fixes);
        return {
          ...(idByPlatform[p] ? { id: idByPlatform[p] } : {}),
          platform: p,
          version: cleanVersion(version),
          title: title.trim(),
          body: body || undefined,
          releasedAt: releasedAt || undefined,
          status,
        };
      });

    if (entries.length === 0) {
      setError("Add notes for at least one platform");
      return;
    }

    // Enforce each store's "What's new" character limit.
    for (const entry of entries) {
      const limit = PLATFORM_LIMITS[entry.platform];
      if (limit != null && entry.body) {
        const len = formatForStore(entry.body).length;
        if (len > limit) {
          // Jump to the offending platform so the user sees what to trim.
          setActiveTab(entry.platform);
          setError(
            `${PLATFORM_LABELS[entry.platform]} release notes are ${len}/${limit} characters — over the store limit. Trim before saving.`,
          );
          return;
        }
      }
    }

    setError(null);
    await onSave(entries);
  }

  const activePlatformData = platformData[activeTab] ?? EMPTY_FIELDS;
  const filledPlatforms = tabPlatforms.filter(hasContent);

  // Live store character count for the active platform's "What's new" text.
  const activeLimit = PLATFORM_LIMITS[activeTab] ?? null;
  const activeStoreLength = hasContent(activeTab)
    ? formatForStore(
        assembleBody(
          version,
          activePlatformData.changelog,
          activePlatformData.newFeatures,
          activePlatformData.improvements,
          activePlatformData.fixes,
        ),
      ).length
    : 0;
  const overLimit = activeLimit !== null && activeStoreLength > activeLimit;
  const nearLimit = activeLimit !== null && activeStoreLength > activeLimit * 0.9;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[88vh] max-h-[760px] w-full max-w-3xl flex-col rounded-[12px] bg-white shadow-xl">
        {/* Header */}
        <div className="widget-header shrink-0 rounded-t-[12px]">
          <span className="widget-header__label">{isEditing ? "Edit Version" : "Add Version"}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 overflow-y-auto p-6">
            {/* ── Metadata row ──────────────────────────── */}
            <div className="mb-5 grid grid-cols-2 gap-x-6 gap-y-4">
              {/* Version */}
              <div>
                <label className={fieldLabel} style={{ fontFamily: MONO }}>
                  Version
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="e.g. 2.4.1"
                    className={fieldInput}
                    style={{ fontFamily: MONO }}
                  />
                  {semver && (
                    <span
                      className={`shrink-0 rounded-[4px] border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${SEMVER_STYLES[semver]}`}
                      style={{ fontFamily: MONO }}
                    >
                      {semver}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-[var(--text-4)]">major.minor.patch</p>
              </div>

              {/* Release title */}
              <div>
                <label className={fieldLabel} style={{ fontFamily: MONO }}>
                  Release Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Performance improvements"
                  className={fieldInput}
                />
              </div>

              {/* Release date */}
              <div>
                <label className={fieldLabel} style={{ fontFamily: MONO }}>
                  Release Date{" "}
                  <span className="normal-case font-normal text-[var(--text-4)]">(optional)</span>
                </label>
                <input
                  type="date"
                  value={releasedAt}
                  onChange={(e) => setReleasedAt(e.target.value)}
                  className={fieldInput}
                />
              </div>

              {/* Status */}
              <div>
                <label className={fieldLabel} style={{ fontFamily: MONO }}>
                  Status
                </label>
                <div className="flex overflow-hidden rounded-[6px] border border-[var(--border-2)]">
                  <button
                    type="button"
                    onClick={() => setStatus("PENDING")}
                    className={[
                      "flex-1 px-3 py-2 text-[13px] font-medium transition",
                      status === "PENDING"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
                    ].join(" ")}
                  >
                    ● Pending
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus("APPROVED")}
                    className={[
                      "flex-1 border-l border-[var(--border-2)] px-3 py-2 text-[13px] font-medium transition",
                      status === "APPROVED"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
                    ].join(" ")}
                  >
                    ✓ Approved
                  </button>
                </div>
              </div>
            </div>

            {/* ── Platform tabs + store char count ──────── */}
            <div className="mb-4 flex items-end justify-between border-b border-[rgba(0,0,0,0.07)]">
              <div className="flex gap-1 pb-0">
                {tabPlatforms.map((p) => {
                  const filled = hasContent(p);
                  const isActive = activeTab === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setActiveTab(p)}
                      className={[
                        "relative rounded-t-[6px] px-3 py-2 text-[13px] font-medium transition",
                        isActive
                          ? "bg-white text-[var(--text-1)] shadow-[0_1px_0_white,inset_0_0_0_1px_rgba(0,0,0,0.08)]"
                          : "text-[var(--text-3)] hover:text-[var(--text-1)]",
                      ].join(" ")}
                    >
                      {PLATFORM_LABELS[p] ?? p}
                      {/* Dot indicator when content is filled — absolute so it never shifts tabs */}
                      {filled && !isActive && (
                        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--brand-500)]" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Store "What's new" character count for the active platform */}
              {activeLimit !== null && (
                <span
                  className="pb-2 text-[11px] font-semibold tabular-nums"
                  style={{
                    fontFamily: MONO,
                    color: overLimit ? "#dc2626" : nearLimit ? "#d97706" : "var(--text-4)",
                  }}
                  title={`${PLATFORM_LABELS[activeTab]} store “What’s new” limit`}
                >
                  {activeStoreLength} / {activeLimit}
                </span>
              )}
            </div>

            {/* ── Structured fields for active platform — 2-column grid ── */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              {/* Changelog */}
              <div>
                <label className={fieldLabel} style={{ fontFamily: MONO }}>
                  Changelog
                </label>
                <textarea
                  key={activeTab + "-changelog"}
                  value={activePlatformData.changelog}
                  onChange={(e) => updateField(activeTab, "changelog", e.target.value)}
                  rows={7}
                  placeholder="Brief overview of this release."
                  className={`${fieldInput} resize-y`}
                />
                <p className="mt-1 text-[11px] text-[var(--text-4)]">
                  Heading shows as “Changelog v{cleanVersion(version) || "x.y.z"}”
                </p>
              </div>

              {/* New Features */}
              <div>
                <label className={fieldLabel} style={{ fontFamily: MONO }}>
                  New Features{" "}
                  <span className="normal-case font-normal text-[var(--text-4)]">(optional)</span>
                </label>
                <textarea
                  key={activeTab + "-newFeatures"}
                  value={activePlatformData.newFeatures}
                  onChange={(e) => updateField(activeTab, "newFeatures", e.target.value)}
                  rows={7}
                  placeholder={"Rounds history page\nProfile photo upload"}
                  className={`${fieldInput} resize-y`}
                />
                <p className="mt-1 text-[11px] text-[var(--text-4)]">
                  One per line — auto-formatted as bullets
                </p>
              </div>

              {/* Improvements */}
              <div>
                <label className={fieldLabel} style={{ fontFamily: MONO }}>
                  Improvements{" "}
                  <span className="normal-case font-normal text-[var(--text-4)]">(optional)</span>
                </label>
                <textarea
                  key={activeTab + "-improvements"}
                  value={activePlatformData.improvements}
                  onChange={(e) => updateField(activeTab, "improvements", e.target.value)}
                  rows={7}
                  placeholder={"Faster load time on home screen\nBetter error messages"}
                  className={`${fieldInput} resize-y`}
                />
                <p className="mt-1 text-[11px] text-[var(--text-4)]">
                  One per line — auto-formatted as bullets
                </p>
              </div>

              {/* Fixes */}
              <div>
                <label className={fieldLabel} style={{ fontFamily: MONO }}>
                  Fixes{" "}
                  <span className="normal-case font-normal text-[var(--text-4)]">(optional)</span>
                </label>
                <textarea
                  key={activeTab + "-fixes"}
                  value={activePlatformData.fixes}
                  onChange={(e) => updateField(activeTab, "fixes", e.target.value)}
                  rows={7}
                  placeholder={"Fixed crash on launch for some devices\nResolved incorrect badge count"}
                  className={`${fieldInput} resize-y`}
                />
                <p className="mt-1 text-[11px] text-[var(--text-4)]">
                  One per line — auto-formatted as bullets
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-[rgba(0,0,0,0.07)] px-6 py-4">
            {error && (
              <p className="mb-3 rounded-[6px] bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-2">
              {/* Hint: which platforms have notes */}
              <p className="text-[11px] text-[var(--text-4)]">
                {filledPlatforms.length > 0 ? (
                  <>
                    {isEditing ? "Will save " : "Will create "}
                    <span className="font-medium text-[var(--text-2)]">
                      {filledPlatforms.map((p) => PLATFORM_LABELS[p] ?? p).join(" + ")}
                    </span>{" "}
                    entr{filledPlatforms.length === 1 ? "y" : "ies"}
                  </>
                ) : (
                  "Fill in at least one platform tab"
                )}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--border-2)] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center rounded-[6px] bg-[var(--brand-700)] px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-[var(--brand-800)] disabled:opacity-60"
                >
                  {isSaving ? "Saving…" : isEditing ? "Save changes" : "Add entry"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
