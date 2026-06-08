"use client";

import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

const PLATFORMS = [
  { value: "IOS", label: "iOS App Store" },
  { value: "ANDROID", label: "Google Play" },
  { value: "FIRESTICK", label: "Amazon Fire TV" },
  { value: "WEB", label: "Web" },
  { value: "ALL", label: "All platforms" },
];

interface Props {
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

export function ChangelogEntryForm({ onSave, onClose, isSaving }: Props) {
  const [platform, setPlatform] = useState("IOS");
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [releasedAt, setReleasedAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!version.trim()) { setError("Version is required"); return; }
    if (!title.trim()) { setError("Title is required"); return; }
    setError(null);
    await onSave({
      platform,
      version: version.trim(),
      title: title.trim(),
      body: body.trim() || undefined,
      releasedAt: releasedAt || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-[12px] bg-white shadow-xl">
        {/* Header */}
        <div className="widget-header rounded-t-[12px]">
          <span className="widget-header__label text-sm">Add Version</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-4)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] transition"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 p-5">
          {/* Platform */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]"
              style={{ fontFamily: "var(--font-mono)" }}>
              Platform
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full rounded-[6px] border border-[rgba(0,0,0,0.1)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-500)]/20"
            >
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Version */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]"
              style={{ fontFamily: "var(--font-mono)" }}>
              Version
            </label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. 2.4.1"
              className="w-full rounded-[6px] border border-[rgba(0,0,0,0.1)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-500)]/20"
              style={{ fontFamily: "var(--font-mono)" }}
            />
          </div>

          {/* Title */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]"
              style={{ fontFamily: "var(--font-mono)" }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Performance improvements and bug fixes"
              className="w-full rounded-[6px] border border-[rgba(0,0,0,0.1)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-500)]/20"
            />
          </div>

          {/* Release notes */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]"
              style={{ fontFamily: "var(--font-mono)" }}>
              Release Notes <span className="normal-case text-[var(--text-4)]">(optional)</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="What was added, changed, or fixed..."
              className="w-full resize-none rounded-[6px] border border-[rgba(0,0,0,0.1)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-500)]/20"
            />
          </div>

          {/* Release date */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]"
              style={{ fontFamily: "var(--font-mono)" }}>
              Release Date <span className="normal-case text-[var(--text-4)]">(optional)</span>
            </label>
            <input
              type="date"
              value={releasedAt}
              onChange={(e) => setReleasedAt(e.target.value)}
              className="w-full rounded-[6px] border border-[rgba(0,0,0,0.1)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-500)]/20"
            />
          </div>

          {error && (
            <p className="rounded-[6px] bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[6px] px-4 py-2 text-sm text-[var(--text-3)] hover:bg-[var(--surface-1)] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-[6px] bg-[var(--brand-700)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-800)] disabled:opacity-60 transition"
            >
              {isSaving ? "Saving…" : "Add entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
