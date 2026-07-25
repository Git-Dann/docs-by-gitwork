// Foundry addition (not upstream bento).
// The brand registry for Foundry Deck — the one place product identity lives.
//
// Two brands ship: `foundry` (default, the platform's own cream/blue system —
// DESIGN.md) and `gitwork` (the agency brand-guide look — navy/cream/purple,
// Fraunces display). Everything brand-specific is data here: the app name in
// the window title, the topbar wordmark, and the theme a NEW deck is born with.
// The chrome palette itself lives in theme.css keyed on `:root[data-brand]`, so
// switching brands is one attribute swap — no reload, no lost work.
//
// Renaming the product is a one-line change: `appName` below.

import { FONT_STACK, type BentoDoc } from '../model'

export type BrandId = 'foundry' | 'gitwork'

export interface Brand {
  id: BrandId
  /** Short product name, without the house prefix — used in labels. */
  product: string
  /** Human-facing name: window title suffix + the save-picker label. */
  appName: string
  /** Manifest `app` id the kernel checks a release against. */
  appId: string
  /** The app name as HTML — words only, no mark (styled by theme.css). */
  wordmark: string
  /** Theme a brand-new deck is born with (existing decks keep their own). */
  deck: BentoDoc['theme']
}

/** Inter is embedded by theme.css, so a deck built here keeps its face when
 *  saved — the .bento.html file carries the @font-face with it. */
const INTER_STACK = `'Inter', ${FONT_STACK}`

/**
 * THE ONLY LOGO IN THIS APP IS THE FAVICON. Everywhere else the identity is the
 * words — "Foundry Deck". That is a product decision, not an oversight:
 *
 *   · upstream's tile triptych was bento's mark repainted in our blue, and it
 *     is the most recognisable thing about the app this is forked from;
 *   · and a mark repeated in the topbar, the About dialog and the splash is
 *     three chances to look like someone else's product for no gain.
 *
 * Don't add a mark back into the chrome. If a logo is ever wanted, it belongs in
 * `src/app/icon.svg` (the platform's own disc) and comes through the favicon.
 */
export const FAVICON: Record<BrandId, string> = {
  foundry:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E" +
    "%3Ccircle cx='16' cy='16' r='16' fill='%234F46E5'/%3E%3C/svg%3E",
  // The Gitwork "G." disc — cream ground, navy G, purple period, matching the
  // lockup below and the platform's own GitworkMark.
  gitwork:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E" +
    "%3Ccircle cx='16' cy='16' r='16' fill='%23F2EDE4'/%3E" +
    "%3Ctext x='15' y='23' font-family='Georgia,serif' font-size='21' font-weight='700' " +
    "text-anchor='middle' fill='%230C0C18'%3EG%3C/text%3E" +
    "%3Ccircle cx='25' cy='21' r='2.4' fill='%236B52FF'/%3E%3C/svg%3E",
}

/** The identity, as words. No mark — see the note above. */
function lockup(appName: string): string {
  return `<b class="fd-word">${appName}</b>`
}

export const BRANDS: Record<BrandId, Brand> = {
  foundry: {
    id: 'foundry',
    product: 'Deck',
    appName: 'Foundry Deck',
    appId: 'foundry-deck',
    wordmark: lockup('Foundry Deck'),
    deck: {
      // Warm off-white, never pure white (DESIGN.md: don't use #FFFFFF as canvas).
      background: '#FAFAF9',
      color: '#0F172A',
      accent: '#1D4ED8',
      fontFamily: INTER_STACK,
      // Blue family + neutrals only — DESIGN.md forbids accent hues outside it.
      chartPalette: ['#1D4ED8', '#3B82F6', '#1E3A8A', '#94A3B8', '#DBEAFE', '#0F172A'],
    },
  },
  gitwork: {
    id: 'gitwork',
    product: 'Deck',
    appName: 'Gitwork Deck',
    appId: 'gitwork-deck',
    wordmark: lockup('Gitwork Deck'),
    deck: {
      background: '#F2EDE4',
      color: '#0C0C18',
      accent: '#6B52FF',
      fontFamily: INTER_STACK,
      chartPalette: ['#6B52FF', '#0C0C18', '#A99BFF', '#68686B', '#D9CFC0', '#3B2ECC'],
    },
  },
}

export const DEFAULT_BRAND: BrandId = 'foundry'

const STORAGE_KEY = 'foundry.deck.brand'

function isBrandId(value: string | null): value is BrandId {
  return value === 'foundry' || value === 'gitwork'
}

/** An explicit `?brand=` in the URL — shareable links, and how Foundry can
 *  deep-link a branded window. Wins over everything, including a deck's theme. */
export function brandParamOverride(): BrandId | null {
  try {
    const param = new URLSearchParams(location.search).get('brand')
    return isBrandId(param) ? param : null
  } catch {
    return null /* no location (tests) */
  }
}

/**
 * Which brand this window opens in: `?brand=`, else the last choice, else
 * Foundry. A deck FILE refines this once its theme is known — see
 * `brandFromDeckTheme`. Storage may be unavailable (private mode) — never throw.
 */
export function resolveBrandId(): BrandId {
  const param = brandParamOverride()
  if (param) return param
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isBrandId(saved)) return saved
  } catch {
    /* storage off */
  }
  return DEFAULT_BRAND
}

/**
 * The brand a document is already wearing, if any — an exact match on paper, ink
 * and accent. The deck's own look is the ground truth for the chrome around it,
 * so a Gitwork deck handed to someone opens in Gitwork whatever their last choice
 * was. (`<html data-brand>` can't do this job: the save snapshot is cloned at
 * boot, so it always carries the brand the window OPENED in, not the one the deck
 * was saved in.) A deck with hand-picked colours matches neither and is left to
 * the viewer's own choice.
 */
export function brandFromDeckTheme(theme: BentoDoc['theme']): BrandId | null {
  const eq = (a: string, b: string) => a.toUpperCase() === b.toUpperCase()
  for (const b of Object.values(BRANDS)) {
    if (eq(theme.background, b.deck.background) && eq(theme.color, b.deck.color) && eq(theme.accent, b.deck.accent)) {
      return b.id
    }
  }
  return null
}

export function rememberBrandId(id: BrandId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* storage off */
  }
}

export function brand(id: BrandId): Brand {
  return BRANDS[id]
}
