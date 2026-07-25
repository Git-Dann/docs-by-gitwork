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

import { ja } from './i18n/ja'
import { zhHans } from './i18n/zh-Hans'
import { es } from './i18n/es'
import { fr } from './i18n/fr'
import { de } from './i18n/de'
import { zhHant } from './i18n/zh-Hant'
import { it } from './i18n/it'
import { registerI18n } from '../../kernel/src/i18n.ts'
import type { LocaleChoice } from '../../kernel/src/i18n.ts'

export type { Catalog } from '../../kernel/src/i18n.ts'

/** Locales offered in the About picker (label in its own language). */
const CHOICES: LocaleChoice[] = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh-Hans', label: '简体中文' },
  { code: 'zh-Hant', label: '繁體中文' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'de', label: 'Deutsch' },
]

registerI18n({
  catalogs: {
    ja,
    'zh-Hans': zhHans,
    zh: zhHans, // zh, zh-CN, zh-SG → simplified
    'zh-Hant': zhHant,
    'zh-TW': zhHant,
    'zh-HK': zhHant,
    it,
    es,
    fr,
    de,
  },
  choices: CHOICES,
})

/** Kept as a const export for call sites that read it directly. */
export const LOCALE_CHOICES = CHOICES

export { t, locale, setLocale, i18nApi, localeChoices } from '../../kernel/src/i18n.ts'
