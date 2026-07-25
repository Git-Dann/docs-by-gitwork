// Foundry addition (not upstream bento).
//
// LIGHT / DARK. Upstream has no notion of it — its chrome is one fixed palette.
// Foundry does: the platform stores `system | light | dark` in localStorage and
// paints `<html data-theme>` (src/components/providers/theme-provider.tsx). Deck
// is served same-origin from /deck, so it reads the SAME key and wears the same
// setting — flip the toggle in the app and the Deck window follows, live.
//
// Two deliberate boundaries:
//
//  1. This themes the CHROME only — topbar, rails, dialogs, the workspace behind
//     the slide. The artboard keeps the deck's own paper, because that is the
//     document, not the UI. Same as every design tool: a dark editor around a
//     white page.
//  2. No network, ever. This is a localStorage read, so a saved deck honours it
//     too; on a fresh machine the key is absent and `system` follows the OS.
//     Nothing here breaks the "zero external requests" contract.

/** MUST match STORAGE_KEY in src/components/providers/theme-provider.tsx. */
const STORAGE_KEY = 'gitwork.theme.v1'
/** Same-tab broadcast the platform provider fires; harmless to listen for here. */
const EVENT = 'gitwork:theme-changed'

export type ThemeMode = 'system' | 'light' | 'dark'
export type Resolved = 'light' | 'dark'

function readMode(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    /* storage off */
  }
  return 'system'
}

function prefersDark(): boolean {
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

export function resolveThemeMode(mode: ThemeMode = readMode()): Resolved {
  if (mode === 'system') return prefersDark() ? 'dark' : 'light'
  return mode
}

/** Paint the resolved theme. One attribute — theme.css keys the dark tokens off it. */
export function applyThemeMode(): Resolved {
  const resolved = resolveThemeMode()
  document.documentElement.dataset.theme = resolved
  return resolved
}

/**
 * Keep following the platform: another tab changing the setting fires `storage`,
 * and while on `system` the OS switching at dusk fires the media query. Idempotent
 * repaint — `applyThemeMode` just re-reads and re-stamps.
 */
export function watchThemeMode(): void {
  const repaint = () => applyThemeMode()
  try {
    addEventListener('storage', (ev) => {
      if (ev.key === null || ev.key === STORAGE_KEY) repaint()
    })
    addEventListener(EVENT, repaint)
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', repaint)
  } catch {
    /* no matchMedia / no storage events — the boot value still stands */
  }
}
