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
| Calendar | `src/components/ui/calendar.tsx` | `src/components/ui/easyui/calendar.tsx` |
| Date Picker | `src/components/ui/date-picker.tsx` | `src/components/ui/easyui/date-picker.tsx` |

**Changes made for Foundry, for every component:** imports (`cn` from `@/lib/format`, Heroicons in
place of lucide), colours mapped to Foundry tokens so it works in light and dark mode (EasyUI is dark
only), accessibility where it was missing, and `prefers-reduced-motion` support. Layout, shapes and
motion are upstream's. The header comment in each Foundry file lists that file's own changes.

**Undo Toast.** The countdown's pause maths is corrected, "Restored" shows only once an async undo
succeeds, and a `stacked` mode lets `ToastProvider` (`src/components/ui/toast.tsx`) stack it.

**Calendar and Date Picker.** Weeks start on Monday, a Today/Clear footer is added, the popover is
anchored and portalled (Headless UI) so cards and dialogs can't clip it, and Escape closes only the
calendar, not the dialog around it. EasyUI's 8px and 12px radii are kept, an exception to DESIGN.md.

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
