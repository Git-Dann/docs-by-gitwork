"use client";

import { useState } from "react";
import { EyeIcon, EyeSlashIcon, ClipboardIcon, CheckIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { PreviewImagePicker } from "@/components/ui/preview-image-picker";
import { useRevealClientPlatform } from "@/hooks/use-proposals";
import type { ClientPlatformRecord } from "@/types/client";

type PlatformInput = {
  name: string;
  platformType: string;
  url: string;
  stagingUrl: string;
  repoUrl: string;
  username: string;
  password: string;
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

// App store types get a special form with character-counted fields
const APP_STORE_TYPES = ["iOS App Store", "Google Play", "Amazon Fire TV"];

// Character limits per platform
const APP_STORE_LIMITS: Record<
  string,
  Array<{ field: string; label: string; limit: number; multiline?: boolean }>
> = {
  "iOS App Store": [
    { field: "appName", label: "App Name", limit: 30 },
    { field: "subtitle", label: "Subtitle", limit: 30 },
    { field: "keywords", label: "Keywords", limit: 100 },
    { field: "promotionalText", label: "Promotional Text", limit: 170 },
    { field: "description", label: "Description", limit: 4000, multiline: true },
  ],
  "Google Play": [
    { field: "appName", label: "App Name", limit: 30 },
    { field: "shortDescription", label: "Short Description", limit: 80 },
    { field: "fullDescription", label: "Full Description", limit: 4000, multiline: true },
  ],
  "Amazon Fire TV": [
    { field: "appTitle", label: "App Title", limit: 75 },
    { field: "shortDescription", label: "Short Description", limit: 150 },
    { field: "longDescription", label: "Long Description", limit: 4000, multiline: true },
  ],
};

/** Parse app store JSON from notes field, or return empty object. */
function parseAppStoreNotes(notes: string): Record<string, string> {
  if (!notes.trim().startsWith("{")) return {};
  try {
    return JSON.parse(notes) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Counter chip — amber at 90%, red at 100% */
function CharCount({ value, limit }: { value: string; limit: number }) {
  const len = value.length;
  const pct = limit > 0 ? len / limit : 0;
  const color =
    pct >= 1 ? "text-red-600" : pct >= 0.9 ? "text-amber-600" : "text-[var(--text-4)]";
  return (
    <span className={`text-[10px] tabular-nums ${color}`} style={{ fontFamily: "var(--font-mono)" }}>
      {len} / {limit}
    </span>
  );
}

/** App store listing editor — shown when an app store platform type is selected. */
function AppStoreFields({
  platformType,
  values,
  onChange,
}: {
  platformType: string;
  values: Record<string, string>;
  onChange: (field: string, value: string) => void;
}) {
  const fields = APP_STORE_LIMITS[platformType] ?? [];

  return (
    <div className="space-y-4">
      <p className="rounded-[6px] bg-[var(--surface-0)] px-3 py-2 text-[12px] text-[var(--text-3)]">
        Listing copy for the <strong>{platformType}</strong>. Character limits are enforced per store
        guidelines.
      </p>
      {fields.map(({ field, label, limit, multiline }) => {
        const val = values[field] ?? "";
        return (
          <div key={field}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text-2)]">{label}</span>
              <CharCount value={val} limit={limit} />
            </div>
            {multiline ? (
              <textarea
                value={val}
                onChange={(e) => onChange(field, e.target.value)}
                maxLength={limit}
                rows={5}
                className="app-input min-h-[100px] resize-y"
                placeholder={`${label}…`}
              />
            ) : (
              <input
                type="text"
                value={val}
                onChange={(e) => onChange(field, e.target.value)}
                maxLength={limit}
                className="app-input"
                placeholder={`${label}…`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A credential input with optional show/hide (for secrets) + copy-to-clipboard. */
function CredentialField({
  label,
  value,
  onChange,
  secret,
  showSecret,
  onToggleSecret,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secret?: boolean;
  showSecret?: boolean;
  onToggleSecret?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — ignore */
    }
  }
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">{label}</span>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={secret && !showSecret ? "password" : "text"}
          className="app-input pr-16"
          placeholder={label}
          autoComplete="off"
          spellCheck={false}
        />
        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {secret && onToggleSecret && (
            <button
              type="button"
              onClick={onToggleSecret}
              className="rounded-[4px] p-1 text-[var(--text-4)] transition hover:text-[var(--text-2)]"
              title={showSecret ? "Hide" : "Show"}
            >
              {showSecret ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!value}
            className="rounded-[4px] p-1 text-[var(--text-4)] transition hover:text-[var(--text-2)] disabled:opacity-30"
            title="Copy"
          >
            {copied ? <CheckIcon className="h-4 w-4 text-emerald-600" /> : <ClipboardIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </label>
  );
}

export function ClientPlatformFormModal({
  platform,
  slug,
  onSave,
  onClose,
  isSaving,
  error,
}: {
  platform?: ClientPlatformRecord | null;
  slug: string;
  onSave: (input: Partial<PlatformInput> & { name: string }) => void;
  onClose: () => void;
  isSaving: boolean;
  error?: string | null;
}) {
  const isAppStore = APP_STORE_TYPES.includes(platform?.platformType ?? "");
  // Credentials are encrypted at rest and never sent in the list payload — fetched on demand.
  // Show a Reveal button when editing a platform that already has saved creds; new platforms
  // (or ones without creds) are editable straight away.
  const hasStoredCreds = Boolean(platform?.hasUsername || platform?.hasPassword);
  const [credsRevealed, setCredsRevealed] = useState(!hasStoredCreds);
  const [showPassword, setShowPassword] = useState(false);
  const revealMutation = useRevealClientPlatform(slug);

  const [form, setForm] = useState<PlatformInput>({
    name: platform?.name ?? "",
    platformType: platform?.platformType ?? "",
    url: platform?.url ?? "",
    stagingUrl: platform?.stagingUrl ?? "",
    repoUrl: platform?.repoUrl ?? "",
    username: "",
    password: "",
    notes: isAppStore ? "" : (platform?.notes ?? ""),
    previewImageUrl: platform?.previewImageUrl ?? "",
  });

  async function handleReveal() {
    if (!platform?.id) return;
    try {
      const { credentials } = await revealMutation.mutateAsync(platform.id);
      setForm((prev) => ({ ...prev, username: credentials.username ?? "", password: credentials.password ?? "" }));
      setCredsRevealed(true);
    } catch {
      /* surfaced via revealMutation.isError */
    }
  }

  // App store listing fields — parsed from notes JSON on edit
  const [appStoreValues, setAppStoreValues] = useState<Record<string, string>>(
    isAppStore ? parseAppStoreNotes(platform?.notes ?? "") : {},
  );

  function set(field: keyof PlatformInput, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setAppField(field: string, value: string) {
    setAppStoreValues((prev) => ({ ...prev, [field]: value }));
  }

  const isAppStoreType = APP_STORE_TYPES.includes(form.platformType);

  function handleSubmit() {
    if (!form.name.trim()) return;
    const { username, password, ...rest } = form;
    const payload: Partial<PlatformInput> & { name: string } = { ...rest };
    if (isAppStoreType) {
      // Serialize app store content to notes as JSON
      payload.notes = JSON.stringify(appStoreValues);
    }
    // Only send credentials when they've been revealed/edited — omitting them leaves the stored
    // ciphers untouched, so editing the name/URL never wipes saved credentials.
    if (credsRevealed) {
      payload.username = username;
      payload.password = password;
    }
    onSave(payload);
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
        <div className="app-dialog-panel w-full max-w-3xl overflow-hidden">
          {/* Widget header */}
          <div className="widget-header">
            <span className="widget-header__label">
              {platform ? "EDIT PLATFORM" : "NEW PLATFORM"}
            </span>
          </div>

          <div className="p-6">
            <h2 className="mb-5 text-xl font-semibold tracking-[-0.03em] text-[var(--text-1)]">
              {platform ? "Edit platform" : "Add platform"}
            </h2>

            {/* ── Two-column layout ── */}
            <div className="grid grid-cols-[240px_1fr] gap-6 items-start">
              {/* Left — preview image (only for non-app-store) */}
              {!isAppStoreType ? (
                <div>
                  <p className="mb-2 text-sm font-medium text-[var(--text-2)]">Card preview</p>
                  <PreviewImagePicker
                    value={form.previewImageUrl}
                    onChange={(v) => set("previewImageUrl", v)}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="mb-2 text-sm font-medium text-[var(--text-2)]">App Name</p>
                    <input
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                      className="app-input"
                      placeholder="App name (display)"
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-[var(--text-2)]">Store URL</p>
                    <input
                      value={form.url}
                      onChange={(e) => set("url", e.target.value)}
                      className="app-input"
                      placeholder="https://apps.apple.com/…"
                      type="url"
                    />
                  </div>
                </div>
              )}

              {/* Right — form fields */}
              <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
                {!isAppStoreType && (
                  <>
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
                          // eslint-disable-next-line jsx-a11y/no-autofocus
                          autoFocus
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
                          <optgroup label="App Stores">
                            {APP_STORE_TYPES.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Platforms">
                            {PLATFORM_TYPES.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </optgroup>
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

                    <div className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-[var(--text-2)]">Credentials</span>
                        <span
                          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-emerald-700"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          <LockClosedIcon className="h-3 w-3" />
                          Encrypted
                        </span>
                      </div>
                      {hasStoredCreds && !credsRevealed ? (
                        <div>
                          <button
                            type="button"
                            onClick={() => void handleReveal()}
                            disabled={revealMutation.isPending}
                            className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--text-2)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                          >
                            <EyeIcon className="h-4 w-4" />
                            {revealMutation.isPending ? "Revealing…" : "Reveal to view / edit"}
                          </button>
                          {revealMutation.isError && (
                            <p className="mt-1.5 text-xs text-rose-700">
                              {(revealMutation.error as Error)?.message ?? "Couldn't reveal credentials."}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <CredentialField
                            label="Username / login"
                            value={form.username}
                            onChange={(v) => set("username", v)}
                          />
                          <CredentialField
                            label="Password"
                            value={form.password}
                            onChange={(v) => set("password", v)}
                            secret
                            showSecret={showPassword}
                            onToggleSecret={() => setShowPassword((s) => !s)}
                          />
                        </div>
                      )}
                      <p className="mt-2 text-[11px] text-[var(--text-4)]">
                        Encrypted at rest (AES-256-GCM). Use the copy buttons to grab a value.
                      </p>
                    </div>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                        Notes
                      </span>
                      <textarea
                        value={form.notes}
                        onChange={(e) => set("notes", e.target.value)}
                        className="app-input min-h-[72px] resize-y"
                        placeholder="Deployment notes, gotchas, client contacts…"
                      />
                    </label>
                  </>
                )}

                {/* App store type selector (when in app store mode, shown on right) */}
                {isAppStoreType && (
                  <>
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                        Store
                      </span>
                      <select
                        value={form.platformType}
                        onChange={(e) => {
                          set("platformType", e.target.value);
                          // Reset app store values when switching store type
                          setAppStoreValues({});
                        }}
                        className="app-input"
                      >
                        {APP_STORE_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </label>

                    <AppStoreFields
                      platformType={form.platformType}
                      values={appStoreValues}
                      onChange={setAppField}
                    />
                  </>
                )}

                {error ? <p className="text-sm text-rose-700">{error}</p> : null}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-end gap-2 border-t border-[rgba(0,0,0,0.06)] pt-4">
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
    </div>
  );
}
