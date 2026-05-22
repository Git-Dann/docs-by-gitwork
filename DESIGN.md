# Foundry by Gitwork — Design System

> **Active document.** Treat every token and component name here as the canonical reference.
> Update this file when patterns change; the code follows the doc, not the other way around.

---

## Overview

Foundry by Gitwork carries itself with the visual grammar of a precision operating system. The interface opens with widget panels laid out in a bento grid — each one identified by a numbered header `01 // WIDGET NAME` rendered in small-caps monospace, its content mixing editorial serif figures with clean sans-serif labels. The numbered widget header is THE Foundry brand signature: it appears on every dashboard panel, every data card, every module across the platform without exception.

The system pairs **Geist** (a crisp geometric sans) with **Lora** (a transitional serif) for editorial stat displays. A deep Gitwork Blue (`{colors.primary}`) anchors all interactive elements; dark navy surfaces (`{colors.surface-dark}`) provide depth for code panels and the optional dark-mode shell. The geometry is tight and rectilinear — `{rounded.md}` (6px) for controls, `{rounded.lg}` (10px) for cards. Nothing is pill-shaped. Everything reads like instrument glass.

**Key Characteristics:**
- Numbered bento widget headers — `01 // WIDGET NAME` in `{typography.widget-header}` — the brand signature
- Gitwork Blue (`{colors.primary}`) on all interactive elements, active states, and data highlights
- Editorial serif figures (`{typography.stat-display}`) for large metric callouts
- Hairline borders (`{colors.hairline}`) on all cards — no heavy drop shadows on flat surfaces
- `{rounded.md}` (6px) controls, `{rounded.lg}` (10px) cards — instrument-grade geometry, no pills
- Both a **cream light mode** (`{colors.canvas}` warm off-white) and a **navy dark mode** (`{colors.surface-dark}`) supported

---

## Colors

### Brand & Primary

- **Gitwork Blue** (`{colors.primary}`): `#1D4ED8` — Primary CTAs, active states, links, data highlights. The single dominant brand color.
- **Blue Deep** (`{colors.primary-deep}`): `#1E3A8A` — Pressed state and emphasis variant for primary actions.
- **Blue Bright** (`{colors.primary-bright}`): `#3B82F6` — Accent highlight; used for sparklines, data series, progress fills.
- **Blue Tint** (`{colors.primary-tint}`): `#EFF6FF` — Very light blue surface for feature callout cards on light mode.
- **Blue Soft** (`{colors.primary-soft}`): `#DBEAFE` — Subtle blue fill for badge backgrounds and table row highlights.

### Surface (Light Mode)

- **Canvas** (`{colors.canvas}`): `#FAFAF9` — Primary page and card background. Warm off-white, not pure white.
- **Surface** (`{colors.surface}`): `#F5F5F4` — Quiet secondary surface, sidebar background.
- **Surface Raised** (`{colors.surface-raised}`): `#FFFFFF` — Elevated card face, modal background.
- **Surface Blue** (`{colors.surface-blue}`): `#EFF6FF` — Blue-tinted panel surface (stat cards, active widget highlight).
- **Hairline** (`{colors.hairline}`): `rgba(0,0,0,0.08)` — 1px card borders.
- **Hairline Soft** (`{colors.hairline-soft}`): `rgba(0,0,0,0.05)` — Quieter dividers inside cards.
- **Hairline Strong** (`{colors.hairline-strong}`): `rgba(0,0,0,0.14)` — Input and active widget borders.

### Surface (Dark Mode / Navy Shell)

- **Surface Dark** (`{colors.surface-dark}`): `#0F172A` — Dark shell canvas (charcoal-navy).
- **Surface Dark Raised** (`{colors.surface-dark-raised}`): `#1E293B` — Elevated card face in dark mode.
- **Surface Dark Mid** (`{colors.surface-dark-mid}`): `#334155` — Secondary surface, table rows in dark.
- **Surface Code** (`{colors.surface-code}`): `#0F172A` — Code block background (shared with dark canvas).
- **Hairline Dark** (`{colors.hairline-dark}`): `rgba(255,255,255,0.08)` — 1px borders in dark mode.
- **Hairline Dark Soft** (`{colors.hairline-dark-soft}`): `rgba(255,255,255,0.05)` — Quiet dividers in dark.
- **Hairline Dark Strong** (`{colors.hairline-dark-strong}`): `rgba(255,255,255,0.16)` — Input borders in dark.

### Text (Light Mode)

- **Ink** (`{colors.ink}`): `#0F172A` — Primary headlines and body text.
- **Charcoal** (`{colors.charcoal}`): `#1E293B` — Body emphasis.
- **Slate** (`{colors.slate}`): `#475569` — Secondary text, descriptions.
- **Steel** (`{colors.steel}`): `#64748B` — Tertiary text, captions, timestamps.
- **Stone** (`{colors.stone}`): `#94A3B8` — Muted labels, placeholder hint text.
- **Muted** (`{colors.muted}`): `#CBD5E1` — Disabled states, subtle dividers.

### Text (Dark Mode)

- **On Dark** (`{colors.on-dark}`): `#F8FAFC` — Primary text on dark surfaces.
- **On Dark Secondary** (`{colors.on-dark-secondary}`): `#CBD5E1` — Secondary text on dark.
- **On Dark Muted** (`{colors.on-dark-muted}`): `rgba(248,250,252,0.45)` — Reduced-opacity text on dark.

### Semantic

- **Success** (`{colors.success}`): `#16A34A` — Positive states, passing checks.
- **Success Soft** (`{colors.success-soft}`): `#DCFCE7` — Success badge background.
- **Warning** (`{colors.warning}`): `#D97706` — Caution states, in-progress.
- **Warning Soft** (`{colors.warning-soft}`): `#FEF3C7` — Warning badge background.
- **Danger** (`{colors.danger}`): `#DC2626` — Error states, critical alerts.
- **Danger Soft** (`{colors.danger-soft}`): `#FEE2E2` — Error badge background.
- **Link** (`{colors.link}`): `{colors.primary}` — Inline hyperlink color.

---

## Typography

### Font Families

**Inter** (UI Sans): Used for all UI: labels, body, navigation, buttons, captions. Fallbacks: `ui-sans-serif, system-ui, -apple-system, sans-serif`

**DM Serif Display** (Editorial Serif): Used for large stat displays and editorial hero text — the only place the platform reads as warm rather than clinical. Fallbacks: `'Times New Roman', Georgia, serif`

**JetBrains Mono** (Monospace): Used for widget headers (`01 // WIDGET NAME`), timestamps, data labels, and code blocks. The platform's most distinctive typographic voice. Fallbacks: `'SF Mono', Menlo, Consolas, monospace`

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Family | Use |
|---|---|---|---|---|---|---|
| `{typography.hero-display}` | 72px | 400 | 1.05 | -1.5px | DM Serif Display | Marketing hero headlines |
| `{typography.display-lg}` | 56px | 400 | 1.10 | -1px | DM Serif Display | Section openers |
| `{typography.heading-1}` | 44px | 400 | 1.15 | -0.5px | DM Serif Display | Page headlines |
| `{typography.stat-display}` | 48px | 400 | 1.10 | -1px | DM Serif Display | Metric callouts (7,842 STEPS) |
| `{typography.stat-large}` | 64px | 400 | 1.00 | -2px | DM Serif Display | Hero clock / primary metric |
| `{typography.heading-2}` | 32px | 600 | 1.20 | -0.3px | Inter | Subsection headlines |
| `{typography.heading-3}` | 24px | 600 | 1.25 | 0 | Inter | Card section titles |
| `{typography.heading-4}` | 20px | 600 | 1.30 | 0 | Inter | Feature tile titles |
| `{typography.heading-5}` | 16px | 600 | 1.40 | 0 | Inter | Smaller section headers |
| `{typography.subtitle}` | 18px | 400 | 1.50 | 0 | Inter | Page subtitle, lead text |
| `{typography.body-md}` | 15px | 400 | 1.55 | 0 | Inter | Primary body text |
| `{typography.body-md-medium}` | 15px | 500 | 1.55 | 0 | Inter | Body emphasis |
| `{typography.body-sm}` | 13px | 400 | 1.50 | 0 | Inter | Secondary body, list items |
| `{typography.body-sm-medium}` | 13px | 500 | 1.50 | 0 | Inter | Active sidebar, button labels |
| `{typography.caption}` | 12px | 400 | 1.40 | 0 | Inter | Helper text |
| `{typography.caption-bold}` | 12px | 600 | 1.40 | 0 | Inter | Badge labels |
| `{typography.micro}` | 11px | 500 | 1.40 | 0 | Inter | Footer microcopy |
| `{typography.micro-uppercase}` | 10px | 600 | 1.40 | 0.8px | Inter | Section eyebrows, status chips |
| `{typography.button-md}` | 13px | 500 | 1.30 | 0 | Inter | Button labels |
| `{typography.widget-header}` | 10px | 500 | 1.40 | 1.2px | JetBrains Mono | `01 // WIDGET NAME` headers — THE signature |
| `{typography.data-label}` | 11px | 500 | 1.40 | 0.6px | JetBrains Mono | STEPS, BPM, NET — data unit labels |
| `{typography.timestamp}` | 12px | 400 | 1.40 | 0 | JetBrains Mono | Timestamps, durations |
| `{typography.code-md}` | 13px | 400 | 1.50 | 0 | JetBrains Mono | Code blocks |

### Principles

- **Editorial serif / geometric sans / mono triple** — DM Serif Display for stats and emotion; Inter for all UI; JetBrains Mono for data identity. These three families each have a lane — never overlap them.
- **Widget headers are always monospace uppercase** — `01 // WIDGET NAME` in `{typography.widget-header}`. This is the brand signature. Never render widget headers in Inter or DM Serif Display.
- **Stat figures use DM Serif Display** — large numbers always in `{typography.stat-display}` or `{typography.stat-large}`.
- **Monospace for all time, count, and data unit labels** — anything that reads as a "readout" uses `{typography.data-label}` or `{typography.timestamp}`.

---

## Layout

### Spacing System

- **Base unit**: 4px (8px primary increment)
- **Tokens**: `{spacing.xxs}` (4px) · `{spacing.xs}` (8px) · `{spacing.sm}` (12px) · `{spacing.md}` (16px) · `{spacing.lg}` (20px) · `{spacing.xl}` (24px) · `{spacing.xxl}` (32px) · `{spacing.xxxl}` (40px) · `{spacing.section-sm}` (48px) · `{spacing.section}` (64px) · `{spacing.section-lg}` (96px) · `{spacing.hero}` (120px)
- **Widget internal padding**: `{spacing.md}` (16px) compact; `{spacing.xl}` (24px) standard; `{spacing.xxl}` (32px) feature panels
- **Bento grid gap**: `{spacing.sm}` (12px) between cells

### Grid & Container

- **App shell**: 64px fixed sidebar + fluid content area; 16px gutters
- **Dashboard bento grid**: CSS Grid, variable column spans. Standard: 12-column layout with cells at 3, 4, 6, 8, and 12 span widths. Gap `{spacing.sm}`.
- **Widget header**: Full-width strip inside each card — 36px tall, bottom border `1px solid {colors.hairline}`.
- **Marketing pages**: 1280px max-width, 32px gutters
- **Modals and drawers**: Centered 560px max-width panels for forms; 720px for detail views

---

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 (flat) | No shadow; `{colors.hairline}` border | Default widget cards, table rows, form inputs |
| 1 (subtle) | `rgba(0,0,0,0.04) 0px 1px 3px` | Focused / hovered tiles in light mode |
| 2 (card) | `rgba(0,0,0,0.06) 0px 4px 12px` | Modals, dropdowns, date pickers |
| 3 (overlay) | `rgba(0,0,0,0.10) 0px 12px 32px -4px` | Full-screen overlays, command palette |

In dark mode, layering is expressed through sequential navy tones — no shadow needed.

---

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 3px | Micro-controls, compact row chips |
| `{rounded.sm}` | 4px | Small status badges |
| `{rounded.md}` | 6px | Buttons, inputs, select menus |
| `{rounded.lg}` | 10px | Widget cards, modals, panels |
| `{rounded.xl}` | 14px | Feature panels, large containers |
| `{rounded.full}` | 9999px | Status dot indicators ONLY — never buttons |

---

## Components

### Buttons

**`button-primary`** — Gitwork Blue primary CTA.
- Background `{colors.primary}`, text white, typography `{typography.button-md}`, padding `9px 18px`, rounded `{rounded.md}`.
- Pressed: background `{colors.primary-deep}`.
- Disabled: background `{colors.muted}`, text `{colors.stone}`.

**`button-secondary`** — Outlined secondary action.
- Background transparent, text `{colors.ink}`, border `1px solid {colors.hairline-strong}`, padding `9px 18px`, rounded `{rounded.md}`.

**`button-ghost`** — Low-emphasis tertiary action.
- Background transparent, text `{colors.slate}`, no border, padding `9px 18px`, rounded `{rounded.md}`.

**`button-danger`** — Destructive confirmation.
- Background `{colors.danger}`, text white, padding `9px 18px`, rounded `{rounded.md}`.

**`button-dark`** — Dark CTA on light marketing surfaces.
- Background `{colors.ink}`, text white, padding `9px 18px`, rounded `{rounded.md}`.

**`icon-button`** — Square icon-only control.
- Background transparent, border `1px solid {colors.hairline}`, size 32×32px, rounded `{rounded.md}`.

### Widget Cards (Dashboard Signature)

The widget card is the fundamental unit of the Foundry dashboard. Every widget follows the same structural template:

```
┌─────────────────────────────────────────────┐
│ 01 // WIDGET NAME          STATUS CHIP       │  ← widget-header (36px, hairline bottom)
├─────────────────────────────────────────────┤
│           [widget content]                  │  ← widget-body (padding: {spacing.md})
└─────────────────────────────────────────────┘
```

**`widget-card`** — Standard dashboard widget.
- Background `{colors.surface-raised}`, rounded `{rounded.lg}`, border `1px solid {colors.hairline}`, overflow hidden. No drop shadow.

**`widget-header`** — Top strip of every widget card. THE BRAND SIGNATURE.
- Height 36px, padding `0 {spacing.md}`.
- Left: widget number + name in `{typography.widget-header}` (JetBrains Mono, 10px, 500, 1.2px tracking, uppercase).
- Right: optional status chip in `{typography.micro-uppercase}`.
- Bottom: `1px solid {colors.hairline}` divider.

**`widget-stat`** — Large single metric display.
- Figure in `{typography.stat-display}` (DM Serif Display), unit in `{typography.data-label}` (JetBrains Mono).

**`widget-progress-bar`** — Horizontal progress fill.
- Track: `{colors.hairline}`, height 4px, rounded full.
- Fill: `{colors.primary}`.

### Inputs & Forms

**`text-input`** — Standard text field.
- Background `{colors.surface-raised}`, border `1px solid {colors.hairline-strong}`, rounded `{rounded.md}`, height 40px, padding `0 14px`.
- Focused: border `2px solid {colors.primary}`, outline `3px solid {colors.primary-soft}`.
- Error: border `2px solid {colors.danger}`, outline `3px solid {colors.danger-soft}`.

### Badges & Status

**`badge-blue`** — Background `{colors.primary-soft}`, text `{colors.primary-deep}`, rounded `{rounded.sm}`, padding `3px 8px`, typography `{typography.caption-bold}`.

**`badge-green`** — Background `{colors.success-soft}`, text `{colors.success}`.

**`badge-amber`** — Background `{colors.warning-soft}`, text `{colors.warning}`.

**`badge-red`** — Background `{colors.danger-soft}`, text `{colors.danger}`.

**`badge-neutral`** — Background `{colors.surface}`, text `{colors.slate}`, border `1px solid {colors.hairline}`.

**`status-dot`** — 6px circle, `{rounded.full}`. Colors: success (online), warning (away), danger (offline), muted (unknown). THE ONLY USE OF FULL/PILL RADIUS.

### Navigation

**App Sidebar** — Fixed 64px wide left rail.
- Background `{colors.surface}`, right border `1px solid {colors.hairline}`.
- Active icon: `{colors.primary}` fill, background `{colors.primary-tint}` 32×32 rounded `{rounded.md}`.
- Inactive: `{colors.stone}`.

### Signature Components

**`bento-grid`** — Responsive dashboard canvas.
- CSS Grid, 12-column base, 12px gap. Cells span 3, 4, 6, 8, or 12 columns.
- Tablet (768–1023px): 6-column. Mobile (< 640px): single column.

**`cta-banner-blue`** — Closes every marketing page.
- Background `linear-gradient(135deg, {colors.primary} 0%, {colors.primary-deep} 100%)`, text white.
- Headline in `{typography.heading-1}` (DM Serif Display), subtitle in `{typography.subtitle}` (Inter).
- Padding `{spacing.section}`.

**`footer-region`** — Multi-column footer.
- Background `{colors.surface}`, padding `{spacing.section} {spacing.xxl}`, top border `1px solid {colors.hairline}`.

---

## Do's and Don'ts

### Do
- Always open a widget with `01 // WIDGET NAME` in `{typography.widget-header}` (JetBrains Mono) — every single time
- Use `{colors.primary}` (#1D4ED8) for all interactive elements and active states
- Pair DM Serif Display for stat figures and JetBrains Mono for data unit labels
- Apply `{rounded.md}` (6px) to all controls and `{rounded.lg}` (10px) to all cards
- Keep widget borders hairline (`{colors.hairline}`) — no heavy drop shadows on flat surfaces
- End every marketing page with `cta-banner-blue`

### Don't
- Don't skip or restyle the `01 // WIDGET NAME` header — it IS the Foundry brand
- Don't use pill-shaped buttons — `{rounded.full}` is reserved for 6px status dots only
- Don't introduce accent colours outside the blue family and semantic tokens
- Don't use DM Serif Display for body text or UI labels — stats and hero only
- Don't put drop shadows on dashboard widget cards — flat + hairline border is the system
- Don't use pure white (`#FFFFFF`) as the page canvas — use `{colors.canvas}` (`#FAFAF9`)

---

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Mobile | < 640px | Single-column bento. Stat large scales to 40px. |
| Tablet | 640–1023px | 2-column bento grid (6-col base). Marketing nav collapses at 768px. |
| Desktop | 1024–1279px | Full 3-column bento grid. App sidebar at 64px icons. |
| Wide Desktop | ≥ 1280px | Sidebar expands to 240px with labels. Full 12-column bento. |

---

## Motion

| Role | Duration | Easing | Use |
|---|---|---|---|
| Micro | 100ms | ease-out | Badge appearance, status dot change |
| Fast | 150ms | ease-out | Button press, input focus ring |
| Standard | 200ms | ease-in-out | Panel slide, widget expand |
| Gentle | 300ms | ease-in-out | Modal open, drawer slide |

---

## Iteration Guide

1. Every new dashboard panel MUST begin with `01 // WIDGET NAME` in `{typography.widget-header}` — number sequentially within view
2. New data tokens (metrics, stats) go in DM Serif Display (`{typography.stat-display}` or `{typography.stat-large}`) — never Inter
3. Data unit labels and timestamps go in JetBrains Mono — never Inter or DM Serif Display
4. New semantic colours must be one of: primary blue family, success/warning/danger set. No new hues.
5. Marketing page? End it with `cta-banner-blue`. No exceptions.
6. Cards use `{rounded.lg}` (10px), buttons use `{rounded.md}` (6px). `{rounded.full}` = status dots only.
7. No drop shadows on flat widget cards. Shadow means modal or overlay.

---

## Known Gaps

- Dark mode token values are designed but not yet fully implemented in `globals.css` — light mode tokens are authoritative today
- Animation timings above are targets; verify against implemented Framer Motion configs
- `widget-ring` (activity rings) not yet implemented as a reusable component
