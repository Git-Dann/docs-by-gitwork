# Foundry theme — Toolcraft app

This Toolcraft app is themed to match **Foundry by Gitwork** (`../DESIGN.md` is the
canonical design system). Everything you build here should read as part of the Foundry
platform.

## Where the theme lives

| File | Role |
|---|---|
| `src/styles.css` | Font imports · `@theme` (fonts + radius scale) · `:root` = Foundry **navy dark shell** tokens. This is the app-owned entry — safe to edit. |
| `src/foundry-theme.css` | Foundry utility color tokens, the `.foundry-light` cream scope, and the signature component classes. Imported by `styles.css`. |

> ⚠️ **Never edit `src/toolcraft/`** — it's integrity-locked (`.toolcraft-manifest.json`,
> checked by `pnpm test`). The whole builder chrome is driven by the CSS tokens above, so
> re-theming happens entirely in the two app-level files.

## Fonts (the three-font system)

- **Inter** — all UI (`font-sans`, the default)
- **DM Serif Display** — big stat figures / editorial only (`font-serif`)
- **JetBrains Mono** — widget headers, data labels, timestamps (`font-mono`)

All three are self-hosted via `@fontsource*` (no network calls).

## Colours & radius

The core tokens (`--background`, `--primary`, `--card`, `--border`, …) are set to the Foundry
**navy dark shell** by default, which is what tints the whole Toolcraft chrome. Foundry-named
utility tokens are also exposed, so Tailwind utilities work directly:

- Brand: `bg-brand` (#1D4ED8), `bg-brand-deep`, `bg-brand-bright`, `bg-brand-soft`, `bg-brand-tint`
- Surfaces: `bg-canvas`, `bg-surface`, `bg-surface-raised`, `bg-surface-blue`, `bg-surface-dark*`
- Text ramp: `text-ink`, `text-charcoal`, `text-slate`, `text-steel`, `text-stone`
- Semantic: `text-success` / `bg-success-soft`, `warning`, `danger` (+ `-soft`)
- Hairlines: `border-hairline`, `border-hairline-strong`
- Radius: `rounded-md` = 6px (controls), `rounded-lg` = 10px (cards). **No pills** — `rounded-full`
  is for 6px status dots only.

## Light (cream) mode

The chrome is navy by default. To render any subtree in Foundry's cream light mode — e.g. a
tool's output/preview surface — wrap it in `.foundry-light`:

```tsx
<div className="foundry-light">
  {/* cream #FAFAF9 canvas, white cards, dark ink — all shared tokens flip */}
</div>
```

## Signature components (in `foundry-theme.css`)

The numbered **widget card** is the Foundry brand signature — open every panel with it:

```html
<section class="widget-card">
  <header class="widget-header">
    <span class="widget-header-name">01 // WIDGET NAME</span>  <!-- mono, uppercase -->
    <span class="widget-header-status">LIVE</span>            <!-- optional chip -->
  </header>
  <div class="widget-body">
    <span class="widget-stat">7,842</span> <span class="data-label">steps</span>
  </div>
</section>
```

Also available: `.foundry-btn` + `-primary` / `-secondary` / `-ghost` / `-danger`;
`.foundry-badge` + `-blue` / `-green` / `-amber` / `-red` / `-neutral`;
`.status-dot` + `-success` / `-warning` / `-danger` / `-brand`;
`.data-label`, `.timestamp`, `.widget-stat`.

## Rules of thumb (from DESIGN.md)

- Every panel opens with `01 // NAME` in mono — number sequentially per view. It IS the brand.
- Stat figures → DM Serif Display. Data/unit labels & timestamps → JetBrains Mono. Never Inter.
- Only the blue family + semantic (success/warning/danger) colours. No new hues.
- 6px controls, 10px cards, no pills. Hairline borders, no drop shadows on flat cards.

## Preview

```bash
pnpm --dir toolcraft-app exec vite   # or: cd toolcraft-app && pnpm dev
```

A `toolcraft` launch config (port 5177) is registered in `../.claude/launch.json`.
