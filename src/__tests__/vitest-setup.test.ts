// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Guards `vitest.setup.ts`, which supplies the layout APIs jsdom omits.
//
// Without it, ProseMirror's `focus()` → `scrollToSelection` → `coordsAtPos`
// path throws `target.getClientRects is not a function`. That escapes as an
// UNHANDLED async error rather than a test failure, so it is attributed to
// whichever test is in flight — it failed two unrelated test FILES in one run
// and none in the next six. Vitest's own words: "Vitest caught 2 unhandled
// errors during the test run. This might cause false positive tests."
//
// ⚠️ HONEST LIMIT: the flake itself is rare — observed twice, then not once in
// twelve `--sequence.shuffle` runs with the fix REMOVED. So this does not prove
// the flake is gone; twelve quiet runs prove nothing either way. What is proven
// deterministically is the mechanism and the remedy: jsdom really does report
// `getClientRects: undefined`, ProseMirror really does call it, and the setup
// really does supply it. These assertions fail immediately if the setup file is
// dropped or stops loading, which is what they are for.
// ─────────────────────────────────────────────────────────────────────────────

describe("jsdom layout stubs", () => {
  it("supplies the Range APIs jsdom does not implement", () => {
    const range = document.createRange();
    expect(typeof range.getClientRects, "jsdom leaves this undefined").toBe("function");
    expect(typeof range.getBoundingClientRect).toBe("function");
  });

  it("answers in the shape ProseMirror reads", () => {
    // `singleRect` indexes `rects[0]` and reads `.top`/`.left`, then falls back
    // to `getBoundingClientRect()`. Both have to answer for the scroll path to
    // complete instead of throwing.
    const range = document.createRange();
    const rects = range.getClientRects();
    expect(rects.length).toBe(1);
    expect(rects[0]).toBeDefined();
    expect(typeof rects[0].top).toBe("number");
    expect(typeof range.getBoundingClientRect().left).toBe("number");
  });

  it("reports zero geometry rather than inventing any", () => {
    // jsdom lays nothing out, so every element genuinely has no geometry. The
    // stub says so truthfully. Nothing in this suite asserts on layout —
    // geometry is checked by `audit:clipping` against a real engine.
    const rect = document.createRange().getBoundingClientRect();
    expect([rect.width, rect.height, rect.top, rect.left]).toEqual([0, 0, 0, 0]);
  });
});
