/**
 * Flatten a translucent colour onto an opaque background, so a gradient can be written with NO
 * alpha at all.
 *
 * Why this exists: a CSS gradient containing alpha becomes a **transparency group with a soft
 * mask** when Chrome exports the page to PDF. Every PDF renderer composites those differently,
 * and some get them badly wrong — the same file showed the cover's navy correctly in Slack's
 * server-generated thumbnail and as a flat magenta wash in Slack's in-app PDF.js viewer. Nothing
 * was baked wrong at export; two renderers simply disagreed about the same soft mask.
 *
 * Matching the gradient's endpoints on one RGB (an earlier fix) solves INTERPOLATION but not
 * this: the alpha is still there, so the transparency group is still there. Pre-blending removes
 * the alpha, which removes the group, which removes the disagreement. An opaque gradient is the
 * one thing every renderer has to agree on.
 *
 * Pure, so it is unit-testable and can run on either side.
 */

/** `#rgb` / `#rrggbb` → `[r, g, b]`. Returns null for anything else rather than guessing. */
export function parseHex(hex: string): [number, number, number] | null {
  const value = hex.trim().replace(/^#/, "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * The opaque colour that `rgba(...alpha)` produces when painted over `background`.
 *
 * Standard source-over: `result = fg × a + bg × (1 − a)`. Rounded to whole channels, because the
 * output is a hex literal.
 */
export function blendOver(
  foreground: [number, number, number],
  alpha: number,
  background: string,
): string {
  const bg = parseHex(background);
  // No sensible blend without a known background — return the foreground opaque rather than
  // silently producing black, which would be a visible bug rather than a subtle one.
  if (!bg) return rgbToHex(foreground);

  const a = Math.min(1, Math.max(0, alpha));
  const mix = foreground.map((channel, i) =>
    Math.round(channel * a + bg[i] * (1 - a)),
  ) as [number, number, number];

  return rgbToHex(mix);
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.min(255, Math.max(0, c)).toString(16).padStart(2, "0")).join("")}`;
}
