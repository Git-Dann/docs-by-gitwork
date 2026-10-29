# Third-party UI components

UI components vendored into Foundry from other projects. Each entry names the source, the
files it landed in, what was changed, and the licence text, which must travel with the code.
Which components and why: `docs/easyui-adoption.md`.

---

## EasyUI

- **Source:** https://github.com/Surajmaurya1/easyui · docs at https://easyui.site/components
- **Licence:** MIT (full text below)

| Component | Upstream file | Foundry file |
|---|---|---|
| Command Menu | `src/components/ui/CommandMenu.tsx` (+ `springSnappy` from `src/lib/motion-tokens.ts`) | `src/components/ui/easyui/command-menu.tsx` |
| Undo Toast | `src/components/ui/UndoToast.tsx` (+ `springSnappy` from `src/lib/motion-tokens.ts`) | `src/components/ui/easyui/undo-toast.tsx` |

**Changes made for Foundry, for every component:** imports (`cn` from `@/lib/format`, Heroicons in
place of lucide), colours mapped to Foundry tokens so it works in light and dark mode, accessibility
where it was missing, and `prefers-reduced-motion` support. The header comment in each Foundry file
lists that file's own changes (for example the Undo Toast's corrected pause maths and its `stacked`
mode for `ToastProvider`, and the Command Menu's focus trap and focus restore).

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
