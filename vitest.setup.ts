// Test setup shared by every file. Runs in whichever environment the file
// declares, so anything DOM-shaped is guarded rather than assumed.

/**
 * jsdom does not implement layout, so `getClientRects` / `getBoundingClientRect`
 * are missing on `Range`. ProseMirror calls them from `scrollToSelection` on
 * `focus()`, and the resulting `TypeError: target.getClientRects is not a
 * function` escapes as an UNHANDLED async error rather than a test failure.
 *
 * ⚠️ That is why this matters more than a tidy console. An unhandled async
 * error is attributed to whichever test happens to be in flight when it lands,
 * so it took down two unrelated test FILES in one run and none in the next six.
 * Vitest says so itself — "Vitest caught 2 unhandled errors during the test
 * run. This might cause false positive tests." A flaky suite is a gate nobody
 * trusts, which is the opposite of what this repo's checks exist to provide.
 *
 * Reproduced at roughly 1 run in 6 under `vitest --sequence.shuffle`, which is
 * the tool for this class of bug: it only appears when a preceding test leaves
 * a selection that makes ProseMirror take the scroll path.
 *
 * A zero-sized rect is the honest stub. jsdom lays nothing out, so every
 * element genuinely has no geometry — this reports that truthfully instead of
 * throwing. It does NOT make layout assertions meaningful, and nothing here
 * asserts on geometry; the browser-driven audits (`audit:clipping`) are where
 * geometry is checked, against a real engine.
 */
if (typeof Range !== "undefined" && typeof Range.prototype.getClientRects !== "function") {
  const zeroRect = (): DOMRect => ({
    x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0,
    toJSON: () => ({}),
  }) as DOMRect;

  // ProseMirror's `singleRect` reads `rects[0]` and falls back to
  // `getBoundingClientRect()`, so both have to answer for the scroll path to
  // complete rather than throw.
  Range.prototype.getClientRects = function getClientRects() {
    const rect = zeroRect();
    return Object.assign([rect], {
      length: 1,
      item: (index: number) => (index === 0 ? rect : null),
      [Symbol.iterator]: [rect][Symbol.iterator].bind([rect]),
    }) as unknown as DOMRectList;
  };
  Range.prototype.getBoundingClientRect = zeroRect;
}
