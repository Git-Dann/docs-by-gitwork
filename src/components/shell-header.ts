/**
 * The top band: the one place its geometry is written down.
 *
 * ── Why this module exists ───────────────────────────────────────────────────────────────────
 * The sidebar's brand cell and the page header are two separate elements that have to read as
 * ONE band across the top of the app: their bottom hairlines must land on the same pixel. They
 * are NOT in a shared grid row — the rail spans full height and carries its own brand block — so
 * nothing enforces that structurally. §40.2 records them drifting 48.6px apart when the logo
 * shrank, and fixed it by having both sides read one constant.
 *
 * That constant lived inside `app-shell.tsx`, where the DEMO shell could not reach it — and
 * `demo-shell.tsx` is a second copy of the same header, used by all 16 public sales demos and the
 * white-label `/demo/[client]` pages. So it never got the fix: measured at 1440 it was a **130px
 * band with a 44px title** while the app had an 80px band with a 28px one, and its own two sides
 * were **78px out of true** (brand cell bottom 97px, header bottom 175px). Every screenshot taken
 * on a demo page to verify an app page was therefore of a different header.
 *
 * Both shells import these now, so the two cannot drift again without someone editing this file.
 */

/** The band's height. Both the brand cell and the page header read it. */
export const HEADER_BAND_H = "h-20";

/**
 * The header's own minimum height, rather than a fixed one.
 *
 * ⚠️ The title TRUNCATES rather than wrapping, so the band cannot grow and knock the two hairlines
 * out of step again — but it carries `title=` so the full text is recoverable on hover. Ellipsed
 * text with no title and no scroll is what `audit:clipping` calls a TRUNCATED defect, and rightly:
 * that is information the reader can no longer get to.
 */
export const HEADER_BAND_MIN = "min-h-20";

/** The page title. 28px, not the 44px the demo shell kept — see the note above. */
export const HEADER_TITLE_CLASS =
  "truncate text-[28px] font-normal leading-[1.15] tracking-[-0.02em] text-[var(--text-1)]";

/** The one line under it. */
export const HEADER_SUBTITLE_CLASS = "mt-0.5 truncate text-[13px] leading-5 text-[var(--text-3)]";

/** The band's own frame: gradient, hairline, padding, and the `lg:` reveal both shells share. */
export const HEADER_BAND_CLASS =
  "halloween-clear hidden border-b border-[var(--border-2)] " +
  "bg-[linear-gradient(180deg,var(--surface-0)_0%,var(--surface-brand-soft)_100%)] " +
  "px-6 py-3 sm:px-8 lg:flex lg:items-center";
