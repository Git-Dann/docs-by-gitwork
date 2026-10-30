# Motion library

Every shared piece of motion in Foundry, in one place. The code lives in
`src/components/ui/motion/`; you can see each piece move in **Settings → Labs → Motion library**,
which shows a live example and the import for each.

**Before you hand-roll an animation, check here.** An October 2026 audit found 13 copies of the
same spinner, about 73 copies of the same skeleton block, and four drawers that slid in four
different ways. That's the drift this library exists to stop.

Timings and easing are in DESIGN.md § Motion. This page covers **which component to use**.

---

## The pieces

| Piece | File | Use it for |
|---|---|---|
| `Spinner` | `ui/motion/spinner.tsx` | Something is happening now and will finish soon. `size` xs/sm/md/lg, `tone` current/brand/muted/inverse. `<Button loading>` draws this one. |
| `LoadingState` | `ui/motion/loading-state.tsx` | A panel waiting on data whose shape you can't sensibly draw. A spinner plus "Loading X…", announced once as a polite status. |
| `Skeleton` + presets | `ui/motion/skeleton.tsx` | Lists, cards and widgets whose shape you know. `SkeletonWidget`, `SkeletonBlock`, `SkeletonCards`, `SkeletonRows`; the bare `Skeleton` for anything else. |
| `StatusDot` | `ui/motion/status-dot.tsx` | A coloured dot beside a status word. `pulse` means working on it; `ping` means look at this. |
| `FadeIn` | `ui/motion/fade-in.tsx` | A step, a tab or a result arriving. Key it to replay. |
| Sheet entrance | `globals.css`: `motion-backdrop-in`, `motion-sheet-right`, `motion-sheet-up` | Side drawers and bottom sheets. Two classes, no component. |
| `useCountUp` | `ui/motion/use-count-up.ts` | A score or total that has just arrived. `countUpValue` is the pure curve. |
| `Lottie` | `ui/motion/lottie.tsx` | Illustration with real motion in it. The only Lottie player; see below. |
| Toasts | `ui/toast.tsx` (+ EasyUI `undo-toast`) | Confirming something you just did. `toast.undo()` for reversible actions. |
| Animated file upload | `ui/easyui/animated-file-upload.tsx` | Uploads people watch: drop zone plus per-file progress. |
| Product tour | `ui/easyui/product-tour.tsx` | A first-visit walk-through (Staff uses it). |
| Command menu, calendar, date picker, charts | `ui/easyui/*` | See `docs/easyui-adoption.md`. |

## Rules

1. **Reduced motion is already handled for CSS.** `layout.tsx` stops every CSS animation and
   transition for people who ask for less motion, so `animate-spin`, `animate-pulse`, the sheet
   classes and `FadeIn` all go still on their own. **JavaScript-driven motion is not covered.**
   That means framer-motion, `requestAnimationFrame` and Lottie. Each of those must check for
   itself: `useReducedMotion()` from framer-motion, or `prefersReducedMotion()` from
   `use-count-up.ts`.
2. **Decorative motion is hidden from screen readers.** Every piece here is `aria-hidden` unless you
   give it a `label`. Give it one only when the motion carries meaning nothing else on screen says.
3. **Pings are rare.** A page of pings is a page where nothing stands out. Keep them for alerts.
4. **Never hand-roll a spinner inside a `Button`.** Pass `loading`.
5. **A skeleton should look like what replaces it.** If you can't guess the shape, use a
   `LoadingState`.

## Lottie

`<Lottie src="/motion/<name>.json" />` plays a Lottie file. Put the file in `public/motion/`.

- **Nothing loads until it mounts.** lottie-web's light build (about 45KB gzipped, SVG renderer
  only) and the JSON are both fetched the first time a player mounts. Neither is in any page's
  bundle. Each file is fetched once and shared, so five bats cost one request.
- **It stops when no one can see it.** It pauses off-screen and in a background tab, and is
  destroyed on unmount. Reduced motion shows one still frame (`stillFrame`).
- **`color` recolours a file in place.** It replaces every static solid fill and stroke, so a black
  silhouette can sit on a dark ground without editing the file. Animated colours are left alone.
- **A broken file shows nothing and logs once.** It never throws into the page.
- **Expressions aren't supported**, because the light build has no expression engine. Bake
  expressions in After Effects before exporting, or check the file in the Labs gallery first.

## Seasonal

The Halloween theme (`src/components/seasonal/`) uses the library:

- **Bats:** `public/motion/bat.json`, recoloured `#2B2550` with a violet rim glow
  (`.halloween-bat-glow`) so the silhouette reads on the midnight ground.
- **Spider** (`halloween-spider.tsx`): it peeks from the top-right corner, dips on hover, and drops
  on its thread when clicked. It bounces, sways, then climbs back by itself after five seconds.
  It is a framer-motion spring rather than the supplied Lottie's timeline, because that file
  moved the spider nine units in a 32-unit frame, which is too small to read as a drop. The art is
  the sprite from that file (`public/motion/spider.webp`).

  It must not break anything:
  - It shows on desktop only, and only on pages with the header band. It hangs in the band's 32px
    right gutter, so peeking covers nothing.
  - Only the spider itself takes clicks.
  - It sits below dialogs.
  - Repeated clicks just retarget the spring, and unmounting clears its timer.
  - `halloween-spider.test.tsx` covers all of this.
  - ⚠️ The art is **Spider-Man**, a Marvel character. That's why it isn't mounted on the public
    `/demo` pages. Swapping it out means replacing one image.
