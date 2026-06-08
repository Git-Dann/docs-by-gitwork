"use client";

import { useState } from "react";
import { CheckIcon } from "@heroicons/react/24/outline";

// ─── Per-platform character limits ───────────────────────────────────────────

const IOS_FIELDS: Array<{ key: string; label: string; limit: number; multiline: boolean; hint?: string }> = [
  { key: "appName", label: "App Name", limit: 30, multiline: false, hint: "Displayed under your app icon on the Home screen" },
  { key: "subtitle", label: "Subtitle", limit: 30, multiline: false, hint: "Appears below the app name in search results" },
  { key: "keywords", label: "Keywords", limit: 100, multiline: false, hint: "Comma-separated — not shown publicly" },
  { key: "promotionalText", label: "Promotional Text", limit: 170, multiline: true, hint: "Shown at the top of the description — can be updated anytime without a new review" },
  { key: "description", label: "Description", limit: 4000, multiline: true, hint: "Detailed description of your app" },
];

const ANDROID_FIELDS: Array<{ key: string; label: string; limit: number; multiline: boolean; hint?: string }> = [
  { key: "appName", label: "App Name", limit: 30, multiline: false, hint: "Shown in Google Play search and app page" },
  { key: "shortDescription", label: "Short Description", limit: 80, multiline: false, hint: "Appears in search results and at the top of your app listing" },
  { key: "fullDescription", label: "Full Description", limit: 4000, multiline: true, hint: "Full description with rich formatting support" },
];

const FIRESTICK_FIELDS: Array<{ key: string; label: string; limit: number; multiline: boolean; hint?: string }> = [
  { key: "appTitle", label: "App Title", limit: 75, multiline: false, hint: "Title shown in the Amazon Appstore" },
  { key: "shortDescription", label: "Short Description", limit: 150, multiline: false, hint: "Brief description shown in search results" },
  { key: "longDescription", label: "Long Description", limit: 4000, multiline: true, hint: "Full description — supports basic HTML" },
];

type Platform = "ios" | "android" | "firestick";

const PLATFORM_FIELDS: Record<Platform, typeof IOS_FIELDS> = {
  ios: IOS_FIELDS,
  android: ANDROID_FIELDS,
  firestick: FIRESTICK_FIELDS,
};

interface Props {
  platform: Platform;
  content: Record<string, string>;
  onSave: (content: Record<string, string>) => Promise<void>;
  isSaving: boolean;
  readOnly?: boolean;
}

function CharCountField({
  label,
  fieldKey,
  limit,
  multiline,
  hint,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  fieldKey: string;
  limit: number;
  multiline: boolean;
  hint?: string;
  value: string;
  onChange: (key: string, val: string) => void;
  readOnly?: boolean;
}) {
  const len = value.length;
  const pct = len / limit;
  const counterColor =
    pct >= 1 ? "text-red-600" : pct >= 0.9 ? "text-amber-600" : "text-[var(--text-4)]";

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-3)]"
          style={{ fontFamily: "var(--font-mono)" }}>
          {label}
        </label>
        <span className={`text-xs tabular-nums ${counterColor}`}>
          {len} / {limit}
        </span>
      </div>
      {hint && <p className="text-xs text-[var(--text-4)]">{hint}</p>}
      {multiline ? (
        <textarea
          id={fieldKey}
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          maxLength={limit}
          readOnly={readOnly}
          rows={fieldKey === "keywords" ? 2 : 6}
          className="w-full resize-y rounded-[6px] border border-[rgba(0,0,0,0.1)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-500)]/20 read-only:bg-[var(--surface-1)] read-only:text-[var(--text-3)]"
        />
      ) : (
        <input
          type="text"
          id={fieldKey}
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
          maxLength={limit}
          readOnly={readOnly}
          className="w-full rounded-[6px] border border-[rgba(0,0,0,0.1)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-500)]/20 read-only:bg-[var(--surface-1)] read-only:text-[var(--text-3)]"
        />
      )}
    </div>
  );
}

const PLATFORM_LABELS: Record<Platform, string> = {
  ios: "iOS App Store",
  android: "Google Play Store",
  firestick: "Amazon Fire TV",
};

export function AppStoreEditor({ platform, content, onSave, isSaving, readOnly = false }: Props) {
  const [fields, setFields] = useState<Record<string, string>>(content ?? {});
  const [saved, setSaved] = useState(false);

  function handleChange(key: string, val: string) {
    setFields((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSave() {
    await onSave(fields);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const platformFields = PLATFORM_FIELDS[platform];

  return (
    <div className="max-w-2xl">
      <h2 className="mb-1 text-xl font-semibold text-[var(--text-1)]">{PLATFORM_LABELS[platform]}</h2>
      <p className="mb-6 text-sm text-[var(--text-4)]">
        Store listing copy with platform character limits.
      </p>

      <div className="space-y-6">
        {platformFields.map((f) => (
          <CharCountField
            key={f.key}
            label={f.label}
            fieldKey={f.key}
            limit={f.limit}
            multiline={f.multiline}
            hint={f.hint}
            value={fields[f.key] ?? ""}
            onChange={handleChange}
            readOnly={readOnly}
          />
        ))}
      </div>

      {!readOnly && (
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="flex items-center gap-1.5 rounded-[6px] bg-[var(--brand-700)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-800)] disabled:opacity-60 transition"
          >
            {isSaving ? "Saving…" : "Save listing"}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckIcon className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
        </div>
      )}
    </div>
  );
}
