// ─────────────────────────────────────────────────────────────────────────────
// RENDERED-PAGE ACCESSIBILITY — the verdicts.
//
// Pulse's static WCAG family reads HTML text, and some questions cannot be
// answered from text at all: how large a control is drawn, whether Tab reaches
// it, whether focus shows, what colour the text is painted on. Those were either
// withheld (touch_target_size) or answered by keyword (§58.5). This family is
// measured on the page as Chromium renders it, by rendered-a11y-agent.ts.
//
// Split on purpose: the agent only COLLECTS raw observations (colours as the
// browser computed them, element boxes, the Tab sequence, style signatures before
// and after focus). Every judgement — compositing, contrast ratios, the WCAG 2.5.8
// spacing exception, what counts as a focus indicator, whether the Tab walk
// cycled — is a pure function here, tested without a browser.
//
// The honesty rules (CLAUDE.md §35, §44, §58):
//   - no browser, no page, or too little to measure → INCONCLUSIVE, never PASS;
//   - a pattern the measurement cannot see (an "equivalent" target elsewhere, a
//     sibling that shows focus) is why the softer verdicts exist: WARN for a
//     handful, FAIL only past a threshold, and the evidence names each element.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";

/** The keys this family emits. touch_target_size is the existing (once withheld) key. */
export const RENDERED_A11Y_KEYS = [
  "rendered_keyboard_reachable",
  "rendered_no_keyboard_trap",
  "rendered_focus_visible",
  "rendered_focus_not_obscured",
  "rendered_text_contrast",
  "touch_target_size",
  "rendered_skip_link_works",
] as const;
export type RenderedA11yKey = (typeof RENDERED_A11Y_KEYS)[number];

export const RENDERED_A11Y_LABELS: Record<RenderedA11yKey, string> = {
  rendered_keyboard_reachable: "Every visible control can be reached with Tab",
  rendered_no_keyboard_trap: "Keyboard focus is never trapped",
  rendered_focus_visible: "Focused controls show a visible focus indicator",
  rendered_focus_not_obscured: "Focused controls are not hidden behind other content",
  rendered_text_contrast: "Text meets WCAG AA contrast on the rendered page",
  touch_target_size: "Sufficient touch target sizing",
  rendered_skip_link_works: "Skip link moves focus to the main content",
};

// ── Raw observations (what the agent collects) ───────────────────────────────

export interface ElementRef {
  /** A short CSS path a developer can paste into DevTools. */
  selector: string;
  /** The control's name or text, trimmed. */
  text: string;
  tag: string;
}

export interface InventoryItem {
  /** Index in document order. */
  i: number;
  ref: ElementRef;
  /** tabindex > 0: visited out of document order by design. */
  positiveTabindex: boolean;
  /** Radio buttons are ONE tab stop per group. */
  radioGroup: string | null;
}

/** Visual style signature per part (self, ancestors, children, pseudo-elements). */
export type StyleSignature = Record<string, string>;

export interface FocusSample {
  i: number;
  ref: ElementRef;
  before: StyleSignature | null;
  after: StyleSignature;
  /** null: the element could not be placed on screen to test. */
  obscured: boolean | null;
}

export interface WalkObservation {
  inventory: InventoryItem[];
  /** Inventory index per Tab press; -1 = document/body (end of the page), -2 = not inventoried. */
  sequence: number[];
  /** Controls with an interactive role and no way to Tab to them. */
  mouseOnly: ElementRef[];
  /** Set when the walk cycled without reaching the end of the page. */
  cycle: { members: number[]; inDialog: boolean; escapeReleased: boolean } | null;
  focusSamples: FocusSample[];
}

export interface ContrastSample {
  ref: ElementRef;
  /** Computed `color`. */
  fg: string;
  /** Background colours from the text downward, as computed. */
  layers: string[];
  fontSizePx: number;
  fontWeight: number;
}

export interface TargetItem {
  ref: ElementRef;
  /** Page coordinates (CSS px) at the mobile viewport. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** A link inside a sentence (WCAG 2.5.8 inline exception). */
  inline: boolean;
  /** A native control the author did not restyle (user-agent exception). */
  uaDefault: boolean;
  /** Probing 12px out from the centre still hits the control (a padded hit area). */
  hitAreaOk: boolean;
}

export interface SkipLinkObservation {
  link: ElementRef;
  /** 1-based position in the Tab order (a cookie banner often comes first). */
  position: number;
  target: string;
  targetExists: boolean;
  /** null: could not be tested (the link navigated away, or activation failed). */
  moved: boolean | null;
}

export interface RenderedA11yObservation {
  url: string;
  /** Visible words on the rendered page — under a handful, nothing rendered. */
  renderedWords: number;
  walk: WalkObservation | null;
  contrast: { samples: ContrastSample[]; unmeasurable: number } | null;
  targets: { viewportWidth: number; items: TargetItem[] } | null;
  /** null: no skip link among the first Tab stops. */
  skipLink: SkipLinkObservation | null;
  /** Measurement steps that threw, by name — their checks are INCONCLUSIVE. */
  stepErrors: Record<string, string>;
}

// ── Colour ───────────────────────────────────────────────────────────────────

export interface Rgba { r: number; g: number; b: number; a: number }

/** Parse a computed CSS colour (rgb/rgba, as getComputedStyle returns). Null for anything else. */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (!m) return null;
  let a = 1;
  if (m[4] !== undefined) a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { r: +m[1], g: +m[2], b: +m[3], a: Math.max(0, Math.min(1, a)) };
}

/** Paint `top` over an opaque `bottom`. */
function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/**
 * Composite background layers (listed from the text downward) into the opaque
 * colour the text is painted on. Below the last layer is the white canvas.
 * Null when a layer cannot be parsed — never a guess.
 */
export function compositeBackground(layers: string[]): Rgba | null {
  const parsed = layers.map(parseColor);
  if (parsed.some((c) => c === null)) return null;
  // Find the first opaque layer from the top; everything below it is hidden.
  let base = WHITE;
  let start = parsed.length - 1;
  for (let k = 0; k < parsed.length; k++) {
    if ((parsed[k] as Rgba).a >= 1) { base = parsed[k] as Rgba; start = k - 1; break; }
  }
  let out = { ...base, a: 1 };
  for (let k = start; k >= 0; k--) out = over(parsed[k] as Rgba, out);
  return out;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(c: Rgba): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG 2.x contrast ratio. A translucent foreground is composited over the background first. */
export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const f = fg.a < 1 ? over(fg, bg) : fg;
  const l1 = relativeLuminance(f);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG large text: 18pt (24px), or 14pt (18.66px) bold. */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
}

const fmt = (c: Rgba) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;

export interface ContrastFailure {
  ref: ElementRef;
  ratio: number;
  required: number;
  fg: string;
  bg: string;
}

export function contrastFailures(samples: ContrastSample[]): { measured: number; failures: ContrastFailure[] } {
  const failures: ContrastFailure[] = [];
  let measured = 0;
  for (const s of samples) {
    const fg = parseColor(s.fg);
    const bg = compositeBackground(s.layers);
    if (!fg || !bg || fg.a === 0) continue;
    measured++;
    const ratio = contrastRatio(fg, bg);
    const required = isLargeText(s.fontSizePx, s.fontWeight) ? 3 : 4.5;
    // Two decimals, as the WCAG tools report: 4.499 is a failure, 4.5 is not.
    const floored = Math.floor(ratio * 100) / 100;
    if (floored < required) {
      failures.push({ ref: s.ref, ratio: floored, required, fg: fmt(fg.a < 1 ? over(fg, bg) : fg), bg: fmt(bg) });
    }
  }
  return { measured, failures };
}

// ── Target size (WCAG 2.5.8, AA: 24 × 24 CSS px, with the spacing exception) ──

export const MIN_TARGET_PX = 24;

function contains(a: TargetItem, b: TargetItem): boolean {
  return a.x <= b.x + 0.5 && a.y <= b.y + 0.5 && a.x + a.w >= b.x + b.w - 0.5 && a.y + a.h >= b.y + b.h - 0.5;
}

function distanceToRect(cx: number, cy: number, r: TargetItem): number {
  const dx = Math.max(r.x - cx, 0, cx - (r.x + r.w));
  const dy = Math.max(r.y - cy, 0, cy - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/**
 * The 2.5.8 test. An undersized target passes when a 24px-diameter circle on its
 * centre intersects no other target and no other undersized target's circle.
 * Inline links and unstyled native controls are exempt by the criterion itself.
 * Nested targets (a button inside a link, an input in its label) are one target.
 */
export function targetSizeFailures(items: TargetItem[]): { measured: number; failures: (TargetItem & { nearest: string | null })[] } {
  const inScope = items.filter((t) => !t.inline && !t.uaDefault && t.w > 0 && t.h > 0);
  const undersized = inScope.filter((t) => (t.w < MIN_TARGET_PX || t.h < MIN_TARGET_PX) && !t.hitAreaOk);
  const failures: (TargetItem & { nearest: string | null })[] = [];
  const r = MIN_TARGET_PX / 2;
  for (const u of undersized) {
    const cx = u.x + u.w / 2;
    const cy = u.y + u.h / 2;
    let clash: TargetItem | null = null;
    for (const other of items) {
      if (other === u || contains(other, u) || contains(u, other)) continue;
      if (other.w <= 0 || other.h <= 0) continue;
      const otherUndersized = undersized.includes(other);
      const hit = otherUndersized
        ? Math.hypot(cx - (other.x + other.w / 2), cy - (other.y + other.h / 2)) < 2 * r
        : distanceToRect(cx, cy, other) < r;
      if (hit) { clash = other; break; }
    }
    if (clash) failures.push({ ...u, nearest: clash.ref.text || clash.ref.selector });
  }
  return { measured: inScope.length, failures };
}

// ── Focus indicator ──────────────────────────────────────────────────────────

/**
 * A focus indicator is any visible style that differs between the control's
 * unfocused and focused state — on the control, its two nearest ancestors
 * (`:focus-within` rings), its first children (an icon that changes colour) or its
 * ::before / ::after. The agent normalises invisible values (an outline colour with
 * no outline) before they reach here, so only a visible change counts.
 * Null when there is no baseline to compare against.
 */
export function hasFocusIndicator(before: StyleSignature | null, after: StyleSignature): boolean | null {
  if (!before) return null;
  for (const key of Object.keys(after)) {
    if (!(key in before)) continue;
    if (before[key] !== after[key]) return true;
  }
  return false;
}

// ── Tab walk ─────────────────────────────────────────────────────────────────

export type WalkState = "continue" | "wrapped" | "cycle" | "stuck";

/**
 * Read the Tab sequence so far. -1 is the document itself: Chromium hands focus to
 * the browser after the last control, so a repeat AFTER a -1 is the page wrapping
 * round — normal. A repeat with no -1 since its first visit means focus is going
 * round a closed loop: a trap, or a modal holding focus as it should.
 * Consecutive repeats are ignored: focus inside an iframe or a closed shadow root
 * leaves the outer document's active element unchanged while it moves.
 */
export function walkState(sequence: number[]): { state: WalkState; cycleFrom?: number } {
  if (sequence.length >= 3 && sequence.slice(0, 3).every((v) => v === -1)) return { state: "stuck" };
  const last = sequence[sequence.length - 1];
  if (last === undefined || last < 0) return { state: "continue" };
  if (sequence.length >= 2 && sequence[sequence.length - 2] === last) return { state: "continue" };
  const first = sequence.indexOf(last);
  if (first === sequence.length - 1) return { state: "continue" };
  const between = sequence.slice(first + 1, sequence.length - 1);
  if (between.includes(-1)) return { state: "wrapped" };
  return { state: "cycle", cycleFrom: first };
}

/**
 * Controls the walk passed without stopping on. Only the part of the page the walk
 * actually covered is judged (document order up to the furthest control reached),
 * so a walk cut short by the step limit never reports the rest as unreachable.
 */
export function unreachedControls(inventory: InventoryItem[], sequence: number[]): InventoryItem[] {
  const visited = new Set(sequence.filter((v) => v >= 0));
  const byIndex = new Map(inventory.map((item) => [item.i, item]));
  let furthest = -1;
  for (const v of visited) {
    const item = byIndex.get(v);
    if (item && !item.positiveTabindex && v > furthest) furthest = v;
  }
  const radioReached = new Set(
    [...visited].map((v) => byIndex.get(v)?.radioGroup).filter((g): g is string => Boolean(g)),
  );
  return inventory.filter((item) =>
    item.i < furthest
    && !visited.has(item.i)
    && !item.positiveTabindex
    && !(item.radioGroup && radioReached.has(item.radioGroup)));
}

// ── Verdicts ─────────────────────────────────────────────────────────────────

const MAX_NAMED = 6;

function named(refs: ElementRef[]): string {
  return refs.slice(0, MAX_NAMED).map((r) => (r.text ? `"${r.text}" (${r.selector})` : r.selector)).join("; ")
    + (refs.length > MAX_NAMED ? `; and ${refs.length - MAX_NAMED} more` : "");
}

function row(
  key: RenderedA11yKey,
  status: PulseScanCheckInput["status"],
  detail: string,
  confidence: "HIGH" | "MEDIUM" | "LOW",
  confidenceReason: string,
  evidence?: unknown,
): PulseScanCheckInput {
  return {
    category: CATEGORIES.ACCESSIBILITY,
    checkKey: key,
    label: RENDERED_A11Y_LABELS[key],
    status,
    detail,
    confidence,
    confidenceReason,
    evidenceStrength: status === "INCONCLUSIVE" ? undefined : "VERIFIED",
    ...(evidence !== undefined ? { evidence: JSON.stringify(evidence).slice(0, 1500) } : {}),
  };
}

function inconclusive(key: RenderedA11yKey, why: string): PulseScanCheckInput {
  return row(key, "INCONCLUSIVE", why, "LOW", "The rendered-page measurement did not run for this control.");
}

/** Every key INCONCLUSIVE, for a browser that did not start or a page that did not load. */
export function renderedA11yUnavailable(reason: string): PulseScanCheckInput[] {
  return RENDERED_A11Y_KEYS.map((key) => inconclusive(key, `Not measured: ${reason} This is a gap in the scan, not a finding about the page.`));
}

export const MIN_CONTRAST_SAMPLES = 5;
export const MIN_TARGETS = 3;

/** Turn one page's observations into the family's checks. Pure. */
export function evaluateRenderedA11y(obs: RenderedA11yObservation): PulseScanCheckInput[] {
  if (obs.renderedWords < 5 && (obs.walk?.inventory.length ?? 0) === 0) {
    return renderedA11yUnavailable("the page rendered no readable content in the browser.");
  }
  const out: PulseScanCheckInput[] = [];
  const stepError = (step: string) => obs.stepErrors[step];

  // Keyboard: reachability, traps, focus.
  const walk = obs.walk;
  if (!walk) {
    const why = stepError("walk") ? `the keyboard walk failed (${stepError("walk")}).` : "the keyboard walk did not run.";
    for (const key of ["rendered_keyboard_reachable", "rendered_no_keyboard_trap", "rendered_focus_visible", "rendered_focus_not_obscured", "rendered_skip_link_works"] as const) {
      out.push(inconclusive(key, `Not measured: ${why}`));
    }
  } else {
    out.push(...evaluateWalk(walk));
    out.push(evaluateSkipLink(obs.skipLink, walk));
  }

  // Contrast.
  if (!obs.contrast) {
    out.push(inconclusive("rendered_text_contrast", `Not measured: ${stepError("contrast") ? `the contrast pass failed (${stepError("contrast")}).` : "the contrast pass did not run."}`));
  } else {
    out.push(evaluateContrast(obs.contrast.samples, obs.contrast.unmeasurable));
  }

  // Target size.
  if (!obs.targets) {
    out.push(inconclusive("touch_target_size", `Not measured: ${stepError("targets") ? `the target-size pass failed (${stepError("targets")}).` : "the target-size pass did not run."}`));
  } else {
    out.push(evaluateTargets(obs.targets.items, obs.targets.viewportWidth));
  }
  return out;
}

export function evaluateWalk(walk: WalkObservation): PulseScanCheckInput[] {
  const out: PulseScanCheckInput[] = [];
  const { inventory, sequence, mouseOnly, cycle } = walk;
  const reached = new Set(sequence.filter((v) => v >= 0));
  const state = walkState(sequence).state;
  const stuck = state === "stuck" || (reached.size === 0 && inventory.length > 0);

  // ── Trap ──
  if (stuck) {
    out.push(inconclusive("rendered_no_keyboard_trap", "Not measured: pressing Tab never moved focus onto the page, so there was no walk to judge. This can be a property of the headless browser rather than the site."));
  } else if (cycle && !cycle.escapeReleased && !cycle.inDialog) {
    const members = cycle.members.map((i) => inventory.find((x) => x.i === i)?.ref).filter((r): r is ElementRef => Boolean(r));
    out.push(row("rendered_no_keyboard_trap", "FAIL",
      `Focus went round a closed loop of ${members.length} control(s) and pressing Escape did not let it leave: ${named(members)}. A keyboard user cannot get past this point (WCAG 2.1.2 No Keyboard Trap).`,
      "HIGH", "Observed by pressing Tab and Escape in a real browser.", { loop: members.slice(0, 10) }));
  } else if (cycle && cycle.inDialog && !cycle.escapeReleased) {
    out.push(row("rendered_no_keyboard_trap", "INCONCLUSIVE",
      "A dialog held focus from the moment the page loaded and Escape did not close it. Holding focus is what a modal should do, so this is not counted as a trap — but the walk could not get past it, so the rest of the page was not tested.",
      "LOW", "A modal holding focus is expected; whether it can be closed by keyboard needs activating its buttons, which Pulse does not do."));
  } else {
    out.push(row("rendered_no_keyboard_trap", "PASS",
      cycle
        ? `Focus went round a loop of ${cycle.members.length} control(s)${cycle.inDialog ? " in a dialog" : ""}, and Escape released it. No trap.`
        : `Tab moved through ${reached.size} control(s)${state === "wrapped" ? " to the end of the page and back to the start" : ""} without getting stuck.`,
      state === "wrapped" || cycle ? "HIGH" : "MEDIUM",
      state === "wrapped" || cycle ? "Observed by pressing Tab through the whole page in a real browser." : "Observed over the first part of the page only; the walk stopped at its step limit."));
  }

  // ── Reachability ──
  const unreached = unreachedControls(inventory, sequence).map((x) => x.ref);
  const blockedByDialog = Boolean(cycle && cycle.inDialog && !cycle.escapeReleased);
  if (stuck || (blockedByDialog && mouseOnly.length === 0)) {
    out.push(inconclusive("rendered_keyboard_reachable", stuck
      ? "Not measured: pressing Tab never moved focus onto the page."
      : "Not measured: a dialog held focus at load, so the rest of the page could not be walked."));
  } else if (mouseOnly.length > 0) {
    out.push(row("rendered_keyboard_reachable", "FAIL",
      `${mouseOnly.length} control(s) act as buttons or links but cannot be reached with Tab — they have an interactive role or click handler and no tabindex: ${named(mouseOnly)}.${unreached.length ? ` Tab also skipped ${unreached.length} other control(s): ${named(unreached)}.` : ""} Keyboard users cannot operate them (WCAG 2.1.1 Keyboard).`,
      "HIGH", "An element with role=button/link and no tabindex is not in the tab order — read from the rendered DOM.", { mouseOnly: mouseOnly.slice(0, 10), unreached: unreached.slice(0, 10) }));
  } else if (unreached.length > 0) {
    out.push(row("rendered_keyboard_reachable", "WARN",
      `Tab skipped ${unreached.length} visible control(s) in the part of the page it walked: ${named(unreached)}. Check they are reachable another way (WCAG 2.1.1 Keyboard).`,
      "MEDIUM", "Observed in a real browser; a script that moves focus deliberately can also cause a skip.", { unreached: unreached.slice(0, 10) }));
  } else {
    const whole = state === "wrapped" || Boolean(cycle);
    out.push(row("rendered_keyboard_reachable", "PASS",
      whole
        ? `Tab reached all ${inventory.length} visible control(s) on the page.`
        : `Tab reached every visible control in the first ${reached.size} stop(s) of ${inventory.length}; the walk stopped at its step limit, so the rest of the page was not walked.`,
      whole ? "HIGH" : "MEDIUM",
      whole ? "Observed by pressing Tab through the whole page in a real browser." : "Observed over part of the page."));
  }

  // ── Focus visible + not obscured ──
  const samples = walk.focusSamples;
  // An iframe's focus ring is drawn inside the frame's own document, which is not read here.
  const judged = samples
    .filter((s) => s.ref.tag !== "iframe")
    .map((s) => ({ s, ok: hasFocusIndicator(s.before, s.after) }))
    .filter((x) => x.ok !== null);
  if (judged.length === 0) {
    out.push(inconclusive("rendered_focus_visible", "Not measured: no focused control could be compared with its unfocused style."));
  } else {
    const missing = judged.filter((x) => x.ok === false).map((x) => x.s.ref);
    const share = missing.length / judged.length;
    if (missing.length === 0) {
      out.push(row("rendered_focus_visible", "PASS",
        `All ${judged.length} control(s) focused by Tab changed visibly when focused (outline, shadow, border, colour or background).`,
        "MEDIUM", "Compared computed styles before and after focus; a change Pulse reads as visible could still be too faint to notice."));
    } else {
      const fail = missing.length >= 3 && share >= 0.2;
      out.push(row("rendered_focus_visible", fail ? "FAIL" : "WARN",
        `${missing.length} of ${judged.length} control(s) looked exactly the same focused as unfocused — no outline, shadow, border, colour or background change on the control, its parents, its first children or its ::before/::after: ${named(missing)}. Keyboard users cannot see where they are (WCAG 2.4.7 Focus Visible).`,
        "MEDIUM", "Compared computed styles before and after focus. A focus style drawn on a sibling element would not be seen, so a small number is a WARN.", { noIndicator: missing.slice(0, 10) }));
    }
  }

  const placed = samples.filter((s) => s.obscured !== null);
  if (placed.length === 0) {
    out.push(inconclusive("rendered_focus_not_obscured", "Not measured: no focused control could be placed on screen to test."));
  } else {
    const hidden = placed.filter((s) => s.obscured).map((s) => s.ref);
    out.push(hidden.length === 0
      ? row("rendered_focus_not_obscured", "PASS", `None of the ${placed.length} focused control(s) was completely covered by other content.`, "MEDIUM", "Hit-tested the focused control's centre and corners in a real browser.")
      : row("rendered_focus_not_obscured", hidden.length >= 2 ? "FAIL" : "WARN",
        `${hidden.length} focused control(s) were completely covered by other content (a sticky header, banner or overlay): ${named(hidden)}. WCAG 2.4.11 Focus Not Obscured requires part of the focused control to stay visible.`,
        "MEDIUM", "Hit-tested the focused control's centre and corners after the browser scrolled it into view.", { obscured: hidden.slice(0, 10) }));
  }
  return out;
}

export function evaluateSkipLink(skip: SkipLinkObservation | null, walk: WalkObservation): PulseScanCheckInput {
  if (!skip) {
    return row("rendered_skip_link_works", "NOT_APPLICABLE",
      "No skip link among the first Tab stops, so there was nothing to test. Whether the page needs one is a separate check (skip_to_main_content).",
      "HIGH", `Read the first Tab stops in a real browser (${walk.sequence.filter((v) => v >= 0).length} reached).`);
  }
  const who = `"${skip.link.text}" (href="#${skip.target}")`;
  if (!skip.targetExists) {
    return row("rendered_skip_link_works", "FAIL",
      `The skip link ${who} points at #${skip.target}, and nothing on the page has that id — activating it does nothing (WCAG 2.4.1 Bypass Blocks).`,
      "HIGH", "Looked up the link's target in the rendered DOM.", { link: skip.link });
  }
  if (skip.moved === null) {
    return inconclusive("rendered_skip_link_works", `Not measured: the skip link ${who} could not be activated cleanly in the browser.`);
  }
  return skip.moved
    ? row("rendered_skip_link_works", "PASS", `The skip link ${who} is ${skip.position === 1 ? "the first Tab stop" : `Tab stop ${skip.position}`} and moves focus to the main content.`, "HIGH", "Activated with Enter and followed with Tab in a real browser.")
    : row("rendered_skip_link_works", "FAIL",
      `The skip link ${who} exists, but after activating it the next Tab went back into the content before #${skip.target}, so it does not skip anything (WCAG 2.4.1).`,
      "MEDIUM", "Activated with Enter and followed with Tab in a real browser.", { link: skip.link });
}

export function evaluateContrast(samples: ContrastSample[], unmeasurable: number): PulseScanCheckInput {
  const { measured, failures } = contrastFailures(samples);
  if (measured < MIN_CONTRAST_SAMPLES) {
    return inconclusive("rendered_text_contrast",
      `Not measured: only ${measured} text element(s) sat on a plain background Pulse could measure${unmeasurable ? ` (${unmeasurable} sat on images, gradients or translucent layers)` : ""}. Too few to judge the page.`);
  }
  const skipped = unmeasurable ? ` (${unmeasurable} more sat on images, gradients or translucent layers and were not judged)` : "";
  const scope = `${measured} sampled text element(s)${skipped}`;
  if (failures.length === 0) {
    return row("rendered_text_contrast", "PASS", `All ${scope} meet WCAG AA contrast (4.5:1, or 3:1 for large text).`,
      "MEDIUM", "Computed from the rendered colours; a sample of the page's text, not every line.");
  }
  const worst = [...failures].sort((a, b) => a.ratio - b.ratio);
  const fail = failures.length >= 3;
  return row("rendered_text_contrast", fail ? "FAIL" : "WARN",
    `${failures.length} of ${scope} fall below WCAG AA contrast (1.4.3): ${worst.slice(0, MAX_NAMED).map((f) => `"${f.ref.text || f.ref.selector}" ${f.ratio}:1 (needs ${f.required}:1, ${f.fg} on ${f.bg})`).join("; ")}${worst.length > MAX_NAMED ? `; and ${worst.length - MAX_NAMED} more` : ""}.`,
    fail ? "HIGH" : "MEDIUM", "Computed from the colours the browser painted, composited over the layers beneath.", { failures: worst.slice(0, 10) });
}

export function evaluateTargets(items: TargetItem[], viewportWidth: number): PulseScanCheckInput {
  const { measured, failures } = targetSizeFailures(items);
  if (measured < MIN_TARGETS) {
    return inconclusive("touch_target_size", `Not measured: only ${measured} tappable control(s) were visible at a ${viewportWidth}px-wide phone viewport.`);
  }
  if (failures.length === 0) {
    return row("touch_target_size", "PASS",
      `All ${measured} tappable control(s) at a ${viewportWidth}px phone width are at least 24×24 CSS px, or spaced so a 24px circle around each touches nothing else (WCAG 2.5.8).`,
      "MEDIUM", "Measured from rendered element boxes at a phone-width viewport.");
  }
  const fail = failures.length >= 3;
  return row("touch_target_size", fail ? "FAIL" : "WARN",
    `${failures.length} of ${measured} tappable control(s) at a ${viewportWidth}px phone width are smaller than 24×24 CSS px and crowd another control: ${failures.slice(0, MAX_NAMED).map((f) => `"${f.ref.text || f.ref.selector}" ${Math.round(f.w)}×${Math.round(f.h)}px${f.nearest ? ` next to "${f.nearest}"` : ""}`).join("; ")}${failures.length > MAX_NAMED ? `; and ${failures.length - MAX_NAMED} more` : ""}. WCAG 2.5.8 Target Size (Minimum).`,
    "MEDIUM", "Measured from rendered boxes. WCAG also exempts a control whose action is available from a larger control elsewhere, which Pulse cannot see.",
    { failures: failures.slice(0, 10).map((f) => ({ ...f.ref, w: Math.round(f.w), h: Math.round(f.h) })) });
}
