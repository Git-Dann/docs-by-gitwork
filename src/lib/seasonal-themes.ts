/**
 * Seasonal themes (Halloween now; Christmas next). One switch for the whole workspace, set by
 * an Admin in Settings → Appearance. Framework-free: the settings panel, the API and the theme
 * provider all read this list, so adding a theme is one entry here plus its styles.
 *
 * The provider copies the workspace's choice into localStorage (`SEASONAL_KEY`) so the
 * anti-flash script in src/app/layout.tsx can paint it before React loads.
 */

export interface SeasonalThemeDef {
  id: string;
  label: string;
  description: string;
}

export const SEASONAL_THEMES: SeasonalThemeDef[] = [
  { id: "halloween", label: "Halloween", description: "Dark, pumpkin orange, fog, ghosts and bats." },
  {
    id: "christmas",
    label: "Christmas",
    description: "Festive red, a tree on the logo, and snow that settles on the tops of cards. Keeps each person's light or dark mode.",
  },
];

export const DEFAULT_SEASONAL_THEME = SEASONAL_THEMES[0].id;

/** localStorage key holding the active theme id, or "off". Read by the anti-flash script. */
export const SEASONAL_KEY = "foundry.seasonal.v1";

/** Fired on window when the provider should re-read the workspace setting (after a save). */
export const SEASONAL_CHANGED_EVENT = "foundry:seasonal-changed";

export function isSeasonalThemeId(value: unknown): value is string {
  return typeof value === "string" && SEASONAL_THEMES.some((t) => t.id === value);
}

/** The theme to show, or null. A stored id we no longer ship reads as off, never as a crash. */
export function activeSeasonalTheme(enabled: boolean, theme: string | null | undefined): string | null {
  return enabled && isSeasonalThemeId(theme) ? theme : null;
}

export interface SeasonalThemeSetting {
  enabled: boolean;
  theme: string;
  /** What to show right now: the theme id, or null when off. */
  active: string | null;
}
