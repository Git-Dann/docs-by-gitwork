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
- **Fixed-height two-column popup** (the standard "list + inspector" pattern — version history,
  pickers, browse-and-inspect surfaces): use the shared `<Modal>` at ~`max-w-3xl` with a **fixed body
  height** (e.g. `h-[460px]` — never content-driven, so the popup doesn't resize as you click rows)
  split into **two columns** — a scrollable list on the left (`minmax(0,320px)`) and a scrollable
  detail/preview on the right (`minmax(0,1fr)`), divided by a `{colors.hairline}` rule, each column
  its own `overflow-y-auto`. Select-on-left → render-on-right; default-select the first item on open.
  Reach for this shape before inventing a new layout for any "pick one of a list and inspect it" popup.

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

> ### How to read this section — notation
>
> **This section uses one notation for two different things, and confusing them is how
> buttons shipped with no chrome in July 2026.** A name in **`bold backticks`** is either:
>
> - **a CSS class you literally type** — these are prefixed `app-*` or `widget-*` and are
>   defined in `src/app/globals.css`; or
> - **a pattern or component name** — `task-card`, `gantt-chart`, `doc-card`, `my-day`,
>   `calendar-grid`, `collections-rail`, `task-board`, `task-detail-drawer`,
>   `statement-cover`, `cta-banner-blue`. These are *shapes to build*, not classes that
>   exist. Several correspond to a component file of the same name.
>
> **If a name has no `app-` / `widget-` prefix, assume it is a pattern name and do NOT put it
> in a `className`.** When in doubt, grep `globals.css` — and `npm run audit:ui` now fails on
> any undefined `app-*` / `widget-*` / `button-*` class (rule `UNDEFINED-CLASS`), so a wrong
> guess is caught before review rather than after deploy.

### Buttons

> ⚠️ **This section documented class names that were never implemented.** It named
> `button-primary`, `button-secondary`, `button-ghost`, `button-danger`, `button-dark` and
> `icon-button`; **none of those exist in `globals.css`.** A button written from the old spec
> rendered with *no chrome at all* — no background, no border, no padding, and icons stacking
> above their label, because the missing base class is what supplies `inline-flex`. It shipped
> that way in the Provenance register (July 2026) and nothing caught it: an undefined class
> name is invisible to `tsc`, `eslint`, `vitest` and every existing `audit:ui` rule. There is
> now a rule for it — **`UNDEFINED-CLASS`** (see `docs/build-checklist.md`) — which fails on
> any `app-*` / `widget-*` / `button-*` class that `globals.css` does not define.

**Every button is three classes: `app-button` + a variant + a size.**

```html
<button class="app-button app-button-primary app-button-sm">Strike a countermark</button>
```

**`app-button` is mandatory and comes first.** It carries `inline-flex`, `gap: 4px`,
`font-weight: 600`, the focus ring, the active-press transform and the disabled cursor. A
variant on its own is not a button — it is coloured text.

| Variant | Use |
|---|---|
| **`app-button-primary`** | The one main action. `--brand-700`, white text, skeuomorphic shadow. |
| **`app-button-secondary`** | Default choice for everything else. Surface face, `--border-1` hairline. |
| **`app-button-tertiary`** | Low-emphasis / inline action. Transparent, `--text-3`, no border. (This is what the old spec called `button-ghost`.) |
| **`app-button-danger`** | Destructive confirmation. **Outlined red on a light face** — `#b42318` text on `--surface-0` with a `#fecdca` border, *not* a solid red fill. |
| **`app-button-dark`** | Dark CTA on light marketing surfaces. |
| **`app-button-utility`** | Toolbar/utility control — like secondary but `--text-3`. |
| **`app-button-hyperlink`** | Renders as a link: no padding, border or radius. |

| Size | Height | Notes |
|---|---|---|
| **`app-button-xs`** | 32px | Dense toolbars. |
| **`app-button-sm`** | 36px | **The default** for in-panel actions. |
| **`app-button-md`** | 40px | Forms. |
| **`app-button-lg`** | 44px | Page-level CTA. |
| **`app-button-icon-sm` / `-icon-md`** | 36 / 40px square | Icon-only. Replaces the old `icon-button`. Always give it an `aria-label`. |

Radius is **6px** on every size — set by the size class, so omitting the size also loses the
radius. Icons go in as siblings of the label; `app-button`'s own `gap` spaces them, so do
**not** add `ml-*` to the text (that double-spaces it).

Reference implementation: `src/components/settings/labs-panel.tsx`.

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

**`widget-progress`** — Horizontal progress fill. ⚠️ **The class is `widget-progress`; this
was documented as `widget-progress-bar`, which does not exist.** `devsignal-ui.tsx` still
carries a comment citing the wrong name, so at least one other build read the old spec.
- Track: `{colors.hairline}`, height 4px, rounded full.
- Fill: `{colors.primary}`.

**Adaptive HQ dashboard.** Foundry HQ (`/app`) is composed per person, not one-size-fits-all
(`src/components/app-overview.tsx` + `dashboard/dashboard-config.ts`):
- A subtle **context strip** under the page band — date (mono) · greeting · "who's off today"
  (from staffing alerts). Never a second page title.
- A **"needs attention" row** of role-gated cards — Approvals (1-click approve/reject leave +
  clear expenses), DevOps roll-up, On-your-plate (overdue + due-soon tasks), Sign-off (proposals
  awaiting review). A card renders only if the viewer's role/permission passes (`can()` mirrors
  the server `can*` helpers; Admins/Super Admins see all).
- The **module bento filtered to the viewer's access** — a widget shows only if they hold its
  module permission. Restricted developers get the focused `DevOverview` (My Day + My Clients).
- Attention cards reuse the `widget-card` + `widget-header` grammar and surface live info + light
  actions — not notifications.

### Inputs & Forms

**`app-input`** — Standard text field. ⚠️ **Documented as `text-input`, which does not
exist.** Note ~8 hand-rolled field constants still diverge from it (CLAUDE.md §31) — use
`app-input` in anything new.
- Background `{colors.surface-raised}`, border `1px solid {colors.hairline-strong}`, rounded `{rounded.md}`, height 40px, padding `0 14px`.
- Focused: border `2px solid {colors.primary}`, outline `3px solid {colors.primary-soft}`.
- Error: border `2px solid {colors.danger}`, outline `3px solid {colors.danger-soft}`.

### Badges & Status

> ⚠️ **There is no badge class.** `badge-blue` / `badge-green` / `badge-amber` / `badge-red` /
> `badge-neutral` were documented here but **never implemented** — nothing in `globals.css`
> defines any of them. Every badge in the app is composed inline with Tailwind, which is why
> they drift. Written below as the shape to match, not as classes you can use.

The recipe in use across the app — match it rather than inventing a fifth variant:

```tsx
<span className="inline-flex shrink-0 items-center rounded-[4px] border px-2 py-0.5
                 text-[11px] font-semibold uppercase tracking-wide
                 border-emerald-200 bg-emerald-50 text-emerald-700">
```

| Tone | Border / background / text |
|---|---|
| **Blue** (info, in-progress) | `border-blue-200 bg-blue-50 text-blue-700` |
| **Green** (success, met) | `border-emerald-200 bg-emerald-50 text-emerald-700` |
| **Amber** (warning, partial) | `border-amber-200 bg-amber-50 text-amber-700` |
| **Red** (failure, revoked) | `border-red-200 bg-red-50 text-red-700` |
| **Neutral** (unknown, not established) | `border-slate-300 bg-slate-100 text-slate-600` |

4px radius, never a pill — the status dot below is the only full-radius element in the system.

**Worth doing properly:** an `app-badge` + `app-badge-<tone>` pair in `globals.css` would make
this checkable by the `UNDEFINED-CLASS` audit rule instead of relying on everyone copying the
same five Tailwind strings. Not done here; recorded so it is a decision rather than an
oversight.

**`widget-status-dot`** — 6px circle, `{rounded.full}`. ⚠️ **Documented as `status-dot`,
which does not exist**; the class is `widget-status-dot`, with tone modifiers
`widget-status-dot--success` / `--warning` / `--danger` / `--info` (double dash). Colors: success (online), warning (away), danger (offline), muted (unknown). THE ONLY USE OF FULL/PILL RADIUS.

### Navigation

**App Shell Layout** — 2×2 CSS grid: `grid-cols-[280px_minmax(0,1fr)]`, `grid-rows-[auto_minmax(0,1fr)]`.

```
┌──────────────────────┬──────────────────────────────┐
│  Brand cell          │  Content header              │  ← Row 1 (auto height)
│  foundry-logo.svg    │  <h1>{title}</h1>            │    border-bottom on both cells
│  centred, h-12       │  + optional subtitle         │    so lines align perfectly
├──────────────────────┼──────────────────────────────┤
│  Sidebar nav         │  Main content area           │  ← Row 2 (fills remaining height)
│  ExpandedRail        │  <main>{children}</main>     │
└──────────────────────┴──────────────────────────────┘
```

**Brand cell** (Row 1, Col 1) — same padding as the content header (`px-6 pt-7 pb-5`). Centred logo (`items-center justify-center`). Background: `linear-gradient(180deg, {colors.surface-brand-soft} 0%, #ffffff 38%)`. Right + bottom border `1px solid {colors.hairline}`.
- Logo: `/foundry-logo.svg`, `h-12 w-auto`. **No text. No icon placeholder. Nothing else.**

**Content header** (Row 1, Col 2) — `px-6 pt-7 pb-5`. Background: `linear-gradient(180deg, #ffffff 0%, {colors.surface-brand-soft} 100%)`. Bottom border `1px solid {colors.hairline}`.
- `<h1>` uses `{typography.heading-1}`: 44px / weight 400 / DM Serif Display / `leading-[1.15]` / `tracking-[-0.03em]`.

**Sidebar nav** (Row 2, Col 1) — `ExpandedRail` component. Right border `1px solid {colors.hairline}`. Background: same brand-soft gradient. Width 280px fixed.
- Nav items: 6px radius, 12px padding, Inter 14px/500. Active state: `{colors.surface-brand}` bg, `{colors.brand-300}` border, `{colors.brand-800}` text.

**When `hideContentHeader` is true** — grid collapses to single row (`grid-rows-[minmax(0,1fr)]`). Brand cell and content header are both hidden. Sidebar fills full height.

**Do not add** `BrandGlyph` components, "Foundry by Gitwork" text, or "Prompt-to-production suite" subtitles to the sidebar. The logo SVG is the only brand mark in the sidebar.

### Signature Components

**`bento-grid`** — Responsive dashboard canvas.
- CSS Grid, 12-column base, 12px gap. Cells span 3, 4, 6, 8, or 12 columns.
- Tablet (768–1023px): 6-column. Mobile (< 640px): single column.

**`cta-banner-blue`** — Closes every marketing page.
- Background `linear-gradient(135deg, {colors.primary} 0%, {colors.primary-deep} 100%)`, text white.
- Headline in `{typography.heading-1}` (DM Serif Display), subtitle in `{typography.subtitle}` (Inter).
- Padding `{spacing.section}`.

**Footer** — Multi-column footer. ⚠️ **Documented as `footer-region`, which is not defined in
`globals.css` and is used nowhere in `src/`.** The public pages each build their footer inline.
Treat the below as the target shape, not a class.
- Background `{colors.surface}`, padding `{spacing.section} {spacing.xxl}`, top border `1px solid {colors.hairline}`.

---

## Backstage — Team Calendar

Every Backstage tab (Calendar, Leave, Expenses, Approvals) is a full module surface, so each section wears the widget signature like the rest of the platform — **never** bare cards floating on the canvas. All four use one shared shell, `BackstagePanel` (`src/components/backstage/panel.tsx`), which renders a `widget-card` + `widget-header` with the `NN // SECTION NAME` strip. Sections are **numbered per view** (each tab restarts at `01`): Calendar → `01 // TEAM CALENDAR`; Leave → `01 // ALLOWANCE`, `02 // MY LEAVE`; Expenses → `01 // MY EXPENSES`; Approvals → `01 // LEAVE REQUESTS`, `02 // EXPENSES`.

**`team-calendar` (widget shell)**
- A `BackstagePanel` (`widget-card`: `{colors.surface-raised}` face, `{rounded.lg}` 10px, `1px solid {colors.hairline}` border, `overflow-hidden`, no shadow) headed `01 // TEAM CALENDAR` in `{typography.widget-header}`. Month navigation (`‹ Today ›`) and the **Holidays** toggle live in the header strip as compact `button-secondary` controls.
- Body padding `{spacing.md}` (16px). The month label is `{typography.heading-5}`; the leave/holiday legend sits inline beside it.

**Stat tiles (Leave allowance)** — Allocated / Used / Pending / Remaining render as editorial stats: figure in DM Serif Display (`{typography.stat-display}`-style, ~32px) over a JetBrains Mono `{typography.data-label}` caption. Remaining uses the `{colors.surface-blue}` accent tile. This serif-figure + mono-label pairing is the platform's data signature — never plain bold sans.

**Forms** — Leave/expense forms are themselves `BackstagePanel`s (un-numbered, e.g. `NEW LEAVE REQUEST`, `EDIT LEAVE`) using the standard `app-input` controls — never ad-hoc bordered boxes. Approver-only affordances (the **For** member picker for filing on behalf, the **Mine / Everyone** scope toggle, and the per-row **Edit**) are gated client-side via `useBackstageAccess().canApprove` and enforced server-side; they don't render for ordinary staff.

**`calendar-grid`**
- The weekday header row and the 6×7 day grid render as **one joined card** — a single `{rounded.lg}` bordered container with the weekday strip and grid divided by a hairline, never separated by a gap. (A `space-y` gap between them is a bug — they must read as one instrument face.)
- Day cells: `min-h-[100px]`, `{colors.surface-raised}` face; out-of-month and weekend cells drop to `{colors.canvas}`. Today's date number sits in a `{colors.primary}` filled circle (one of the few sanctioned `{rounded.full}` uses, alongside status dots).

**Leave pills & holiday chips**
- Leave bars are colour-coded by type — Annual (`{colors.primary}` family), Sick (`{colors.warning}`), Unpaid (`{colors.steel}`), Other (violet). Half-days render as half-opacity pills. Cap at 3 per cell, then `+N more`.
- Public/religious holidays show as a small sky-tinted chip with a globe glyph + the country code (e.g. `PK`), titled with the full holiday name.

**Holidays model & toggle**
- Holiday countries are **workspace-wide** (`Workspace.holidayCountries`, ISO-3166-1 alpha-2; defaults to UK + Pakistan) — everyone sees the same set regardless of where they're based, so PK public + religious days (e.g. Eid) act as client-comms prompts for the whole team.
- The header **Holidays** dropdown lets each viewer show/hide individual countries (persisted client-side). Country labels come from `Intl.DisplayNames` so new countries need no code — just extend `holidayCountries`.
- **Timezone rule (gotcha):** `date-holidays` returns dates in each country's *local* timezone. Always derive the calendar date from the library's local date string — never `new Date(h.start).toISOString()`, which rolls the day backwards for any country ahead of UTC (Pakistan +5, UK in BST +1) and renders every holiday one day early.

---

## Task Board (Portal)

The Portal task tracker reuses the existing widget grammar — no new tokens or hues.

**`task-board`** — Kanban canvas. Horizontally-scrolling columns, one per status, in
fixed order: Backlog · To Do · Doing · In Review · Done.
- Each **column header** is a numbered monospace widget header — `01 // BACKLOG` in
  `{typography.widget-header}` (JetBrains Mono) — with a count chip on the right. Columns
  number `01`–`05` left to right.
- Column body: `{colors.surface}` panel, `{rounded.lg}`, `{colors.hairline}` border. The
  active drop target highlights with `{colors.surface-blue}` + `{colors.primary}` border.

**`task-card`** — The unit dragged between columns and listed in the table view.
- `{colors.surface-raised}`, `{rounded.md}` (8px), `{colors.hairline}` border, no shadow at
  rest; a subtle Elevation-1 shadow + slight rotate while dragging.
- Anatomy: priority dot (left) · title (`{typography.body-sm-medium}`) · assignee avatar
  (right) · then a meta row — optional status badge, client chip, due date in
  `{typography.timestamp}` (mono; red when overdue), and a comment count.

**Task status → badge/dot.** Uses the semantic + blue families only, matching the app-wide
`StatusBadge` (rounded border + `status-dot` + label):
- Backlog → neutral (`{colors.steel}` text, `{colors.muted}` dot)
- To Do → blue (`sky`)
- Doing → amber (`{colors.warning}` — the "in-progress" tone)
- In Review → blue (`{colors.primary}` family)
- Done → green (`{colors.success}`)

**Task priority** — a 6px `status-dot` only: High = `{colors.danger}`, Medium =
`{colors.warning}`, Low = `{colors.muted}`. Label shown on hover / in the detail drawer.

**`task-detail-drawer`** — Right-anchored slide-over (≤560px) at Elevation-3. Status
quick-select chips, a meta grid (assignee, priority, due, creator), description, and an
append-only **notes thread** (avatar + author + mono timestamp per note).

**`my-day`** — The developer standup surface (also the centre of the developer dashboard).
A single `widget-card` (`01 // MY DAY`) with Doing / Up next / Done-today groups, a Monday
"This week" textarea (pre-filled from tasks due this ISO week), and **Push morning / Push end
of day** actions that show the pushed time in mono. The DevOps roll-up (`02 // DAILY ROLL-UP`)
lists each dev's AM/PM push state as labelled `status-dot`s with a single Publish action.

**Feature blocks ("lists")** — A feature block is the unit of timeline planning: a name, a
start + end date, a colour, and a set of tasks. Created/edited via `feature-block-form` (a modal
with a colour swatch picker). Tasks optionally belong to a block; loose tasks show on the board
only. On a card the block renders as a `{colors.surface-brand}` chip; the list view adds a Block
column.

**`gantt-chart`** — Dependency-free timeline. Each feature block is one bar, positioned by its
start/end on a continuous day-scale axis. A sticky left rail (240px) lists the block name,
progress, and its task titles (done = green dot); the scrollable track holds the bars (progress
fill inside each). A zoom control switches **Month · Quarter · 6 months · Year** (pixels-per-day),
and a **red vertical line marks today**, spanning all rows. Bars take the block colour from a
fixed palette (blue/violet/emerald/amber/rose/slate). The same component renders the public
client timeline read-only.

**Per-client tasks page** (`/app/portal/[slug]/tasks`) — opened from the **`06 // DEVS`** card's
bottom-right **Tasks →** button (no Portal-level tab, no extra client-detail card). Header is a
back-link to the client + a **Board · List · Gantt** view toggle; actions are New task, New block
(in Gantt view), and **Share timeline**.

**Public timeline** (`/timeline/[token]`) — a tokenised, read-only, client-facing Gantt: feature
blocks + task names + progress + the today line, with no assignees/notes/internal status. Toggled
per client from the Share control. Follows the public Pulse report's no-auth, `noindex` pattern;
closes with a quiet "Powered by Gitwork" footer.

**v3 additions** — **multi-assignee** (overlapping avatar stack via `AssigneeStack`, +N overflow;
the form uses togglable name chips); **subtasks** (one level — checklist in the detail drawer, a
`☰ N` count on the card); **acceptance criteria** (optional field shown above Notes); **milestones**
(single-date diamond markers on the Gantt, dashed vertical + coloured label, on internal + public);
**undated feature blocks** (board-only groupings until both dates are set, then they become bars).
Milestone/block bar colours share one palette (blue/violet/emerald/amber/rose/slate).

**Bulk selection (List view)** — the per-client **List** view supports multi-select for triage at
scale (e.g. assigning devs across an import). A leading checkbox column + a **tri-state** header
box (checked / indeterminate / empty) drive **select-all / deselect-all**; selected rows tint
`{colors.surface-brand}`. When any row is selected a **batch bar** (`task-batch-bar`) sticks to the
top of the list: a `{colors.surface-brand}` panel showing "N selected" + Clear, then right-aligned
actions — **Assign** (member checklist → replace assignees), **Status**, **Priority**, **Block**
(each a small dismissible dropdown), and **Delete** (inline two-click confirm in `{colors.danger}`).
Checkbox clicks stop propagation so they never open the detail drawer.

---

## Docs Dashboard (card library)

The Docs list (`/app/docs`, `src/components/proposals/proposal-list.tsx`) is a **card library**, not
a table-first screen — the clearer, scale-friendly model for a growing document set. It reuses the
widget grammar; no new tokens.

**One library widget.** The whole surface is a single `widget-card` headed `01 // DOCUMENT LIBRARY`,
with a live readout on the right (`{n} DOCS · {n} FAV · {n} ARCHIVED` in `{typography.widget-header}`).
The four standalone stat tiles were removed — those counts live in the header readout + rail instead,
which reads cleaner and matches the card-first reference.

**Two-pane body — `collections-rail` + content.** Inside the card, a `lg:grid-cols-[212px_1fr]`:
- **`collections-rail`** (left, 212px; stacks above the grid below `lg`). A **scope** group —
  *All Docs · Favorites · Archived*, each a `RailItem` (full-width 6px-radius button, leading
  Heroicon, label, right-aligned mono count). Active item = `{colors.surface-brand}` fill +
  `{colors.brand-300}` border + `{colors.brand-800}` text (the app-sidebar nav treatment). Below a
  `TYPE` mono-caps eyebrow, the same `RailItem` (dense, no icon) lists *All types* + each doc type
  that has docs, role-gated (developers never see admin types). Scope owns archived; `All/Favorites`
  exclude archived.
- **content** — the active view. Toolbar (above the pane split) carries search, a Filters popover
  (sort + non-archived status refine), the **view toggle**, and the create/Analytics actions.

**View toggle — Cards · Table · By client.** `Cards` is the default. Table (multi-select bulk
actions) and By-client (grouped) are retained behind the toggle for power triage — nothing lost.

**`doc-card`** — the unit of the Cards view (`grid sm:grid-cols-2 xl:grid-cols-3`, 12px gap).
- A `{rounded.lg}` `{colors.surface-raised}` card, `{colors.hairline}` border, no shadow at rest;
  hover lifts to Elevation-1 + `{colors.hairline-strong}` border. `overflow-hidden` so the cover
  bleeds to the rounded corners.
- **Generated cover** (a `<Link>` to the editor) — no image storage. A soft diagonal gradient
  whose hue is **deterministic** (hashed on client + title) from the documented Gantt/feature-block
  palette (blue/violet/emerald/amber/rose/slate) as light tints. On it: a doc-type + number mono
  eyebrow, the **title in DM Serif Display** (editorial, 3-line clamp), and the client in a mono
  caption — reading like a little document cover. The **favourite star** floats top-right on a
  `bg-white/40` backdrop chip (filled `{colors.primary}` when starred); it toggles
  `Document.isFavorite` (workspace-level, optimistic).
- **Body**: a mono `{typography.data-label}` readout — `{n} blocks · {updated}` — then a row with
  `StatusBadge` left and hover-revealed actions right — Edit, then Duplicate · Archive · Delete
  (or Restore · Delete in the Archived scope), gated by `canManageDocs`.

---

## Presentation Mode (Docs)

Any document can be presented full-screen as a slide deck (`src/components/proposals/presentation-mode.tsx`,
opened by the **Present** button in the editor header). It is a *presenter surface over the live
doc* — not a separate slide artifact. v1; richer decks may come later.

**Stage.** A `fixed inset-0 z-[200]` overlay on the navy stage (`{colors.surface-dark}` `#0F172A`,
the sanctioned dark surface). One **slide per visible top-level block**, in document order
(merge-variables resolved, read-only — it reuses `ProposalSectionPreview`). Each slide is a centred
white card (`max-w-[1000px]`, `{rounded.xl}`, Elevation-3 shadow) so the doc reads exactly as shared.

**Chrome (white-on-navy, thin).** Top bar: `Slide n / N` mono pill (left), doc title + **Exit**
(right). Bottom bar: **Notes** toggle (left), prev/counter/next (centre), drawing tools + **Draw**
toggle (right). Navigation: ← / → / Space / PageUp-Down, plus click the left/right edge of the
stage; `N` toggles notes, `D` toggles draw, `Esc` drops drawing then exits.

**Speaker notes.** Per-block, authored in the editor (a block's **Options & notes** drill-in —
`DocumentSection.speakerNotes`). Presenter-only: shown in the bottom-left notes drawer in
presentation mode, **never** in the doc body, public share, or PDF.

**Drawing overlay (ephemeral).** A canvas over the stage with **Pen · Highlighter · Eraser**, the
brand+semantic ink palette (red/amber/blue/green/ink), and a width slider. It is a transient
visual aid — **never persisted**; cleared on slide change, on **Clear**, and on exit. Highlighter
is a low-alpha wide stroke; the eraser is `destination-out`. DPR-aware for crisp lines.

---

## Document Render (statement style)

The rendered **document** (Docs editor canvas, public `/docs/[token]`, and PDF/print) follows an
editorial financial-statement look (Harry's reference). This is a distinct surface from the app UI
and the dashboard — it deliberately breaks the app's Inter-body rule. Scoped to `.proposal-document`
(`globals.css`); Pulse reports render `DocumentCover` in `bold` style and never carry this class, so
they are unaffected.

**Palette (doc-scoped tokens).** Warm cream **paper** `--doc-paper #F0EEE8`, near-white **panel**
tiles `#F7F5EF`, one **dark** tile `#191817`, warm **ink** `#1A1A17` / soft `#4B4A44`, warm-grey
**muted** labels `#8A867C`, hairlines `rgba(0,0,0,0.14)`, and a **periwinkle accent** `--doc-accent
#4F5BD5` (distinct from the app's royal `--brand`). Used only for the cover eyebrow/title period,
callout rule, and links.

**Type.** DM Serif Display headings (section titles, the cover title, stat figures); **JetBrains
Mono body** (paragraphs, table cells, bullets — the signature); mono uppercase labels/eyebrows.
Section blocks drop the `Section NN` eyebrow + numbering and the between-section dividers — serif
title, optional mono description, flowing on spacing.

**Blocks.** Every section preview inherits the statement palette automatically: `.proposal-document`
**remaps the app tokens** (`--text-*`, `--border-*`, `--surface-*`, `--brand-*`) to the doc palette,
and `.bg-white` panels warm to `--doc-panel` — so blocks that already paint with those tokens
(tables, KPI tiles, callouts, lists) go warm + periwinkle with no per-file edits. Big figures stay
DM Serif Display, labels/cells stay mono. The block **editors** (e.g. `CostBreakdownTable`) render
outside `.proposal-document`, so they keep the standard app styling.

**Infographic blocks** (from the Release-Process reference) — new palette blocks under **Lists**,
all in the statement palette with a **style dropdown/toggle in their Options** (never crowding the
canvas). Each is inline-editable:
- **Process steps** (`process_steps`) — numbered workflow pills with connecting arrows; options:
  row vs stack, arrows on/off, highlight the final step (accent-filled).
- **Do / Don't** (`do_dont`) — green-tick "do" panel beside a red-✕ "don't" panel (+ optional
  footnote); the don't panel toggles dark (navy) or light.
- **Principles grid** (`principles_grid`) — numbered items (01 · 02 · …); light or navy, 2/3 cols.
- **Category checklist** (`category_checklist`) — a grid of small titled checklist cards, 1–4 cols.
- **Heading → navy banner** — the `heading` block gained a `banner` style: a full-bleed navy band
  with mono eyebrow + serif title (accent period) + optional lead. Chosen from the heading Options.

**Responsive builder.** The editor splits into the outline rail + canvas at `lg` (single column
below); on mobile the outline stacks above with a capped, scrollable height so it never buries the
document, and the page title + document padding scale down. Block **style choices are always
dropdowns/toggles in the block's Options** — the canvas stays clean.

**The Docs editor is a FIXED-HEIGHT FRAME (desktop) — the page must NEVER scroll past the
viewport.** On `lg` the editor root is `lg:h-full lg:min-h-0 lg:flex lg:flex-col lg:overflow-hidden`
(fills `<main>` — the shell is `h-[100dvh]`, a definite chain, so `h-full` resolves). **This
requires the app-shell layout grid to carry `lg:grid-rows-[minmax(0,1fr)]`** (both `app-shell.tsx`
and `demo-shell.tsx`) so its single row — and therefore `<main overflow-auto>` — is a definite,
viewport-bounded height and becomes the scroll container. Without that row template the grid row is
`auto`, `<main>` grows with content, and any height-framed page overflows the whole viewport. The
shell root must ALSO be `overflow-hidden` (it's a fixed `h-[100dvh]` frame; `<main overflow-auto>`
is the scroll container) — without it a tall absolutely-positioned descendant that escapes `<main>`
(e.g. the paged-document's off-screen measurer at `left:-99999`) attaches to the root and grows the
whole PAGE, so it scrolls past the viewport even though `<main>` is correctly bounded. Keep the two
shells in sync (both `relative … h-[100dvh] overflow-hidden` root + `lg:grid-rows-[minmax(0,1fr)]`). The
**`lg:overflow-hidden` is load-bearing**: without it, `h-full` sizes the root correctly but the tall
document still SPILLS out and grows the scrollable page — the exact "page scrolls past the viewport"
bug. The document header + toolbar are `lg:shrink-0`, and the outline+canvas `<section>` is
`lg:flex-1 lg:min-h-0 lg:grid-rows-1` (the `grid-rows-1` = `minmax(0,1fr)` single row so it fills the
frame instead of growing to content — do NOT use an `auto` row here). **Both columns FILL the
frame and scroll internally — no dead space.** The outline card is `lg:h-full lg:flex lg:flex-col`
with its list `lg:flex-1 lg:overflow-y-auto` (a short block list must not leave a tall empty column
below it); the canvas pane is `lg:flex-1 lg:min-h-0 overflow-auto`. Scroll panes carry
`[scrollbar-gutter:stable]` so a scrollbar appearing on hover never shifts the layout (the
"hovering shifts the whole screen" bug on classic-scrollbar setups). The **canvas scrolls INTERNALLY** — the canvas card is
`lg:flex lg:flex-1 lg:min-h-0 lg:flex-col` and its scroll pane is `lg:flex-1 lg:min-h-0 overflow-auto`;
the outline rail is `lg:h-full lg:min-h-0 lg:overflow-y-auto`. **NEVER give the canvas pane an
unbounded or `max-h-[calc(100dvh…)]` height on desktop** — a multi-page document then grows the
whole page and the editor scrolls past the viewport with dead space. (Mobile keeps normal document
flow; the fixed frame is `lg:`-only.) This is a hard rule — regressing it is a P0 UI bug.

**Rail editors are SINGLE-COLUMN / STACKED — fields are never crammed horizontally.** Every block
editor renders in the ~280–360px Options rail, so:
- Use **container queries**, never viewport breakpoints, for editor field grids: a `@container`
  ancestor + `@[26rem]:grid-cols-2` / `@[26rem]:col-span-2` (fields go two-up only when the rail is
  genuinely wide). `sm:`/`md:`/`lg:` on an editor field grid is a bug — it keys off the window, not
  the rail.
- Repeatable items are an **`ItemCard`** (`src/components/proposals/editor-primitives.tsx`): the
  move/delete controls sit in a **header row** (compact `icon-sm`, `shrink-0`), never beside the
  fields; the label is `min-w-0 truncate`; fields stack full-width below.
- Section "Add …" headers use **`EditorSectionHeader`** (or `flex flex-wrap … gap-x-3 gap-y-2` with a
  `min-w-0` label) so the button wraps below instead of overlapping the label.
- A **grid/matrix editor never renders a cell per column side-by-side in the rail** (they crop to
  junk like "1-", "Au"). Stack instead: one card per row, each cell a full-width input **labelled by
  its column** (see `data_table`'s Rows editor).

**`statement-cover`** (`DocumentCover` when `coverStyle !== "bold"`) — a full cream page:
- Header: brand logo left, a mono **classification stack** right (`DOC TYPE` · `PREPARED {date}` ·
  `CONFIDENTIAL`), then a full-width hairline.
- A short accent bar, an **accent eyebrow** (`CLIENT / DOC TYPE`), and the big serif **title with a
  periwinkle period**.
- A mono **meta grid** (Client · Prepared by · Date · Version, up to 4-up), a mono executive
  summary, **stat tiles** (rounded panels, one dark), an accent-ruled confidentiality callout, and
  a **company footer** strip (Gitwork letterhead left, contact right).

### Per-document theme — Foundry vs Gitwork

Every document carries a **theme** (`ProposalMetadata.docTheme`, default `"foundry"`), chosen with a
Foundry·Gitwork toggle in the editor header. It sets `data-doc-theme` on `.proposal-document`; the
`globals.css` block remaps the `--doc-*` tokens **and the font vars** within that scope, so every
block re-derives with no per-file edits. Two themes:

- **Foundry** (default) — the statement style above: warm cream paper `#F0EEE8`, periwinkle accent
  `#4F5BD5`, **DM Serif Display** headings, **JetBrains Mono body** (the signature mono look), mono
  uppercase labels. Cover = cream with the **Foundry wordmark**.
- **Gitwork** — the brand-guide look (see `gitwork-brandguide` + the `SWG Brain Platform` delivery
  PDF). Palette: navy `#0C0C18`, cream `#F2EDE4`, purple `#6B52FF`, muted `#68686B`, white `#FFFFFF`.
  Type: **Fraunces** display + **Inter** body AND labels (the mono-var remaps to Inter, so the
  uppercase-tracked labels are Inter caps, per brand). Signature elements:
  - **Round "G." mark** (`GitworkMark` in `document-cover.tsx`) — cream circle, navy Fraunces "G", a
    purple period. Used on the cover header + the running-header bar.
  - **Full-navy cover** — the whole A4 page is navy, cream ink; purple accent bar + eyebrow
    (`CLIENT / DOC TYPE`); Fraunces cream **title with a purple period**; italic/Inter subtitle; the
    mono→Inter **meta row** (Client · Prepared by · Date · Version); a purple-ruled confidentiality
    callout; and the company footer (`GITWORK GROUP LTD …` left, `…GITWORK.CO.UK` right).
  - **Content pages** — cream paper; a full-bleed **navy running-header bar** (the "G." mark +
    `GITWORK · {client}` left, doc number right); Fraunces section titles with a purple period +
    purple underline; Inter body; mono→Inter labels; purple left-border recommendation callouts;
    footer with the reg line + `page N of N`.

**Cover sizing + presentation.** The cover is pinned to exactly one A4 sheet
(`.doc-a4-page__inner--cover { height: 297mm; overflow: hidden }`; the `DocumentCover` section is
`min-height: 297mm`). In **presentation** mode the cover renders **full-bleed** (fills the slide, no
scale, no surrounding card) so it goes edge-to-edge; other slides scale-to-fit. Title `line-height`
is `1.16` (not `1.08`) so serif descenders never clip.

---

## Golf Data Console (Wedge wiki)

A Wedge-only section of the client wiki (`/app/portal/wedge/wiki` → **Golf Data**) that
surfaces the **Gitwork Golf Data** platform — the real golf datasets Foundry holds for Wedge. It
reuses the widget grammar wholesale; no new tokens or hues. Component
`src/components/clients/wiki/golf-data-console.tsx`.

**Everything shown is real data — no fabricated figures.** Two views, switched by a **dropdown in
the action bar next to Refresh** (`app-select-compact`):
- **Platform overview** (`GET /api/clients/[slug]/wiki/golf-data` → `golf-data-console.ts`) — the
  two live Foundry domains: **Equipment/clubs** (from the `GolfClub` catalogue, `golf-clubs.ts`)
  and **Courses** (from `ClientCourseRequest` intake). Providers, dataset versions, validation,
  runs and pipeline derive from those; a `LIVE` chip marks each real provider.
- **Course backend** (`GET /api/clients/[slug]/wiki/golf-data/course-backend` →
  `bigwedge-course-api.ts`) — a **read-only** live pull from the Big Wedge course backend's own
  aggregates (`/api/v1/stats · /sources · /activity`): courses/clubs/GPS coverage, coverage by
  country, data-quality bars, source coverage, hole distribution, recent enrichment activity.
  Foundry **never writes** to it; auth reuses the Care Analytics connector token (base URL
  overridable via `WEDGE_COURSE_API_URL`). Degrades to a clear "not connected" card.

**Developer API is disabled.** A disabled **Dev API** control sits in the action bar, and the
overview's `11 // DEVELOPER API` widget lists the planned (struck-through) endpoints. The routes
(`/api/golf/clubs`, `?format=csv`, `/api/golf/clubs/openapi`) exist but are gated off behind
`GOLF_DEV_API_ENABLED` (default off → 404) until we open the platform to developers.

**Layout.** An action bar (system-status dot + `Updated {mono time}` left; **view dropdown** +
disabled **Dev API** + **Refresh** right), then per view a **metric strip** of stat widgets and an
`xl:grid-cols-3` body of `widget-card`s, each opened by the `NN // NAME` monospace header — the
console is a grid of widgets, not a bespoke screen. (Overview numbers `01`–`14`; the Course
backend view numbers its own `01`–`05`.)

**Console conventions (within the widget system):**
- **Metric panels** — DM Serif Display figure (~40px) over a mono `{colors.…}`-toned sub-label
  (`CheckCircle`/`Triangle` glyph) with an inline SVG **sparkline** stroked in the metric's tone.
- **Tables** — mono uppercase 10px headers, hairline row borders, provider/country *names* in
  Inter, all IDs / timestamps / counts in JetBrains Mono. Run IDs + version strings render in
  `{colors.primary}`.
- **Status** — a `rounded-sm` (4px) badge with a leading status dot, mapped to the semantic set:
  Valid/Healthy/Succeeded → green, Warning/Degraded → amber, Failed/Down/Critical → red, Info →
  blue. Never a pill.
- **Success cells** — a mono `%` beside a slim `widget-progress` fill (`{colors.primary}`).
- **Pipeline** — hairline-bordered mono nodes in three lanes (Providers → Transform → Datasets)
  joined by chevron arrows; a node borders in its tone when it carries state.
- All colours resolve through `--text-*` / `--surface-*` / `--border-*` / `--brand-*` / semantic
  tokens, so the console is correct in both light and navy dark mode.

## Deck (the slide editor at `/deck`)

**Deck** is Foundry's standalone slide editor — a fork of the MIT `bento/slides` app
vendored at `vendor/bento` and served as a single static shell from `public/deck/index.html`
(see `CLAUDE.md` §30). It is the platform's only **third-party-derived UI**, so the rule is
simple: it wears the same design system as everything else, and the skin lives in exactly one
file — `vendor/bento/slides/src/foundry/theme.css`. Never restyle the vendored chrome inline.

**It opens in its own window, and that is deliberate.** A Deck file *is* the app: the built
HTML carries the runtime and the document together, and ⌘S rewrites that file in place. There
is no document row to render inside the `/app` shell, so Deck is never framed by the sidebar —
it is reached by a small mono `· DECK ↗` link in the HQ context strip and a `Deck` secondary
button on the Docs list toolbar, both `target="_blank"`.

**There is no logo in Deck's chrome — the only mark is the favicon.** Identity is the words
*Foundry Deck*: in the window title, the splash, the About dialog, and the inert lockup a saved deck
shows. The favicon is the platform's own disc (`src/app/icon.svg`, `#4F46E5`), switched to the
Gitwork disc under that brand, so a Deck tab sits beside a Foundry tab and reads as the same
product. This is deliberate and load-bearing: what used to sit in the topbar was upstream's tile
triptych repainted in our blue, and a mark repeated across topbar, dialog and splash is three
chances to look like someone else's product. Don't reintroduce one.

**Because it has no sidebar, the topbar's first slot is the way back** — `← Foundry`, linking to
`/app`, mono caps label, arrow nudging left on hover. Not a logo, and not an About trigger: a
window with no chrome around it needs an exit more than it needs a wordmark, and the window title
already names the app. It says *Foundry* under both brands, because the destination is the
platform, not the brand being worn. A **saved** deck — a file on someone's disk, possibly outside
Gitwork — has nowhere to go back to, so it shows the inert brand lockup there instead.

**Two brands, one shell** — the same Foundry/Gitwork pairing as the per-document doc theme
above, switched from a compact segmented control in the topbar (mono caps, 6px, brand-soft
active fill). `:root` is Foundry; `:root[data-brand='gitwork']` re-derives every token:

| | Foundry | Gitwork |
|---|---|---|
| Paper / chrome | `{colors.canvas}` `#FAFAF9` | cream `#F2EDE4` |
| Ink | `{colors.ink}` `#0F172A` | navy `#0C0C18` |
| Accent | Gitwork Blue `{colors.primary}` | purple `#6B52FF` |
| Display | DM Serif Display | Fraunces |
| Labels | JetBrains Mono caps | Inter caps (per the brand guide) |
| Mark | tile triptych in blue tones | the round "G." disc |

Switching re-skins the editor **and** re-themes the deck while the deck is still on brand
defaults (paper, ink, accent and the chart palette move; anything hand-picked is left alone).
One `store.commit`, so ⌘Z undoes it. It repaints — it never rewrites text baked into a deck. A
**saved** deck opens in the brand its theme matches, so a Gitwork deck reads as Gitwork for whoever
was sent it. The control only renders at **≥1560px** (below that it would squeeze the deck-title
field); `?brand=gitwork` forces a brand at any size.

**What the skin enforces** (upstream's chrome is otherwise generic light-grey SaaS):
- **`NN // SECTION` widget headers** — every properties-rail section is a 36px hairline-bordered
  strip with a mono `{typography.widget-header}` label and its number in the accent, produced by
  a **CSS counter** on the rail so it stays sequential as sections change with the selection.
  This is the brand signature; it is not optional, even here.
- **No pills.** Upstream ships `999px` on its zoom bar, chip bar, present pill, toasts and
  dialog buttons; the skin returns them to `{rounded.md}` / `{rounded.lg}`. Full radius stays
  reserved for status dots and collaborator avatars. **This does not come free from the token
  swap, and it is not self-evident on screen** — the present pill stayed a literal 999px pill for
  two passes while this paragraph claimed otherwise, because upstream writes it at
  `.ed-present-pill .ed-pill-main` (0,2,0) and our de-pilling rule is a bare `.ed-btn` (0,1,0).
  Split controls have the same trap in reverse: a partial radius written at (0,1,0) loses to
  `.ed-btn` and the half rounds on all four corners, which reads as the seam being *cropped*.
  Write joined-control radii at (0,2,0), and let `02b // INSTRUMENT GEOMETRY` in
  `verify-shell.mjs` check it — radius is invisible to the clipping audit and to every
  behavioural test.
- **Instrument geometry + hairlines** — 6px controls, 10px cards/menus, `{colors.hairline}`
  borders, Elevation-2 only on menus and dialogs.
- **The type triple, each in its lane** — Inter for UI, DM Serif Display for the wordmark and
  large figures, JetBrains Mono for every readout (numeric inputs, zoom, slide numbers,
  timestamps). All three are **embedded as base64 woff2** in the shell, because a Deck file must
  make zero external requests — a saved deck keeps its typography offline.
- **Gitwork Blue on every interactive + active state**, replacing upstream's amber accent
  (including the dirty-save dot and the active slide thumbnail).
- **Dialogs are the platform's dialogs.** Deck's own About/settings popup is the standard
  fixed-height two-column popup specified under *Grid & Container* — 768px, a 36px widget-header
  strip, a body that is always 460px, `minmax(0,300px) / minmax(0,1fr)` either side of a hairline,
  pick-left/read-right. It is hand-built in `foundry/about.ts` because Deck is vanilla TS, but the
  geometry and tokens are the same ones `<Modal>` produces, so it reads as one system. Below 720px
  it collapses to a single column with the nav as a scrolling strip — a 460px box plus a wrapped
  nav is taller than a phone, and a dialog you can't reach the bottom of is the exact failure the
  clipping audit exists to prevent.

**Dark mode is the platform's, not Deck's own.** Upstream has one fixed light palette; Foundry
stores `system | light | dark` in `localStorage` (`gitwork.theme.v1`) and paints `<html data-theme>`.
Deck is served same-origin from `/deck`, so `foundry/theme-mode.ts` reads that same key, stamps the
same attribute, and keeps listening — flip the toggle in a Foundry tab and the Deck window follows
live. Two boundaries hold: only the **chrome** flips (topbar, rails, dialogs, the workspace behind
the slide), because the **artboard is the document** and keeps the deck's own paper — a dark editor
around a light page, as in every design tool; and it is a storage read, never a network one, so a
saved deck honours it offline without breaking the zero-requests contract. On dark, elevation is
tone rather than shadow, and the accent lifts to `#6BA0FF` (Foundry) / `#A99BFF` (Gitwork) because
`{colors.primary}` on a near-black surface fails contrast.

**Deck-native slides follow the document grammar** — the starter deck is built from the same
parts as the rest of the platform: a mono eyebrow over a short accent rule, a serif headline,
and stat tiles (DM Serif figure over a mono caps label, one accent-filled).

**The accent sweep is not optional, and tokens alone don't finish it.** Upstream drives most of its
chrome from `--accent`, but hard-codes coral/amber in the places a token swap can't reach — so those
surfaces stayed bento-coloured until each was re-pointed: the About primary, the update chip (with
`!important`), the player/unlock buttons, the live-reader dot *and its pulse keyframe*, the recovery
banner, checkbox `accent-color`, the Slideshow first-run "runner" comet, **present mode** and the
**speaker view**. Present mode and speaker view follow `--bento-accent` — the **deck's** accent — so a
Gitwork deck presents in purple and a Foundry deck in blue. Speaker view is a separate popup painted
with a copy of these styles, so it never carries `[data-brand]` and uses `--fd-speaker-accent`, a mid
blue/violet: `{colors.primary}` on near-black is unreadable, which is why upstream used amber there.

**Responsive** — upstream's topbar is a single nowrap flex row of ~38 controls, so below the
`lg` split it overflowed and scrolled the whole page sideways (+292px at 390px, in upstream's own
build too). It **wraps** below 1024px instead: `overflow-x:auto` on that bar would clip the dropdown
menus that live inside it, and `overflow:hidden` would hide controls outright. Where space is tight
the house lockup yields before upstream's UI does — the `DECK` tag at ≤1359px, the brand switch at
≤1559px (its two words *are* the control; initials would be worse than absence) — so the deck-title
field stays readable. `?brand=gitwork` still forces a brand at any width. Verified at 390 · 430 · 768
· 1023 · 1024 · 1280 · 1440 · 1600 with `vendor/bento/scripts/verify-shell.mjs`, which is also the
regression gate for everything above.

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
