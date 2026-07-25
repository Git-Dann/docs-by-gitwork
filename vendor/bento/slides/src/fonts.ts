// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Bento authors
// Font utilities: the curated system-stack choices offered in the editor,
// and @font-face injection for fonts embedded in the document's asset table.

import type { BentoDoc } from './model'

/** Safe cross-platform stacks offered in the font picker. */
export const FONT_CHOICES: Array<{ label: string; stack: string }> = [
  // FOUNDRY: the brand faces lead the picker. They are embedded in the shell by
  // foundry/boot.ts (injectBrandFonts), so a deck built with them keeps its type
  // when saved — the .bento.html carries the @font-face with it.
  { label: 'Inter (brand)', stack: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  { label: 'DM Serif Display (brand)', stack: "'DM Serif Display', 'Times New Roman', Georgia, serif" },
  { label: 'JetBrains Mono (brand)', stack: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace" },
  { label: 'Fraunces (Gitwork)', stack: "'Fraunces', Georgia, 'Times New Roman', serif" },
  { label: 'System UI', stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
  { label: 'Helvetica', stack: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { label: 'Verdana', stack: "Verdana, 'DejaVu Sans', Geneva, Tahoma, sans-serif" },
  { label: 'Trebuchet', stack: "'Trebuchet MS', 'Segoe UI', Tahoma, sans-serif" },
  { label: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  { label: 'Palatino', stack: "Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif" },
  { label: 'Times', stack: "'Times New Roman', Times, serif" },
  { label: 'Monospace', stack: "ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace" },
  { label: 'Impact', stack: "Impact, 'Arial Black', 'Franklin Gothic Bold', sans-serif" },
]

/** First family of a stack, normalised — used to match stacks loosely. */
export function firstFamily(stack: string): string {
  return (stack.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '').toLowerCase()
}

/**
 * (Re)register @font-face rules for every embedded font in the document.
 * Idempotent — call at boot and again whenever a font is added.
 */
export function injectFonts(doc: BentoDoc) {
  const css = (doc.fonts ?? [])
    .map((f) => {
      const src = doc.assets?.[f.asset]
      if (!src) return ''
      return `@font-face{font-family:${JSON.stringify(f.family)};src:url(${JSON.stringify(src)});` +
        `font-weight:${f.weight ?? 'normal'};font-style:${f.style ?? 'normal'};font-display:swap}`
    })
    .join('\n')
  let style = document.getElementById('bento-fonts') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = 'bento-fonts'
    document.head.appendChild(style)
  }
  style.textContent = css
}
