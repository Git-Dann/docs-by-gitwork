"use client";

import { useEffect, useState } from "react";
import { EyeIcon, EyeSlashIcon, ClipboardIcon, CheckIcon, LockClosedIcon, PlusIcon, PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { PreviewImagePicker } from "@/components/ui/preview-image-picker";
import { usePlatformLoginActions } from "@/hooks/use-proposals";
import type { ClientPlatformRecord, ClientPlatformLoginSummary, ClientPlatformReveal } from "@/types/client";
import { isSafeLinkUrl, labelFromUrl, MAX_PLATFORM_LINKS, type PlatformLink } from "@/lib/platform-links";
import { useOgPreview } from "@/hooks/use-proposals";

type PlatformInput = {
  name: string;
  platformType: string;
  url: string;
  stagingUrl: string;
  repoUrl: string;
  notes: string;
  previewImageUrl: string;
  featuredInWiki: boolean;
  /** Extra client-provided links (ClickUp board, Figma file …). */
  links: PlatformLink[];
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
  readOnly,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secret?: boolean;
  showSecret?: boolean;
  onToggleSecret?: () => void;
  readOnly?: boolean;
  placeholder?: string;
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
          readOnly={readOnly}
          type={secret && !showSecret ? "password" : "text"}
          // Reserve room for the icon buttons: two (show + copy) for secrets, one (copy) otherwise.
          className={`app-input ${secret ? "pr-16" : "pr-10"} ${readOnly ? "bg-[var(--surface-1)]" : ""}`}
          placeholder={placeholder ?? label}
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

// ── Multi-login manager (live add/edit/delete/reveal per credential set) ──────

function PlatformLogins({ slug, platform }: { slug: string; platform?: ClientPlatformRecord | null }) {
  const platformId = platform?.id ?? null;
  const logins = platform?.logins ?? [];
  const [adding, setAdding] = useState(false);

  return (
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

      {!platformId ? (
        <p className="text-[12px] text-[var(--text-4)]">Save the platform first, then add logins here.</p>
      ) : (
        <div className="space-y-2">
          {logins.length === 0 && !adding && (
            <p className="text-[12px] text-[var(--text-4)]">No logins yet — add one below.</p>
          )}
          {logins.map((login) => (
            <LoginRow key={login.id} slug={slug} platformId={platformId} login={login} />
          ))}
          {adding ? (
            <LoginEditor slug={slug} platformId={platformId} onDone={() => setAdding(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-[6px] border border-dashed border-[var(--border-2)] px-3 py-1.5 text-sm font-medium text-[var(--text-3)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <PlusIcon className="h-4 w-4" />
              Add login
            </button>
          )}
        </div>
      )}
      <p className="mt-2 text-[11px] text-[var(--text-4)]">
        Encrypted at rest (AES-256-GCM). Reveal to view, then copy.
      </p>
    </div>
  );
}

function LoginRow({ slug, platformId, login }: { slug: string; platformId: string; login: ClientPlatformLoginSummary }) {
  const { remove, reveal } = usePlatformLoginActions(slug, platformId);
  const [revealed, setRevealed] = useState<ClientPlatformReveal | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function toggleReveal() {
    if (revealed) {
      setRevealed(null);
      setShowPassword(false);
      return;
    }
    try {
      const { credentials } = await reveal.mutateAsync(login.id);
      setRevealed(credentials);
    } catch {
      /* surfaced via reveal.isError */
    }
  }

  // Editing requires the current values so a save doesn't wipe them — reveal first, then open.
  async function startEdit() {
    if (!revealed) {
      try {
        const { credentials } = await reveal.mutateAsync(login.id);
        setRevealed(credentials);
      } catch {
        return;
      }
    }
    setEditing(true);
  }

  if (editing) {
    return (
      <LoginEditor slug={slug} platformId={platformId} login={login} initial={revealed} onDone={() => setEditing(false)} />
    );
  }

  return (
    <div className="rounded-[6px] border border-[var(--border-1)] bg-white p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-[var(--text-1)]">{login.label || "Login"}</span>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => void toggleReveal()}
            disabled={reveal.isPending}
            className="rounded-[4px] p-1 text-[var(--text-4)] transition hover:text-[var(--text-2)] disabled:opacity-50"
            title={revealed ? "Hide" : "Reveal"}
          >
            {revealed ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => void startEdit()}
            disabled={reveal.isPending}
            className="rounded-[4px] p-1 text-[var(--text-4)] transition hover:text-[var(--text-2)] disabled:opacity-50"
            title="Edit"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => (confirmDelete ? remove.mutate(login.id) : setConfirmDelete(true))}
            onBlur={() => setConfirmDelete(false)}
            disabled={remove.isPending}
            className={`rounded-[4px] p-1 transition disabled:opacity-50 ${confirmDelete ? "text-rose-600" : "text-[var(--text-4)] hover:text-rose-600"}`}
            title={confirmDelete ? "Click again to delete" : "Delete"}
          >
            {confirmDelete ? <span className="px-0.5 text-[11px] font-medium">Sure?</span> : <TrashIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        <CredentialField
          label="Username / login"
          value={revealed?.username ?? ""}
          onChange={() => {}}
          readOnly
          placeholder={login.hasUsername ? "••••••••" : "(none)"}
        />
        <CredentialField
          label="Password"
          value={revealed?.password ?? ""}
          onChange={() => {}}
          readOnly
          secret
          showSecret={showPassword}
          onToggleSecret={() => setShowPassword((s) => !s)}
          placeholder={login.hasPassword ? "••••••••" : "(none)"}
        />
      </div>
    </div>
  );
}

function LoginEditor({
  slug,
  platformId,
  login,
  initial,
  onDone,
}: {
  slug: string;
  platformId: string;
  login?: ClientPlatformLoginSummary;
  initial?: ClientPlatformReveal | null;
  onDone: () => void;
}) {
  const { create, update } = usePlatformLoginActions(slug, platformId);
  const [label, setLabel] = useState(login?.label ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState(initial?.password ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const isEdit = Boolean(login);
  const pending = create.isPending || update.isPending;

  async function save() {
    try {
      if (isEdit && login) {
        await update.mutateAsync({ loginId: login.id, body: { label: label || null, username, password } });
      } else {
        await create.mutateAsync({ label: label || undefined, username, password });
      }
      onDone();
    } catch {
      /* surfaced via mutation.isError */
    }
  }

  return (
    <div className="rounded-[6px] border border-[var(--accent)] bg-white p-2.5">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="app-input mb-2"
        placeholder="Label (e.g. Admin, FTP) — optional"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <CredentialField label="Username / login" value={username} onChange={setUsername} />
        <CredentialField
          label="Password"
          value={password}
          onChange={setPassword}
          secret
          showSecret={showPassword}
          onToggleSecret={() => setShowPassword((s) => !s)}
        />
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" variant="primary" size="sm" loading={pending} onClick={() => void save()}>
          {isEdit ? "Save login" : "Add login"}
        </Button>
      </div>
    </div>
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

  const [form, setForm] = useState<PlatformInput>({
    name: platform?.name ?? "",
    platformType: platform?.platformType ?? "",
    url: platform?.url ?? "",
    stagingUrl: platform?.stagingUrl ?? "",
    repoUrl: platform?.repoUrl ?? "",
    notes: isAppStore ? "" : (platform?.notes ?? ""),
    previewImageUrl: platform?.previewImageUrl ?? "",
    links: platform?.links ?? [],
    featuredInWiki: platform?.featuredInWiki ?? false,
  });

  // App store listing fields — parsed from notes JSON on edit
  const [appStoreValues, setAppStoreValues] = useState<Record<string, string>>(
    isAppStore ? parseAppStoreNotes(platform?.notes ?? "") : {},
  );

  function set(field: keyof PlatformInput, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function setLinks(next: PlatformLink[]) {
    setForm((prev) => ({ ...prev, links: next }));
  }

  /**
   * Auto-fill the card image from whatever the link advertises (og:image), so
   * nobody has to go and find a screenshot for every platform. Only ever fills a
   * BLANK image — an uploaded or previously-fetched one is never overwritten,
   * because the automatic guess should not beat a human's choice.
   */
  const previewSource = form.previewImageUrl ? null : form.url.trim() || null;
  const og = useOgPreview(previewSource);
  useEffect(() => {
    const found = og.data?.imageUrl;
    if (found && !form.previewImageUrl) set("previewImageUrl", found);
  }, [og.data?.imageUrl, form.previewImageUrl]);

  function setAppField(field: string, value: string) {
    setAppStoreValues((prev) => ({ ...prev, [field]: value }));
  }

  const isAppStoreType = APP_STORE_TYPES.includes(form.platformType);

  function handleSubmit() {
    if (!form.name.trim()) return;
    const payload: Partial<PlatformInput> & { name: string } = { ...form };
    if (isAppStoreType) {
      // Serialize app store content to notes as JSON
      payload.notes = JSON.stringify(appStoreValues);
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
            {/* The 240px preview column is FIXED, so below ~500px it ate the space
                and squeezed every field to a stub — measured at 430px: 7 fields
                under 120px wide and 4 labels clipped. Browser zoom does the same
                thing, since it shrinks the viewport in CSS pixels. Stack below sm. */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-[240px_1fr] sm:items-start">
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

              {/* Right — form fields.
                  min-w-0: a grid item's automatic minimum size is its content, so
                  without it this 1fr track is pushed wider than its share by the
                  nested two-column rows, and the panel's overflow-hidden clips the
                  right-hand fields (Type, Staging URL) clean off. */}
              <div className="min-w-0 max-h-[65vh] space-y-4 overflow-y-auto pr-1">
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

                    {/* Other links — whatever the client hands over that isn't
                        production/staging/repo: a ClickUp board, a Figma file, a
                        status page. Free-form because the list is theirs, not ours. */}
                    <div>
                      <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
                        Other links
                      </span>
                      <div className="space-y-2">
                        {form.links.map((link, i) => {
                          const bad = link.url.trim().length > 0 && !isSafeLinkUrl(link.url);
                          return (
                            <div key={i} className="flex items-start gap-2">
                              <input
                                value={link.label}
                                onChange={(e) => {
                                  const next = [...form.links];
                                  next[i] = { ...next[i], label: e.target.value };
                                  setLinks(next);
                                }}
                                className="app-input w-[34%] min-w-0"
                                placeholder="ClickUp board"
                              />
                              <div className="min-w-0 flex-1">
                                <input
                                  value={link.url}
                                  onChange={(e) => {
                                    const next = [...form.links];
                                    const url = e.target.value;
                                    // Name it after the host if they haven't typed a label —
                                    // an unlabelled row would otherwise render as bare "Link".
                                    const label =
                                      next[i].label || (isSafeLinkUrl(url) ? labelFromUrl(url) : "");
                                    next[i] = { label, url };
                                    setLinks(next);
                                  }}
                                  className="app-input w-full"
                                  placeholder="https://app.clickup.com/…"
                                  type="url"
                                />
                                {bad ? (
                                  <p className="mt-1 text-[12px] text-rose-600">
                                    Needs to start with http:// or https:// — anything else is
                                    dropped when saved.
                                  </p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => setLinks(form.links.filter((_, j) => j !== i))}
                                aria-label={`Remove ${link.label || "link"}`}
                                className="mt-1 shrink-0 rounded-[6px] p-1.5 text-[var(--text-4)] transition hover:bg-rose-50 hover:text-rose-600"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      {form.links.length < MAX_PLATFORM_LINKS ? (
                        <button
                          type="button"
                          onClick={() => setLinks([...form.links, { label: "", url: "" }])}
                          className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--brand-700)] transition hover:text-[var(--brand-800)]"
                        >
                          <PlusIcon className="h-4 w-4" /> Add link
                        </button>
                      ) : (
                        <p className="mt-2 text-[12px] text-[var(--text-4)]">
                          {MAX_PLATFORM_LINKS} links is the maximum.
                        </p>
                      )}
                    </div>

                    <PlatformLogins slug={slug} platform={platform} />

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

                    {/* Feature-in-wiki toggle — surfaces this platform's prod +
                        staging URLs as buttons in the client wiki header. */}
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={form.featuredInWiki}
                        onChange={(e) => setForm((prev) => ({ ...prev, featuredInWiki: e.target.checked }))}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand-600)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[var(--text-1)]">
                          Feature in wiki header
                        </span>
                        <span className="mt-0.5 block text-[12px] text-[var(--text-4)]">
                          Surfaces this platform&apos;s Production &amp; Staging URLs as buttons at the top of the client wiki.
                        </span>
                      </span>
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
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-[rgba(0,0,0,0.06)] pt-4">
              {/* Say WHY the button is dead. A disabled primary with no reason is a
                  dead end — the required marker on Name is a red asterisk halfway
                  up a two-column form, and it is easy to fill in everything else
                  and be left wondering what is wrong. */}
              {!form.name.trim() ? (
                <p className="mr-auto text-[13px] text-[var(--text-4)]">
                  Add a <span className="font-medium text-[var(--text-2)]">Name</span> to save this
                  platform.
                </p>
              ) : null}
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
                title={!form.name.trim() ? "Name is required" : undefined}
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
