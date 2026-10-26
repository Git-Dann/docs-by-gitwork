import { describe, expect, it } from "vitest";
import {
  compositeBackground,
  contrastFailures,
  contrastRatio,
  evaluateContrast,
  evaluateRenderedA11y,
  evaluateTargets,
  evaluateWalk,
  hasFocusIndicator,
  parseColor,
  RENDERED_A11Y_KEYS,
  renderedA11yUnavailable,
  targetSizeFailures,
  unreachedControls,
  walkState,
  type ContrastSample,
  type InventoryItem,
  type RenderedA11yObservation,
  type TargetItem,
  type WalkObservation,
} from "../rendered-a11y";
import { CHECKS_REGISTRY } from "@/server/checks-registry";
import { CHECK_RELEVANCE, WITHHELD } from "../check-relevance-data";

const ref = (text: string, tag = "a") => ({ selector: `${tag}.${text.replace(/\W/g, "")}`, text, tag });
const inv = (n: number): InventoryItem[] =>
  Array.from({ length: n }, (_, i) => ({ i, ref: ref(`c${i}`), positiveTabindex: false, radioGroup: null }));

describe("colour maths", () => {
  it("matches published WCAG ratios", () => {
    const black = parseColor("rgb(0, 0, 0)")!;
    const white = parseColor("rgb(255, 255, 255)")!;
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    // #767676 on white is the classic 4.54:1 pass; #777777 the 4.48:1 fail.
    expect(contrastRatio(parseColor("rgb(118, 118, 118)")!, white)).toBeCloseTo(4.54, 2);
    expect(contrastRatio(parseColor("rgb(119, 119, 119)")!, white)).toBeCloseTo(4.48, 2);
  });

  it("composites translucent layers down to the first opaque one", () => {
    // 50% black over white is mid grey; anything below the white is hidden.
    const bg = compositeBackground(["rgba(0, 0, 0, 0.5)", "rgb(255, 255, 255)", "rgb(255, 0, 0)"])!;
    expect(Math.round(bg.r)).toBe(128);
    expect(Math.round(bg.g)).toBe(128);
    // No opaque layer at all: the white canvas.
    expect(compositeBackground(["rgba(0, 0, 0, 0)"])).toMatchObject({ r: 255, g: 255, b: 255 });
  });

  it("refuses a colour it cannot parse rather than guessing", () => {
    expect(parseColor("color(display-p3 1 0 0)")).toBeNull();
    expect(compositeBackground(["oklch(0.5 0.1 200)"])).toBeNull();
  });
});

describe("rendered_text_contrast", () => {
  const sample = (fg: string, layers: string[], fontSizePx = 16, fontWeight = 400): ContrastSample =>
    ({ ref: ref("text", "p"), fg, layers, fontSizePx, fontWeight });

  it("fails grey-on-cream text (the Hacker News pattern) and passes dark-on-white", () => {
    const bad = Array.from({ length: 5 }, () => sample("rgb(130, 130, 130)", ["rgb(246, 246, 239)"]));
    expect(evaluateContrast(bad, 0).status).toBe("FAIL");
    const good = Array.from({ length: 5 }, () => sample("rgb(11, 12, 12)", ["rgb(255, 255, 255)"]));
    expect(evaluateContrast(good, 0).status).toBe("PASS");
  });

  it("applies the 3:1 large-text threshold only to large text", () => {
    // ~3.5:1 — passes as 24px text, fails as 16px text.
    expect(contrastFailures([sample("rgb(130, 130, 130)", ["rgb(255, 255, 255)"], 24)]).failures).toHaveLength(0);
    expect(contrastFailures([sample("rgb(130, 130, 130)", ["rgb(255, 255, 255)"], 18.66, 700)]).failures).toHaveLength(0);
    expect(contrastFailures([sample("rgb(130, 130, 130)", ["rgb(255, 255, 255)"], 16)]).failures).toHaveLength(1);
  });

  it("does not round 4.49 up to a pass", () => {
    // rgb(172,186,208) on rgb(52,75,110) measured 4.497 on the Deque demo.
    const f = contrastFailures([sample("rgb(172, 186, 208)", ["rgb(52, 75, 110)"])]).failures;
    expect(f).toHaveLength(1);
    expect(f[0].ratio).toBe(4.49);
  });

  it("is INCONCLUSIVE, never PASS, on too few measurable samples", () => {
    const two = [sample("rgb(0, 0, 0)", ["rgb(255, 255, 255)"]), sample("rgb(0, 0, 0)", ["rgb(255, 255, 255)"])];
    expect(evaluateContrast(two, 40).status).toBe("INCONCLUSIVE");
  });

  it("is a WARN, not a FAIL, for one or two failing elements", () => {
    const mixed = [
      ...Array.from({ length: 6 }, () => sample("rgb(0, 0, 0)", ["rgb(255, 255, 255)"])),
      sample("rgb(200, 200, 200)", ["rgb(255, 255, 255)"]),
    ];
    expect(evaluateContrast(mixed, 0).status).toBe("WARN");
  });
});

describe("touch_target_size (WCAG 2.5.8)", () => {
  const t = (text: string, x: number, y: number, w: number, h: number, extra: Partial<TargetItem> = {}): TargetItem =>
    ({ ref: ref(text), x, y, w, h, inline: false, uaDefault: false, hitAreaOk: false, ...extra });

  it("fails small targets that crowd each other and passes the same targets spaced apart", () => {
    const crowded = [t("a", 0, 0, 16, 16), t("b", 18, 0, 16, 16), t("c", 36, 0, 16, 16)];
    expect(targetSizeFailures(crowded).failures).toHaveLength(3);
    const spaced = [t("a", 0, 0, 16, 16), t("b", 40, 0, 16, 16), t("c", 80, 0, 16, 16)];
    expect(targetSizeFailures(spaced).failures).toHaveLength(0);
  });

  it("passes 24px targets that touch", () => {
    expect(targetSizeFailures([t("a", 0, 0, 24, 24), t("b", 24, 0, 24, 24)]).failures).toHaveLength(0);
  });

  it("honours the inline, user-agent and padded-hit-area exemptions", () => {
    const base = t("big", 12, 0, 60, 60);
    expect(targetSizeFailures([t("x", 0, 0, 10, 10, { inline: true }), base]).failures).toHaveLength(0);
    expect(targetSizeFailures([t("x", 0, 0, 13, 13, { uaDefault: true }), base]).failures).toHaveLength(0);
    expect(targetSizeFailures([t("x", 0, 0, 10, 10, { hitAreaOk: true }), base]).failures).toHaveLength(0);
    expect(targetSizeFailures([t("x", 0, 0, 10, 10), base]).failures).toHaveLength(1);
  });

  it("treats a target nested in another as one target", () => {
    expect(targetSizeFailures([t("icon", 10, 10, 12, 12), t("button", 0, 0, 40, 40)]).failures).toHaveLength(0);
  });

  it("is INCONCLUSIVE with fewer than three targets", () => {
    expect(evaluateTargets([t("a", 0, 0, 10, 10)], 390).status).toBe("INCONCLUSIVE");
  });
});

describe("focus indicator", () => {
  const sig = (self: string, p1 = "p") => ({ self, p1, before: "-", after: "-" });
  it("counts any visible change, including a :focus-within ring on the parent", () => {
    expect(hasFocusIndicator(sig("none"), sig("auto 1px"))).toBe(true);
    expect(hasFocusIndicator(sig("x", "p"), sig("x", "p ring"))).toBe(true);
  });
  it("reports no indicator when nothing changes, and unknown with no baseline", () => {
    expect(hasFocusIndicator(sig("x"), sig("x"))).toBe(false);
    expect(hasFocusIndicator(null, sig("x"))).toBeNull();
  });
});

describe("the Tab walk", () => {
  it("tells a wrap round the page from a closed loop", () => {
    expect(walkState([0, 1, 2, -1, 0]).state).toBe("wrapped");
    expect(walkState([0, 1, 2, 0])).toEqual({ state: "cycle", cycleFrom: 0 });
    expect(walkState([-1, -1, -1]).state).toBe("stuck");
    // Focus moving inside an iframe leaves the outer active element on the iframe.
    expect(walkState([0, 1, 1, 1]).state).toBe("continue");
  });

  it("judges only the part of the page the walk covered", () => {
    const items = inv(10);
    // Reached 0,1,3 — 2 was skipped; 4..9 were never walked and are not judged.
    expect(unreachedControls(items, [0, 1, 3]).map((x) => x.i)).toEqual([2]);
  });

  it("treats a radio group as one Tab stop", () => {
    const items = inv(4).map((x) => (x.i === 1 || x.i === 2 ? { ...x, radioGroup: "g" } : x));
    expect(unreachedControls(items, [0, 1, 3])).toHaveLength(0);
  });

  const walk = (over: Partial<WalkObservation>): WalkObservation =>
    ({ inventory: inv(4), sequence: [0, 1, 2, 3, -1, 0], mouseOnly: [], cycle: null, focusSamples: [], ...over });
  const byKey = (checks: ReturnType<typeof evaluateWalk>) => Object.fromEntries(checks.map((c) => [c.checkKey, c]));

  it("fails a trap that Escape does not release, and does not call a modal a trap", () => {
    const trapped = byKey(evaluateWalk(walk({ sequence: [0, 1, 0], cycle: { members: [0, 1], inDialog: false, escapeReleased: false } })));
    expect(trapped.rendered_no_keyboard_trap.status).toBe("FAIL");
    const modal = byKey(evaluateWalk(walk({ sequence: [0, 1, 0], cycle: { members: [0, 1], inDialog: true, escapeReleased: false } })));
    expect(modal.rendered_no_keyboard_trap.status).toBe("INCONCLUSIVE");
    expect(modal.rendered_keyboard_reachable.status).toBe("INCONCLUSIVE");
  });

  it("fails a role=button with no tabindex and passes a fully reachable page", () => {
    expect(byKey(evaluateWalk(walk({ mouseOnly: [ref("Menu", "div")] }))).rendered_keyboard_reachable.status).toBe("FAIL");
    expect(byKey(evaluateWalk(walk({}))).rendered_keyboard_reachable.status).toBe("PASS");
    expect(byKey(evaluateWalk(walk({ sequence: [0, 2, 3, -1, 0] }))).rendered_keyboard_reachable.status).toBe("WARN");
  });

  it("is INCONCLUSIVE when Tab never reached the page", () => {
    const c = byKey(evaluateWalk(walk({ sequence: [-1, -1, -1] })));
    expect(c.rendered_keyboard_reachable.status).toBe("INCONCLUSIVE");
    expect(c.rendered_no_keyboard_trap.status).toBe("INCONCLUSIVE");
  });

  it("does not judge an iframe's focus ring, which is drawn inside the frame", () => {
    const s = { selfA: "x" };
    const c = byKey(evaluateWalk(walk({
      focusSamples: [{ i: 0, ref: ref("frame", "iframe"), before: s, after: s, obscured: false }],
    })));
    expect(c.rendered_focus_visible.status).toBe("INCONCLUSIVE");
  });
});

describe("the family as a whole", () => {
  it("is all INCONCLUSIVE when no browser ran — never a PASS", () => {
    const rows = renderedA11yUnavailable("the browser did not start.");
    expect(rows.map((r) => r.checkKey).sort()).toEqual([...RENDERED_A11Y_KEYS].sort());
    expect(rows.every((r) => r.status === "INCONCLUSIVE")).toBe(true);
  });

  it("is all INCONCLUSIVE when the page rendered nothing", () => {
    const empty: RenderedA11yObservation = {
      url: "https://x.test", renderedWords: 0, walk: { inventory: [], sequence: [-1, -1, -1], mouseOnly: [], cycle: null, focusSamples: [] },
      contrast: { samples: [], unmeasurable: 0 }, targets: { viewportWidth: 390, items: [] }, skipLink: null, stepErrors: {},
    };
    expect(evaluateRenderedA11y(empty).every((r) => r.status === "INCONCLUSIVE")).toBe(true);
  });

  it("is registered, has a relevance rule, and touch_target_size is no longer withheld", () => {
    const keys = new Set(CHECKS_REGISTRY.map((c) => c.key));
    for (const k of RENDERED_A11Y_KEYS) {
      expect(keys.has(k)).toBe(true);
      expect(CHECK_RELEVANCE[k]?.surface).toBe("WEB_PAGE");
      expect(WITHHELD[k]).toBeUndefined();
    }
  });
});
