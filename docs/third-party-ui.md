# Third-party UI components

UI source vendored into this repo from other projects, with the licence each one ships under.
MIT requires the copyright notice and permission notice to travel with every copy, so **do not
delete a licence block here while its files are still in the tree.**

When you vendor something new: put it in its own folder under `src/components/ui/<project>/`,
give every file a header naming the upstream path and licence and listing exactly what Foundry
changed, and add a section below with the licence text copied verbatim.

---

## EasyUI

- **Upstream:** https://github.com/Surajmaurya1/easyui · docs at https://easyui.site/components
- **Licence:** MIT (text below, copied verbatim from the repo's `LICENSE`)
- **Vendored:** October 2026

| Foundry file | Upstream file |
|---|---|
| `src/components/ui/easyui/funnel-chart.tsx` | `src/components/ui/FunnelChart.tsx` |
| `src/components/ui/easyui/activity-heatmap.tsx` | `src/components/ui/ActivityHeatmap.tsx` |
| `src/components/ui/easyui/chart-primitives.tsx` | `src/lib/chart-primitives.tsx` (the parts those two use) + `pctText` from `src/lib/dashboard-chart-utils.ts` |

**What Foundry changed, and why.** Layout, shapes, bridges, loss chips, summary lines, motion
and interaction are upstream's. The changes are limited to what Foundry needs:

- **Colours are Foundry tokens.** Upstream uses fixed neutral / white / black values and
  Tailwind `dark:` variants, and is tuned for a dark page. Foundry's dark mode is a
  `data-theme` attribute and its palette is the `--text-*` / `--surface-*` / `--border-*` /
  `--brand-*` tokens, so every colour was mapped to a token. The funnel's per-stage ramp and the
  heatmap's ramp run along the brand blue scale instead of indigo→teal / emerald; the loss red is
  `--danger-500`. Both read correctly on cream (light) and navy (dark).
- **Imports** point at Foundry's copy of the primitives; `cx` is Foundry's `cn`.
- **Locale** is en-GB for numbers and dates.
- **Honesty fix in the funnel:** a stage *larger* than the one before shows "+N%"; upstream
  prints "−N%" either way. "Biggest drop" is omitted when nothing dropped (upstream: "−0%").
- **Focus:** the app's global `:focus-visible` outline is switched off inline on each chart's SVG
  so only the component's own focus ring shows.
- **Funnel gradient ids** come from `useId` so two funnels on one page don't share `<defs>`.

`prefers-reduced-motion` is honoured exactly as upstream (framer-motion's `useReducedMotion`,
plus the heatmap's own media query).

⚠️ The funnel's bridges use a vertical SVG gradient fill. DESIGN.md says no gradients; this one
is kept on purpose because the bridge shape *is* the design being adopted.

### Licence

```
MIT License

Copyright (c) 2026 Suraj Maurya

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
