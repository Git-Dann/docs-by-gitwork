// Foundry addition (not upstream bento).
// Everything the Foundry/Gitwork shell DOES at boot, kept out of upstream files
// so the patches into main.ts / editor.ts stay one-liners:
//
//   · registers the brand faces as @font-face (base64, zero external requests)
//   · applies the active brand to <html data-brand> — theme.css does the rest
//   · builds the topbar Foundry · Gitwork switch, which re-skins live (no
//     reload, so nothing unsaved is ever lost) and re-themes the deck as long as
//     the deck is still on the previous brand's untouched defaults
//   · switches off upstream's release-manifest check: this shell is served by
//     Foundry and updates on redeploy, and upstream signs its manifest with a
//     key we deliberately don't hold
//
// Kept framework-free and side-effect-light: nothing here runs until main.ts
// calls it.

import { setAutoCheck } from '../update'
import { configureApp } from '../../../kernel/src/app.ts'
import type { Store } from '../store'
import type { BentoDoc } from '../model'
import { FRAUNCES_900 } from '../fontdata'
import { DM_SERIF_DISPLAY_400, INTER_VAR, JETBRAINS_MONO_VAR } from './fontdata'
import {
  DEFAULT_BRAND,
  brand,
  brandFromDeckTheme,
  brandParamOverride,
  rememberBrandId,
  resolveBrandId,
  type Brand,
  type BrandId,
} from './brand'

const FONT_STYLE_ID = 'fd-brand-fonts'

/**
 * Register the brand faces. Idempotent — the shell calls this once at boot, and
 * a saved deck re-runs it on its own next boot (the style element is rebuilt,
 * never duplicated).
 */
export function injectBrandFonts(): void {
  if (document.getElementById(FONT_STYLE_ID)) return
  const face = (family: string, src: string, weight: string, style = 'normal') =>
    `@font-face{font-family:${JSON.stringify(family)};src:url(${src}) format('woff2');` +
    `font-weight:${weight};font-style:${style};font-display:swap}`
  const el = document.createElement('style')
  el.id = FONT_STYLE_ID
  el.textContent = [
    face('Inter', INTER_VAR, '100 900'),
    face('JetBrains Mono', JETBRAINS_MONO_VAR, '100 800'),
    face('DM Serif Display', DM_SERIF_DISPLAY_400, '400'),
    // Upstream already ships Fraunces for its starter deck; the Gitwork brand
    // guide uses it as the display face, so register it globally rather than
    // embedding a second copy.
    face('Fraunces', FRAUNCES_900, '900'),
  ].join('\n')
  document.head.appendChild(el)
}

/** The brand this window is wearing right now. Module state so the editor can
 *  read it without threading it through upstream's constructor signatures. */
let active: Brand = brand(DEFAULT_BRAND)

export function activeBrand(): Brand {
  return active
}

/**
 * Paint the brand: one attribute swap — theme.css keys every token off it. Also
 * re-declares the app identity, so `appConfig().appName` (window-title suffix,
 * save-picker label) never lags behind the brand on screen.
 */
export function applyBrand(id: BrandId): Brand {
  active = brand(id)
  document.documentElement.dataset.brand = id
  configureApp({
    appId: active.appId,
    appName: active.appName,
    // Served by Foundry; nothing published there — see silenceUpstreamUpdateChecks.
    manifestUrl: '/deck/manifest.json',
  })
  return active
}

/** The brand the window opened with (`?brand=`, else the remembered choice). */
export function initialBrand(): Brand {
  return applyBrand(resolveBrandId())
}

/**
 * Refine the brand from the document once it's parsed: a deck already wearing a
 * brand's theme brings its chrome with it, so a Gitwork deck opens in Gitwork for
 * whoever was sent it. An explicit `?brand=` still wins, and a deck with
 * hand-picked colours matches nothing and leaves the viewer's choice alone.
 */
export function adoptDeckBrand(doc: BentoDoc): Brand {
  if (brandParamOverride()) return active
  const id = brandFromDeckTheme(doc.theme)
  if (!id || id === active.id) return active
  return applyBrand(id)
}

/**
 * The topbar's first slot. Deck opens in its own window from Foundry, so the
 * useful thing there is the way BACK — `← Foundry`, not a logo that reopens a
 * dialog. (Upstream put its wordmark here and hung About off it; About now lives
 * in the Save ▾ menu with the other document-level things.)
 *
 * A saved deck has nowhere to go back TO — it's a file on someone's disk, quite
 * possibly someone outside Gitwork — so it shows the brand lockup instead, inert.
 * Same test as identity.ts: served from /deck over http(s), or not.
 */
export function mountHomeSlot(servedByFoundry: boolean): HTMLElement {
  if (!servedByFoundry) {
    const mark = document.createElement('div')
    mark.className = 'ed-logo fd-home-mark'
    mark.innerHTML = active.wordmark
    return mark
  }
  const link = document.createElement('a')
  link.className = 'ed-logo fd-home'
  link.href = '/app'
  // The destination is the platform, under either brand — you are going back to
  // Foundry, not to "Gitwork". So this label is deliberately not brand-derived.
  link.innerHTML =
    `<svg class="fd-home-arrow" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">` +
    `<path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.75" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></svg>` +
    `<span class="fd-home-label">Foundry</span>`
  link.title = 'Back to Foundry'
  return link
}

/**
 * Upstream checks bento.page for signed releases at launch. Our shell ships with
 * Foundry, so the check is off by default — but only ONCE, so anyone who
 * deliberately turns it back on keeps their choice.
 */
export function silenceUpstreamUpdateChecks(): void {
  try {
    if (localStorage.getItem('foundry.deck.update-default') === 'done') return
    setAutoCheck(false)
    localStorage.setItem('foundry.deck.update-default', 'done')
  } catch {
    /* storage off — the check just runs and fails harmlessly */
  }
}

/**
 * old hex → new hex for the three colours a brand actually OWNS: paper, ink and
 * accent. Deliberately narrow — pairing the chart palettes index-for-index here
 * too would repaint any shape that happened to use a series colour (a mid blue
 * turning navy), which is not what "switch brand" should mean.
 */
function coreMap(from: Brand, to: Brand): Map<string, string> {
  const map = new Map<string, string>()
  const pair = (a: string, b: string) => {
    if (a.toUpperCase() !== b.toUpperCase()) map.set(a.toUpperCase(), b)
  }
  pair(from.deck.background, to.deck.background)
  pair(from.deck.color, to.deck.color)
  pair(from.deck.accent, to.deck.accent)
  return map
}

/** Repaint one element's brand colours in place. */
function remapElement(el: Record<string, unknown>, map: Map<string, string>, to: Brand, from: Brand): void {
  for (const key of ['color', 'fill', 'stroke'] as const) {
    const value = el[key]
    if (typeof value === 'string') {
      const next = map.get(value.toUpperCase())
      if (next) el[key] = next
    }
  }
  // Charts are the one place the series palette IS the brand's: swap the whole
  // array, but only while it's still the old brand's untouched palette.
  const option = el.option as { color?: unknown } | undefined
  if (option && Array.isArray(option.color) && from.deck.chartPalette && to.deck.chartPalette) {
    const same =
      option.color.length === from.deck.chartPalette.length &&
      option.color.every(
        (c, i) => typeof c === 'string' && c.toUpperCase() === from.deck.chartPalette![i].toUpperCase(),
      )
    if (same) option.color = to.deck.chartPalette.slice()
  }
}

/**
 * The deck follows the brand until it's customised: re-theme only when the doc
 * is still sitting on the OLD brand's untouched defaults. Slide backgrounds and
 * element colours that exactly match the old brand's palette move with it —
 * anything the author picked themselves is left alone. Goes through
 * store.commit, so ⌘Z undoes the whole re-theme in one step.
 */
function retheme(store: Store, from: Brand, to: Brand): void {
  const theme = store.doc.theme
  const untouched =
    theme.background === from.deck.background &&
    theme.color === from.deck.color &&
    theme.accent === from.deck.accent
  if (!untouched) return
  const map = coreMap(from, to)
  const repaint = (el: unknown) => remapElement(el as Record<string, unknown>, map, to, from)
  store.commit(() => {
    store.doc.theme = { ...to.deck }
    for (const slide of store.doc.slides) {
      const bg = map.get(slide.background.toUpperCase())
      if (bg) slide.background = bg
      slide.elements.forEach(repaint)
    }
    for (const layout of store.doc.layouts ?? []) layout.elements.forEach(repaint)
  })
}

/**
 * The topbar Foundry · Gitwork switch. Mirrors the Docs editor's per-document
 * theme toggle: same two brands, same instant-swap behaviour. Built here (not in
 * editor.ts) so upstream's topbar patch stays a single append.
 */
export function mountBrandSwitch(store: Store): HTMLElement {
  return brandSwitch(activeBrand, (next) => switchBrand(store, activeBrand(), next))
}

function brandSwitch(current: () => Brand, onChange: (next: Brand) => void): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'fd-brandswitch'
  wrap.title = 'Brand — Foundry (platform) or Gitwork (agency brand guide)'
  const buttons = (['foundry', 'gitwork'] as const).map((id) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = id === 'foundry' ? 'Foundry' : 'Gitwork'
    b.addEventListener('click', () => {
      if (current().id === id) return
      onChange(brand(id))
      paint()
    })
    wrap.appendChild(b)
    return [id, b] as const
  })
  const paint = () => {
    for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(current().id === id))
  }
  paint()
  return wrap
}

/**
 * Switch brand for real: repaint the chrome, re-title the window, refresh the
 * wordmark in place and re-theme an untouched deck. No reload — unsaved work
 * survives a brand change.
 */
function switchBrand(store: Store, from: Brand, next: Brand): void {
  applyBrand(next.id)
  rememberBrandId(next.id)
  // Only the inert lockup (a saved deck) carries a wordmark to repaint — the
  // served-by-Foundry slot is a back link, which says "Foundry" under both brands
  // because that's where it goes.
  const mark = document.querySelector('.fd-home-mark')
  if (mark) mark.innerHTML = next.wordmark
  document.title = `${store.doc.title} — ${next.appName}`
  retheme(store, from, next)
}
