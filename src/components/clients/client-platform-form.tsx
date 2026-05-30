"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PreviewImagePicker } from "@/components/ui/preview-image-picker";
import type { ClientPlatformRecord } from "@/types/client";

type PlatformInput = {
  name: string;
  platformType: string;
  url: string;
  stagingUrl: string;
  repoUrl: string;
  credentials: string;
  notes: string;
  previewImageUrl: string;
};

const PLATFORM_TYPES = [
  "Next.js",
  "WordPress",
  "Laravel",
  "React",
  "Vue",
  "Shopify",
  "Webflow",
  "Admin Panel",
  "Analytics",
  "API",
  "Mobile App",
  "Other",
];

export function ClientPlatformFormModal({
  platform,
  onSave,
  onClose,
  isSaving,
  error,
}: {
  platform?: ClientPlatformRecord | null;
  onSave: (input: Partial<PlatformInput> & { name: string }) => void;
  onClose: () => void;
  isSaving: boolean;
  error?: string | null;
}) {
  const [form, setForm] = useState<PlatformInput>({
    name: platform?.name ?? "",
    platformType: platform?.platformType ?? "",
    url: platform?.url ?? "",
    stagingUrl: platform?.stagingUrl ?? "",
    repoUrl: platform?.repoUrl ?? "",
    credentials: platform?.credentials ?? "",
    notes: platform?.notes ?? "",
    previewImageUrl: platform?.previewImageUrl ?? "",
  });

  function set(field: keyof PlatformInput, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit() {
    if (!form.name.trim()) return;
    onSave(form);
  }

  return (
    <div className="fixed inset-0 z-30">
      <button
        type="button"
        aria-label="Close"
        className="app-dialog-backdrop absolute inset-0"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="app-dialog-panel w-full max-w-lg p-6">
          <p className="app-eyebrow">Platform</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
            {platform ? "Edit platform" : "Add platform"}
          </h2>

          <div className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                  Name <span className="text-rose-600">*</span>
                </span>
                <input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  className="app-input"
                  placeholder="Admin Panel"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                  Type
                </span>
                <select
                  value={form.platformType}
                  onChange={(e) => set("platformType", e.target.value)}
                  className="app-input"
                >
                  <option value="">Select type…</option>
                  {PLATFORM_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                  Production URL
                </span>
                <input
                  value={form.url}
                  onChange={(e) => set("url", e.target.value)}
                  className="app-input"
                  placeholder="https://admin.client.com"
                  type="url"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                  Staging URL
                </span>
                <input
                  value={form.stagingUrl}
                  onChange={(e) => set("stagingUrl", e.target.value)}
                  className="app-input"
                  placeholder="https://staging.client.com"
                  type="url"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                GitHub / Repo URL
              </span>
              <input
                value={form.repoUrl}
                onChange={(e) => set("repoUrl", e.target.value)}
                className="app-input"
                placeholder="https://github.com/org/repo"
                type="url"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                Credentials
              </span>
              <textarea
                value={form.credentials}
                onChange={(e) => set("credentials", e.target.value)}
                className="app-input min-h-[80px] resize-y"
                placeholder="Login details, API keys, env var names…"
              />
              <p className="mt-1 text-xs text-amber-700">
                Stored in plain text — internal use only. Do not store production secrets here.
              </p>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                Notes
              </span>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                className="app-input min-h-[72px] resize-y"
                placeholder="Deployment notes, gotchas, client contacts for this platform…"
              />
            </label>

            <div>
              <span className="mb-2 block text-sm font-medium text-[var(--text-2)]">
                Card preview image
              </span>
              <PreviewImagePicker
                value={form.previewImageUrl}
                onChange={(value) => set("previewImageUrl", value)}
              />
            </div>

            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              loading={isSaving}
              onClick={handleSubmit}
              disabled={!form.name.trim()}
            >
              {platform ? "Save changes" : "Add platform"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
