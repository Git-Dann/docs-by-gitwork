"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SettingsCard } from "@/components/settings/settings-card";
import { SavedIndicator } from "@/components/settings/saved-indicator";
import { Switch } from "@/components/ui/switch";
import {
  SEASONAL_CHANGED_EVENT,
  SEASONAL_THEMES,
  type SeasonalThemeSetting,
} from "@/lib/seasonal-themes";

const KEY = ["settings", "seasonal-theme"];

async function readSetting(): Promise<SeasonalThemeSetting> {
  const res = await fetch("/api/settings/seasonal-theme", { credentials: "same-origin" });
  if (!res.ok) throw new Error("Couldn't read the seasonal theme.");
  return res.json();
}

async function saveSetting(input: { enabled: boolean; theme: string }): Promise<SeasonalThemeSetting> {
  const res = await fetch("/api/settings/seasonal-theme", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? "Couldn't save the seasonal theme.");
  return body as SeasonalThemeSetting;
}

/**
 * Settings → Appearance (Admins and Super Admins). One seasonal theme for the whole workspace:
 * a switch, and a choice of theme while it's on. Saves on change; the theme provider re-reads it.
 */
export function AppearancePanel() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: KEY, queryFn: readSetting });
  const save = useMutation({
    mutationFn: saveSetting,
    onSuccess: (next) => {
      qc.setQueryData(KEY, next);
      window.dispatchEvent(new Event(SEASONAL_CHANGED_EVENT));
    },
  });

  const enabled = data?.enabled ?? false;
  const theme = data?.theme ?? SEASONAL_THEMES[0].id;
  const chosen = SEASONAL_THEMES.find((t) => t.id === theme) ?? SEASONAL_THEMES[0];

  return (
    <SettingsCard number="01" title="Seasonal theme" right={<SavedIndicator mutation={save} />}>
      {isLoading ? (
        <p className="text-[13px] text-[var(--text-4)]">Loading…</p>
      ) : isError ? (
        <p className="text-[13px] text-[var(--danger-500)]">Couldn&apos;t read the seasonal theme.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[14px] font-medium text-[var(--text-1)]">Show a seasonal theme</p>
              <p className="mt-0.5 text-[13px] text-[var(--text-3)]">
                Applies to everyone in the workspace, across Foundry. Client pages and sign-in are never themed.
              </p>
            </div>
            <Switch
              checked={enabled}
              label="Show a seasonal theme"
              disabled={save.isPending}
              onChange={(next) => save.mutate({ enabled: next, theme })}
              className="mt-0.5 shrink-0"
            />
          </div>

          {enabled ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="seasonal-theme" className="text-[12px] font-medium text-[var(--text-2)]">
                Theme
              </label>
              <select
                id="seasonal-theme"
                className="app-select app-select-chevron pr-9 sm:max-w-xs"
                value={theme}
                disabled={save.isPending}
                onChange={(e) => save.mutate({ enabled: true, theme: e.target.value })}
              >
                {SEASONAL_THEMES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p className="text-[12px] text-[var(--text-3)]">{chosen.description}</p>
            </div>
          ) : null}

          {save.isError ? (
            <p className="text-[12px] text-[var(--danger-500)]">{(save.error as Error).message}</p>
          ) : null}
        </div>
      )}
    </SettingsCard>
  );
}
