# Third-party UI components

UI source vendored into Foundry from other projects. Each entry names where the code came
from, which files it lives in here, what Foundry changed, and the licence it was taken
under. The licence text must travel with the code — do not remove an entry while any of its
files remain in `src/`.

---

## EasyUI

- **Source:** https://github.com/Surajmaurya1/easyui (site: https://easyui.site/components)
- **Licence:** MIT

### Calendar and Date Picker

- **Upstream files:** `src/components/ui/calendar.tsx`, `src/components/ui/date-picker.tsx`
  at commit `7c106d4a195f9ce566ffbbc672fc48bed68d30bd`
- **Vendored to:** `src/components/ui/easyui/calendar.tsx`, `src/components/ui/easyui/date-picker.tsx`
- **Foundry adapter (use this):** `src/components/ui/date-picker.tsx` — `YYYY-MM-DD` string
  contract, Monday-first weeks, Today / Clear footer, `required` / `name` form mirror.
- **Foundry changes:** `cn` from `@/lib/format`; Heroicons instead of lucide-react; colours
  mapped to Foundry tokens so both light and dark mode work, selection in Foundry brand blue;
  popover anchored and portalled with Headless UI (so scrollers and `.widget-card` can't clip
  it) and Escape caught before an enclosing `<Modal>`; trigger 36px to match `app-input`,
  16px text below `sm`; `MotionConfig reducedMotion="user"`; an `autoFocus` option on the
  calendar. Layout, the gliding selected-day pill, the month slide, the popover spring and the
  range preview are unchanged.

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
