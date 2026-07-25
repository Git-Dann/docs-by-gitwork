// Foundry addition (not upstream bento).
// The five-slide deck a fresh Foundry Deck window boots into: short, on-brand,
// and a working demo of the tool (morph between slides, a live chart, notes).
//
// Upstream's own starter deck is a much longer product tour and is kept intact —
// open `?demo=bento` to boot it instead when checking behaviour against
// upstream. This one is ours: it wears the active brand's theme, so the same
// slides read as Foundry (cream/blue) or Gitwork (cream/purple) depending on how
// the window opened — and the topbar brand switch re-themes them live.

import {
  FORMAT,
  FORMAT_VERSION,
  defaultChart,
  defaultShape,
  defaultText,
  emptySlide,
  newDocId,
  type BentoDoc,
  type Slide,
  type SlideElement,
} from '../model'
import type { Brand } from './brand'

const W = 1280
const H = 720

/** Slide furniture that repeats — a shared id means it MORPHS across slides. */
function chrome(b: Brand, label: string): SlideElement[] {
  return [
    // the accent rule, morphing from slide to slide
    defaultShape('rect', {
      id: 'fd-rule',
      x: 96,
      y: 104,
      w: 64,
      h: 5,
      fill: b.deck.accent,
      stroke: 'transparent',
      strokeWidth: 0,
      radius: 2,
    }),
    defaultText({
      id: 'fd-eyebrow',
      x: 96,
      y: 62,
      w: 620,
      h: 28,
      html: label.toUpperCase(),
      fontSize: 13,
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontWeight: 500,
      color: b.deck.accent,
      align: 'left',
      valign: 'middle',
      lineHeight: 1.4,
      letterSpacing: 2.2,
    }),
    defaultText({
      id: 'fd-footer',
      x: 96,
      y: H - 82,
      w: 1088,
      h: 26,
      html: `${b.appName.toUpperCase()}`,
      fontSize: 11,
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontWeight: 500,
      color: b.deck.color,
      opacity: 0.45,
      align: 'left',
      valign: 'middle',
      lineHeight: 1.4,
      letterSpacing: 1.8,
    }),
  ]
}

function heading(b: Brand, html: string, y = 150): SlideElement {
  return defaultText({
    id: 'fd-title',
    x: 96,
    y,
    w: 1000,
    h: 130,
    html,
    fontSize: 62,
    fontFamily: b.id === 'gitwork' ? "'Fraunces', Georgia, serif" : "'DM Serif Display', Georgia, serif",
    fontWeight: 400,
    color: b.deck.color,
    align: 'left',
    valign: 'top',
    lineHeight: 1.12,
    role: 'title',
  })
}

function body(b: Brand, html: string, frame: { x?: number; y: number; w?: number; h?: number }): SlideElement {
  return defaultText({
    x: frame.x ?? 96,
    y: frame.y,
    w: frame.w ?? 640,
    h: frame.h ?? 160,
    html,
    fontSize: 22,
    fontFamily: b.deck.fontFamily,
    fontWeight: 400,
    color: b.deck.color,
    align: 'left',
    valign: 'top',
    lineHeight: 1.55,
    role: 'body',
  })
}

/** A DESIGN.md stat tile: serif figure over a mono label. */
function statTile(
  b: Brand,
  frame: { x: number; y: number; w: number; h: number },
  figure: string,
  label: string,
  filled = false,
): SlideElement[] {
  const ink = filled ? '#FFFFFF' : b.deck.color
  return [
    defaultShape('rect', {
      x: frame.x,
      y: frame.y,
      w: frame.w,
      h: frame.h,
      fill: filled ? b.deck.accent : 'transparent',
      stroke: filled ? 'transparent' : b.deck.color,
      strokeWidth: filled ? 0 : 1,
      radius: 10,
      opacity: filled ? 1 : 0.22,
    }),
    defaultText({
      x: frame.x,
      y: frame.y + 26,
      w: frame.w,
      h: 72,
      html: figure,
      fontSize: 52,
      fontFamily: b.id === 'gitwork' ? "'Fraunces', Georgia, serif" : "'DM Serif Display', Georgia, serif",
      fontWeight: 400,
      color: ink,
      align: 'center',
      valign: 'middle',
      lineHeight: 1.05,
    }),
    defaultText({
      x: frame.x,
      y: frame.y + frame.h - 46,
      w: frame.w,
      h: 26,
      html: label.toUpperCase(),
      fontSize: 11,
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontWeight: 500,
      color: ink,
      opacity: filled ? 0.85 : 0.6,
      align: 'center',
      valign: 'middle',
      lineHeight: 1.4,
      letterSpacing: 1.2,
    }),
  ]
}

function slides(b: Brand): Slide[] {
  const bg = b.deck.background
  const dark = b.id === 'gitwork' ? '#0C0C18' : '#0F172A'

  // 01 — cover
  const cover = emptySlide({
    background: bg,
    transition: 'morph',
    name: 'Cover',
    notes:
      'Your deck, your file. Nothing here talks to a server: ⌘S rewrites this ' +
      'one .html file in place, and that file is both the app and the document.',
    elements: [
      ...chrome(b, 'Starter deck'),
      heading(b, `A deck that is<br>a single file.`, 190),
      body(b, `Edit it, present it, hand it over. No account, no cloud, no export step.`, {
        y: 430,
        w: 720,
        h: 96,
      }),
      ...statTile(b, { x: 864, y: 190, w: 152, h: 152 }, '1', 'file'),
      ...statTile(b, { x: 1032, y: 190, w: 152, h: 152 }, '0', 'servers', true),
    ],
  })

  // 02 — how it works
  const how = emptySlide({
    background: bg,
    transition: 'morph',
    name: 'How it works',
    notes: 'The three moves worth knowing on day one.',
    elements: [
      ...chrome(b, 'How it works'),
      heading(b, 'Three moves.'),
      body(
        b,
        '<b>1 — Edit.</b> Double-click any text. Drag to move, ⌥-drag to duplicate.<br><br>' +
          '<b>2 — Present.</b> Slideshow, bottom-right. S opens speaker view.<br><br>' +
          '<b>3 — Save.</b> ⌘S rewrites this file. Send the file, not a link.',
        { y: 330, w: 620, h: 260 },
      ),
      defaultShape('rect', {
        x: 776,
        y: 300,
        w: 408,
        h: 300,
        fill: dark,
        stroke: 'transparent',
        strokeWidth: 0,
        radius: 14,
      }),
      defaultText({
        x: 812,
        y: 336,
        w: 336,
        h: 228,
        html:
          'SHORTCUTS<br><br>⌘S&nbsp;&nbsp;save in place<br>⌘Z&nbsp;&nbsp;undo<br>' +
          'C&nbsp;&nbsp;&nbsp;&nbsp;comment<br>?&nbsp;&nbsp;&nbsp;&nbsp;everything else',
        fontSize: 16,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontWeight: 400,
        color: '#F8FAFC',
        align: 'left',
        valign: 'top',
        lineHeight: 1.9,
        letterSpacing: 0.6,
      }),
    ],
  })

  // 03 — brand
  const brandSlide = emptySlide({
    background: bg,
    transition: 'morph',
    name: 'Brand',
    notes:
      'The switch in the topbar re-skins the editor AND re-themes this deck ' +
      'while it is still on brand defaults. Recolour anything and it stays yours.',
    elements: [
      ...chrome(b, 'Brand'),
      heading(b, 'Two brands,<br>one deck.'),
      body(b, `Foundry for the platform. Gitwork for client-facing work. Switch in the topbar.`, {
        y: 420,
        w: 560,
        h: 96,
      }),
      // palette swatches — the deck's own accent, its ink, and the paper
      ...['#1D4ED8', '#3B82F6', '#0F172A', '#FAFAF9'].map((c, i) =>
        defaultShape('rect', {
          x: 700 + i * 124,
          y: 200,
          w: 108,
          h: 108,
          fill: c,
          stroke: b.deck.color,
          strokeWidth: 1,
          radius: 10,
          opacity: 1,
        }),
      ),
      ...['#6B52FF', '#A99BFF', '#0C0C18', '#F2EDE4'].map((c, i) =>
        defaultShape('rect', {
          x: 700 + i * 124,
          y: 332,
          w: 108,
          h: 108,
          fill: c,
          stroke: b.deck.color,
          strokeWidth: 1,
          radius: 10,
          opacity: 1,
        }),
      ),
      defaultText({
        x: 700,
        y: 456,
        w: 480,
        h: 26,
        html: 'FOUNDRY BLUE&nbsp;&nbsp;·&nbsp;&nbsp;GITWORK PURPLE',
        fontSize: 10,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontWeight: 500,
        color: b.deck.color,
        opacity: 0.55,
        align: 'left',
        valign: 'middle',
        lineHeight: 1.4,
        letterSpacing: 1.4,
      }),
    ],
  })

  // 04 — live chart
  const chart = emptySlide({
    background: bg,
    transition: 'fade',
    name: 'Chart',
    notes: 'Charts are live while presenting — hover a bar for its tooltip.',
    elements: [
      ...chrome(b, 'Data'),
      heading(b, 'Charts, live.'),
      defaultChart(
        {
          grid: { left: 56, right: 24, top: 24, bottom: 40 },
          xAxis: { type: 'category', data: ['Q1', 'Q2', 'Q3', 'Q4'] },
          yAxis: { type: 'value' },
          color: b.deck.chartPalette,
          series: [{ type: 'bar', data: [18, 26, 31, 44], barWidth: '46%' }],
        },
        { x: 96, y: 300, w: 1088, h: 300, preset: 'bar' },
      ),
    ],
  })

  // 05 — hand-off
  const handoff = emptySlide({
    background: dark,
    transition: 'fade',
    name: 'Hand-off',
    notes: 'Close on the one thing to remember: the file IS the deliverable.',
    elements: [
      defaultText({
        x: 96,
        y: 62,
        w: 620,
        h: 28,
        html: 'HAND-OFF',
        fontSize: 13,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontWeight: 500,
        color: b.deck.accent,
        align: 'left',
        valign: 'middle',
        lineHeight: 1.4,
        letterSpacing: 2.2,
      }),
      defaultText({
        id: 'fd-title',
        x: 96,
        y: 220,
        w: 1000,
        h: 220,
        html: 'Send the file.<br>That is the whole<br>hand-off.',
        fontSize: 62,
        fontFamily: b.id === 'gitwork' ? "'Fraunces', Georgia, serif" : "'DM Serif Display', Georgia, serif",
        fontWeight: 400,
        color: '#F8FAFC',
        align: 'left',
        valign: 'top',
        lineHeight: 1.12,
      }),
      defaultText({
        x: 96,
        y: H - 82,
        w: 1088,
        h: 26,
        html: b.appName.toUpperCase(),
        fontSize: 11,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontWeight: 500,
        color: '#F8FAFC',
        opacity: 0.5,
        align: 'left',
        valign: 'middle',
        lineHeight: 1.4,
        letterSpacing: 1.8,
      }),
    ],
  })

  return [cover, how, brandSlide, chart, handoff]
}

/** The starter document for a brand-new window, wearing the active brand. */
export function foundryStarterDoc(b: Brand): BentoDoc {
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    docId: newDocId(),
    title: 'Starter deck',
    meta: { company: b.id === 'gitwork' ? 'Gitwork' : 'Foundry by Gitwork' },
    size: { width: W, height: H },
    theme: { ...b.deck },
    slides: slides(b),
    modified: new Date().toISOString(),
  }
}
