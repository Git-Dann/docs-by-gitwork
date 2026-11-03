# Third-party UI components

UI components vendored into Foundry from other projects. Each entry names the source, the files it
landed in, what was changed, and the licence text, which must travel with the code. MIT requires the
notice to stay with every copy, so **do not delete a licence block while its files are in the tree.**
Which components and why: `docs/easyui-adoption.md`.

When you vendor something new: put it in its own folder under `src/components/ui/<project>/`, give
every file a header naming the upstream path and licence and listing what Foundry changed, and add
its row below.

---

## EasyUI

- **Source:** https://github.com/Surajmaurya1/easyui · docs at https://easyui.site/components
- **Licence:** MIT (full text below, copied verbatim from the repo's `LICENSE`)

| Component | Upstream file | Foundry file |
|---|---|---|
| Command Menu | `src/components/ui/CommandMenu.tsx` (+ `springSnappy` from `src/lib/motion-tokens.ts`) | `src/components/ui/easyui/command-menu.tsx` |
| Undo Toast | `src/components/ui/UndoToast.tsx` (+ `springSnappy` from `src/lib/motion-tokens.ts`) | `src/components/ui/easyui/undo-toast.tsx` |
| Funnel Chart | `src/components/ui/FunnelChart.tsx` | `src/components/ui/easyui/funnel-chart.tsx` |
| Activity Heatmap | `src/components/ui/ActivityHeatmap.tsx` | `src/components/ui/easyui/activity-heatmap.tsx` |
| Chart primitives | `src/lib/chart-primitives.tsx` (the parts the charts use) + `pctText` from `src/lib/dashboard-chart-utils.ts` | `src/components/ui/easyui/chart-primitives.tsx` |
| Calendar | `src/components/ui/calendar.tsx` | `src/components/ui/easyui/calendar.tsx` |
| Date Picker | `src/components/ui/date-picker.tsx` | `src/components/ui/easyui/date-picker.tsx` |
| Animated File Upload | `src/components/ui/AnimatedFileUpload.tsx` (+ `springSnappy`, `springGentle` from `src/lib/motion-tokens.ts`) | `src/components/ui/easyui/animated-file-upload.tsx` |
| Product Tour | `src/components/ui/ProductTour.tsx` | `src/components/ui/easyui/product-tour.tsx` |

**Changes made for Foundry, for every component:** imports (`cn` from `@/lib/format`, Heroicons in
place of lucide), colours mapped to Foundry tokens so it works in light and dark mode (EasyUI is dark
only), accessibility where it was missing, and `prefers-reduced-motion` support. Layout, shapes and
motion are upstream's. The header comment in each Foundry file lists that file's own changes.

**Undo Toast.** The countdown's pause maths is corrected, "Restored" shows only once an async undo
succeeds, and a `stacked` mode lets `ToastProvider` (`src/components/ui/toast.tsx`) stack it.

**Charts.** Number and date formatting is en-GB. The funnel shows "+N%" when a stage is *larger*
than the one before (upstream prints "−N%" either way), omits "Biggest drop" when nothing dropped,
and takes its gradient ids from `useId` so two funnels on one page don't share `<defs>`.
⚠️ The funnel's bridges keep upstream's vertical SVG gradient. DESIGN.md says no gradients; this one
is kept on purpose because the bridge shape *is* the design being adopted.

**Calendar and Date Picker.** Weeks start on Monday, a Today/Clear footer is added, the popover is
anchored and portalled (Headless UI) so cards and dialogs can't clip it, and Escape closes only the
calendar, not the dialog around it. EasyUI's 8px and 12px radii are kept, an exception to DESIGN.md.

**Animated File Upload.** `uploadHandler` is required (upstream falls back to a simulated upload
with a random timer, which would show "Ready" for a file that never left the page). Added
`removeCompletedAfterMs` and `onFileRemoved`, a polite live region and an accessible name on the
drop zone. Reduced motion keeps the progress bar (it carries information) and drops the rest.
`uploadWithProgress` beside it does the real upload with progress and Foundry's view-as headers.
Used for HR documents, task screenshots and the new-document wizard; not on Launchpad rows, where
a drop zone per requirement would swamp the list. EasyUI's 12px radius is kept.

**Product Tour.** The spotlight, springs, docked phone card and keyboard handling are upstream's.
Next uses the primary button's colours in both themes (white on Foundry's dark-mode blue fails contrast), the
step slide also snaps under reduced motion, the dialog's name is a `label` prop, and an empty tour
renders nothing. The demo and its lucide icon are not vendored. EasyUI's 16px card radius is kept.
Used for the first-visit Staff tour for HR.

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

---

## Lottie player and animation files

- **lottie-web** `5.13.0` (Airbnb, MIT). This is an npm dependency, not vendored. Only its light
  build (`lottie-web/build/player/lottie_light`) is imported, and only by
  `src/components/ui/motion/lottie.tsx`, which loads it lazily (docs/motion.md).
- **`public/motion/bat.json`** is the "Bat - Halloween" Lottie supplied by Dan in October 2026,
  exported from LottieFiles (AE plugin). Only its comp name was changed; the colour is set at
  runtime.
- **`public/motion/spider.webp`** is the sprite taken from the supplied `animation_spider.json`,
  resized to 120×248. ⚠️ The artwork is **Spider-Man**, a Marvel character. It is used only in the
  internal Halloween theme, never on public pages, and is replaceable with any sprite of the same
  shape.
