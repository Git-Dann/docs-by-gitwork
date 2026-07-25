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
  /** Topbar lockup: mark + wordmark, as HTML (styled by theme.css). */
  wordmark: string
  /** Theme a brand-new deck is born with (existing decks keep their own). */
  deck: BentoDoc['theme']
}

/** Inter is embedded by theme.css, so a deck built here keeps its face when
 *  saved — the .bento.html file carries the @font-face with it. */
const INTER_STACK = `'Inter', ${FONT_STACK}`

/** Upstream's bento mark, repainted in Gitwork Blue. The tile triptych is kept
 *  deliberately — it reads as a bento grid, which is also Foundry's own
 *  dashboard signature (DESIGN.md), so the heritage and the house style agree. */
const FOUNDRY_MARK =
  `<svg class="ed-logo-mark fd-mark" viewBox="0 0 32 32" width="20" height="20" aria-hidden="true">` +
  `<rect width="32" height="32" rx="7" fill="#0F172A"/>` +
  `<rect x="5" y="5" width="7" height="22" rx="2.5" fill="#3B82F6"/>` +
  `<rect x="14" y="5" width="13" height="10" rx="2.5" fill="#1D4ED8"/>` +
  `<rect x="14" y="17" width="13" height="10" rx="2.5" fill="#DBEAFE"/>` +
  `</svg>`

/** The Gitwork round "G." mark — cream disc, navy Fraunces G, purple period.
 *  Built from spans (not svg <text>) so it matches the platform's React
 *  `GitworkMark` exactly and never depends on SVG font resolution. */
const GITWORK_MARK = `<span class="fd-gmark" aria-hidden="true">G<i>.</i></span>`

/** mark + "House" + a mono/caps product tag. */
function lockup(mark: string, house: string, product: string): string {
  return `${mark}<b class="fd-word">${house}<span class="fd-word-tag">${product}</span></b>`
}

export const BRANDS: Record<BrandId, Brand> = {
  foundry: {
    id: 'foundry',
    product: 'Deck',
    appName: 'Foundry Deck',
    appId: 'foundry-deck',
    wordmark: lockup(FOUNDRY_MARK, 'Foundry', 'Deck'),
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
    wordmark: lockup(GITWORK_MARK, 'Gitwork', 'Deck'),
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
