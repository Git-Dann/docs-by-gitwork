"use client";

import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

const ALL_PLATFORMS = [
  { value: "IOS", label: "iOS App Store" },
  { value: "ANDROID", label: "Google Play" },
  { value: "FIRESTICK", label: "Amazon Fire TV" },
  { value: "WEB", label: "Web" },
  { value: "ALL", label: "All platforms" },
];

const SEMVER_STYLES = {
  MAJOR: "bg-red-50 text-red-700 border-red-200",
  MINOR: "bg-amber-50 text-amber-700 border-amber-200",
  PATCH: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function getSemverType(v: string): "MAJOR" | "MINOR" | "PATCH" | null {
  const match = v.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  const minor = parseInt(match[2], 10);
  const patch = parseInt(match[3], 10);
  if (patch === 0 && minor === 0) return "MAJOR";
  if (patch === 0) return "MINOR";
  return "PATCH";
}

/** Normalise a bullet textarea: each non-empty line becomes a "- text" bullet. */
function normaliseBullets(text: string): string {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith("- ") ? l : `- ${l.replace(/^[-•*]\s*/, "")}`))
    .join("\n");
}

/** Assemble the structured body string from the 4 section fields. */
function assembleBody(
  summary: string,
  newFeatures: string,
  improvements: string,
  fixes: string,
): string {
  const parts: string[] = [];

  if (summary.trim()) {
    parts.push(`## Summary\n${summary.trim()}`);
  }
  if (newFeatures.trim()) {
    parts.push(`## New Features\n${normaliseBullets(newFeatures)}`);
  }
  if (improvements.trim()) {
    parts.push(`## Improvements\n${normaliseBullets(improvements)}`);
  }
  if (fixes.trim()) {
    parts.push(`## Fixes\n${normaliseBullets(fixes)}`);
  }

  return parts.join("\n\n");
}

const MONO = "var(--font-mono), 'SF Mono', Menlo, Consolas, monospace";

const fieldLabel =
  "mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]";
const fieldInput =
  "w-full rounded-[6px] border border-[rgba(0,0,0,0.1)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-500)]/20";
const bulletHint =
  "mt-1.5 text-[11px] text-[var(--text-4)]";

interface Props {
  /**
   * Enabled platforms for this wiki — filters the platform dropdown.
   * Defaults to all platforms when unset.
   */
  platforms?: string[];
  onSave: (payload: {
    platform: string;
    version: string;
    title: string;
    body?: string;
    releasedAt?: string;
  }) => Promise<void>;
  onClose: () => void;
  isSaving: boolean;
}

export function ChangelogEntryForm({ platforms: enabledPlatforms, onSave, onClose, isSaving }: Props) {
  // Filter platform options to only the ones this wiki has enabled (plus ALL).
  const platformOptions = ALL_PLATFORMS.filter(
    (p) => p.value === "ALL" || !enabledPlatforms || enabledPlatforms.includes(p.value),
  );

  const [platform, setPlatform] = useState(platformOptions[0]?.value ?? "IOS");
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [releasedAt, setReleasedAt] = useState("");
  // Structured body sections
  const [summary, setSummary] = useState("");
  const [newFeatures, setNewFeatures] = useState("");
  const [improvements, setImprovements] = useState("");
  const [fixes, setFixes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const semver = getSemverType(version);

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
    setError(null);

    const body = assembleBody(summary, newFeatures, improvements, fixes);

    await onSave({
      platform,
      version: version.trim(),
      title: title.trim(),
      body: body || undefined,
      releasedAt: releasedAt || undefined,
    });
  }

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
            {/* ── Metadata row: Platform / Version / Date / Title ──────── */}
            <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-5">
              {/* Platform */}
              <div>
                <label className={fieldLabel} style={{ fontFamily: MONO }}>
                  Platform
                </label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className={fieldInput}
                >
                  {platformOptions.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Version + semver badge */}
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
                <p className="mt-1.5 text-[11px] text-[var(--text-4)]">
                  Semantic versioning — major.minor.patch
                </p>
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
                  placeholder="e.g. Performance improvements and bug fixes"
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
            </div>

            {/* ── Structured body sections ────────────────────────────── */}
            <div className="space-y-5 border-t border-[rgba(0,0,0,0.07)] pt-5">
              {/* Summary */}
              <div>
                <label className={fieldLabel} style={{ fontFamily: MONO }}>
                  Summary
                </label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={2}
                  placeholder="Brief overview of this release — what it contains and why it matters."
                  className={`${fieldInput} resize-none`}
                />
              </div>

              {/* New Features + Improvements side by side */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                <div>
                  <label className={fieldLabel} style={{ fontFamily: MONO }}>
                    New Features{" "}
                    <span className="normal-case font-normal text-[var(--text-4)]">(optional)</span>
                  </label>
                  <textarea
                    value={newFeatures}
                    onChange={(e) => setNewFeatures(e.target.value)}
                    rows={4}
                    placeholder={"New screen for viewing stats\nPush notifications for activity"}
                    className={`${fieldInput} resize-none`}
                  />
                  <p className={bulletHint}>One item per line — auto-formatted as bullets</p>
                </div>

                <div>
                  <label className={fieldLabel} style={{ fontFamily: MONO }}>
                    Improvements{" "}
                    <span className="normal-case font-normal text-[var(--text-4)]">(optional)</span>
                  </label>
                  <textarea
                    value={improvements}
                    onChange={(e) => setImprovements(e.target.value)}
                    rows={4}
                    placeholder={"Faster load time on home screen\nBetter error messages"}
                    className={`${fieldInput} resize-none`}
                  />
                  <p className={bulletHint}>One item per line — auto-formatted as bullets</p>
                </div>
              </div>

              {/* Fixes */}
              <div>
                <label className={fieldLabel} style={{ fontFamily: MONO }}>
                  Fixes{" "}
                  <span className="normal-case font-normal text-[var(--text-4)]">(optional)</span>
                </label>
                <textarea
                  value={fixes}
                  onChange={(e) => setFixes(e.target.value)}
                  rows={3}
                  placeholder={"Fixed crash on launch for some Android devices\nResolved incorrect badge count"}
                  className={`${fieldInput} resize-none`}
                />
                <p className={bulletHint}>One item per line — auto-formatted as bullets</p>
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
            <div className="flex items-center justify-end gap-2">
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
        </form>
      </div>
    </div>
  );
}
