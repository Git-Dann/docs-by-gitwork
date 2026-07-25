// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Facade: the i18n ENGINE lives in the shared kernel (kernel/src/i18n.ts);
// the CATALOGS are this app's string data and stay here in ./i18n/*.ts.
//
// This module registers them at import time and re-exports the engine, so
// every consumer keeps importing './i18n' unchanged AND catalog registration
// is guaranteed to precede the first t() call by ES module evaluation order.
// App code must never import the kernel i18n directly — that would bypass
// this registration.

// FOUNDRY: English only.
//
// The seven translation catalogs are ~171KB of the shipped shell — 25% of it —
// and because a deck file IS the app, every deck we hand a client would carry
// them too. The single-file build forbids lazy-loading (zero external requests is
// the format's contract), so it is all-or-nothing, and an internal English-
// speaking team gets nothing for the 171KB. English is the source language, so
// t() simply returns its keys with no catalog registered.
//
// The catalogs are still in the tree (src/i18n/*.ts) — just unreferenced, so
// rollup drops them. To restore all eight languages, put the imports and the
// `catalogs` map back below and re-add the CHOICES rows: the picker reappears on
// its own (editor.ts hides the globe only while there is one locale).
import { registerI18n } from '../../kernel/src/i18n.ts'
import type { LocaleChoice } from '../../kernel/src/i18n.ts'

export type { Catalog } from '../../kernel/src/i18n.ts'

/** Locales offered in the About picker (label in its own language). */
const CHOICES: LocaleChoice[] = [{ code: 'en', label: 'English' }]

registerI18n({
  catalogs: {},
  choices: CHOICES,
})

/** Kept as a const export for call sites that read it directly. */
export const LOCALE_CHOICES = CHOICES

export { t, locale, setLocale, i18nApi, localeChoices } from '../../kernel/src/i18n.ts'
