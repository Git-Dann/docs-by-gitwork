// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Internationalization, Bento-sized: a ~1KB t() with English-string-as-key
// (gettext philosophy — the source stays readable, fallback is free), catalogs
// compiled into the bundle (self-containment: nothing is fetched), and locale
// resolution that follows the VIEWER (navigator.language, with a per-browser
// override). Language never enters the document format — a deck authored in
// Tokyo opens with French chrome in Paris.
//
// The ENGINE lives here; the CATALOGS are per-app string data and stay in the
// app (slides/src/i18n/*.ts), registered at boot via registerI18n(). Apps
// import their own ./i18n facade, never this module directly — the facade is
// what guarantees catalogs are registered before the first t().
//
// Locale resolution is LAZY on purpose: it depends on the catalog registry
// (navigator.language only wins if we actually have that catalog), so
// resolving at module scope would run against an empty registry and silently
// fall everyone back to English. Registration also clears the memo.

export type Catalog = Record<string, string>
export interface LocaleChoice { code: string; label: string }

let CATALOGS: Record<string, Catalog> = {}
let CHOICES: LocaleChoice[] = [{ code: 'en', label: 'English' }]

/** Register this app's catalogs + picker choices. Call once, at boot. */
export function registerI18n(opts: { catalogs: Record<string, Catalog>; choices: LocaleChoice[] }): void {
  CATALOGS = opts.catalogs
  CHOICES = opts.choices
  current = null // re-resolve: the registry the resolution depends on just changed
}

/** Locales offered in the picker (label in its own language). */
export const localeChoices = (): LocaleChoice[] => CHOICES

/** Accented pseudo-locale (dev builds only): exposes unswept strings and
 *  layouts that break under longer text. */
const pseudo = (s: string): string =>
  '⟦' +
  s.replace(/[a-zA-Z]/g, (c) => {
    const map: Record<string, string> = {
      a: 'à', e: 'ē', i: 'ï', o: 'ő', u: 'ū', c: 'ĉ', n: 'ñ', s: 'š', y: 'ý',
      A: 'Å', E: 'Ê', I: 'Ì', O: 'Ø', U: 'Ü', C: 'Ç', N: 'Ñ', S: 'Š', Y: 'Ÿ',
    }
    return map[c] ?? c
  }) +
  '⟧'

function resolve(): string {
  const saved = localStorage.getItem('bento-lang')
  if (saved) return saved
  const nav = navigator.language || 'en'
  if (CATALOGS[nav]) return nav
  const base = nav.split('-')[0]
  if (base === 'zh') return 'zh-Hans'
  return CATALOGS[base] ? base : 'en'
}

let current: string | null = null

function activeLocale(): string {
  if (current === null) current = resolve()
  return current
}

export const locale = (): string => activeLocale()

/** Persist the override and switch. Callers re-render their own UI. */
export function setLocale(code: string): void {
  if (code === 'en') localStorage.removeItem('bento-lang')
  else localStorage.setItem('bento-lang', code)
  current = code
}

/** Translate an English source string, then interpolate {placeholders}. */
export function t(en: string, vars?: Record<string, string | number>): string {
  const cur = activeLocale()
  let out = cur === 'x-pseudo' ? pseudo(en) : (CATALOGS[cur]?.[en] ?? en)
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v))
  }
  return out
}

// dev convenience: window.bento.i18n exposes locale switching for testing;
// the pseudo locale is reachable by setLocale('x-pseudo') in any build.
export const i18nApi = { t, locale, setLocale, choices: localeChoices }
