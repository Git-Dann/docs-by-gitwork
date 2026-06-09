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

// Platform display order — ALL last so individual platforms lead
const PLATFORM_ORDER = ["IOS", "ANDROID", "FIRESTICK", "WEB", "ALL"];

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

function assembleBody(
  summary: string,
  newFeatures: string,
  improvements: string,
  fixes: string,
): string {
  const parts: string[] = [];
  if (summary.trim()) parts.push(`## Summary\n${summary.trim()}`);
  if (newFeatures.trim()) parts.push(`## New Features\n${normaliseBullets(newFeatures)}`);
  if (improvements.trim()) parts.push(`## Improvements\n${normaliseBullets(improvements)}`);
  if (fixes.trim()) parts.push(`## Fixes\n${normaliseBullets(fixes)}`);
  return parts.join("\n\n");
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlatformFields {
  summary: string;
  newFeatures: string;
  improvements: string;
  fixes: string;
}

export interface ChangelogEntryPayload {
  platform: string;
  version: string;
  title: string;
  body?: string;
  releasedAt?: string;
  status: string;
}

interface Props {
  /**
   * Enabled platforms for this wiki — controls which tabs appear.
   * Defaults to ["IOS","ANDROID","WEB"].
   */
  platforms?: string[];
  onSave: (entries: ChangelogEntryPayload[]) => Promise<void>;
  onClose: () => void;
  isSaving: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChangelogEntryForm({
  platforms: enabledPlatforms,
  onSave,
  onClose,
  isSaving,
}: Props) {
  // Build ordered tab list from enabled platforms
  const tabPlatforms = PLATFORM_ORDER.filter(
    (p) => !enabledPlatforms || enabledPlatforms.includes(p) || p === "ALL",
  );

  // Metadata (shared across all platforms)
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [releasedAt, setReleasedAt] = useState("");
  const [status, setStatus] = useState<"PENDING" | "APPROVED">("PENDING");

  // Per-platform content
  const [activeTab, setActiveTab] = useState(tabPlatforms[0] ?? "IOS");
  const [platformData, setPlatformData] = useState<Record<string, PlatformFields>>(
    () =>
      Object.fromEntries(
        tabPlatforms.map((p) => [
          p,
          { summary: "", newFeatures: "", improvements: "", fixes: "" },
        ]),
      ),
  );

  const [error, setError] = useState<string | null>(null);

  const semver = getSemverType(version);

  function updateField(
    platform: string,
    field: keyof PlatformFields,
    value: string,
  ) {
    setPlatformData((prev) => ({
      ...prev,
      [platform]: { ...prev[platform], [field]: value },
    }));
  }

  function hasContent(platform: string): boolean {
    const d = platformData[platform];
    return !!(
      d?.summary.trim() ||
      d?.newFeatures.trim() ||
      d?.improvements.trim() ||
      d?.fixes.trim()
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!version.trim()) { setError("Version is required"); return; }
    if (!title.trim()) { setError("Title is required"); return; }

    const entries: ChangelogEntryPayload[] = tabPlatforms
      .filter(hasContent)
      .map((p) => {
        const d = platformData[p];
        const body = assembleBody(
          d.summary,
          d.newFeatures,
          d.improvements,
          d.fixes,
        );
        return {
          platform: p,
          version: version.trim(),
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

    setError(null);
    await onSave(entries);
  }

  const activePlatformData = platformData[activeTab] ?? {
    summary: "",
    newFeatures: "",
    improvements: "",
    fixes: "",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-[12px] bg-white shadow-xl">
        {/* Header */}
        <div className="widget-header shrink-0 rounded-t-[12px]">
          <span className="widget-header__label">Add Version</span>
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

            {/* ── Platform tabs ─────────────────────────── */}
            <div className="mb-4 border-b border-[rgba(0,0,0,0.07)]">
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
                      {/* Dot indicator when content has been filled in */}
                      {filled && !isActive && (
                        <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--brand-500)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Structured fields for active platform ─── */}
            <div className="space-y-5">
              {/* Summary */}
              <div>
                <label className={fieldLabel} style={{ fontFamily: MONO }}>
                  Summary
                </label>
                <textarea
                  key={activeTab + "-summary"}
                  value={activePlatformData.summary}
                  onChange={(e) => updateField(activeTab, "summary", e.target.value)}
                  rows={2}
                  placeholder="Brief overview of this release."
                  className={`${fieldInput} resize-none`}
                />
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
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
                    rows={4}
                    placeholder={"Rounds history page\nProfile photo upload"}
                    className={`${fieldInput} resize-none`}
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
                    rows={4}
                    placeholder={"Faster load time on home screen\nBetter error messages"}
                    className={`${fieldInput} resize-none`}
                  />
                  <p className="mt-1 text-[11px] text-[var(--text-4)]">
                    One per line — auto-formatted as bullets
                  </p>
                </div>
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
                  rows={3}
                  placeholder={"Fixed crash on launch for some devices\nResolved incorrect badge count"}
                  className={`${fieldInput} resize-none`}
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
                {tabPlatforms.filter(hasContent).length > 0 ? (
                  <>
                    Will create{" "}
                    <span className="font-medium text-[var(--text-2)]">
                      {tabPlatforms
                        .filter(hasContent)
                        .map((p) => PLATFORM_LABELS[p] ?? p)
                        .join(" + ")}
                    </span>{" "}
                    entr{tabPlatforms.filter(hasContent).length === 1 ? "y" : "ies"}
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
                  {isSaving ? "Saving…" : "Add entry"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
