// Rendered-page accessibility collector.
//
// Loads the page once in headless Chromium (the shared launcher, so it runs on the
// VPS's native binary — headless-browser.ts) and measures what HTML text cannot:
// a real Tab walk, focus styles, painted contrast, and control sizes at phone width.
// One page load serves every measurement; the phone pass resizes the same page.
//
// Collect-only. The verdicts are pure functions in pulse-checks/rendered-a11y.ts.
// Any failure becomes INCONCLUSIVE checks plus a `collectorError` — never a PASS.

import type { Page } from "puppeteer-core";
import { launchHeadlessBrowser } from "@/server/headless-browser";
import { assertScannableUrl, guardBrowserRequests } from "@/server/pulse-lite/url-guard";
import {
  evaluateRenderedA11y,
  renderedA11yUnavailable,
  walkState,
  type ContrastSample,
  type ElementRef,
  type FocusSample,
  type InventoryItem,
  type RenderedA11yObservation,
  type SkipLinkObservation,
  type StyleSignature,
  type TargetItem,
  type WalkObservation,
} from "@/server/pulse-checks/rendered-a11y";
import {
  activeScript,
  CONTRAST_SCRIPT,
  IN_DIALOG_SCRIPT,
  SETUP_SCRIPT,
  skipLinkFindScript,
  skipLinkFocusScript,
  skipLinkResultScript,
  TARGETS_SCRIPT,
} from "./rendered-a11y-scripts";
import type { PulseScanCheckInput } from "@/types/pulse";

const HARD_TIMEOUT_MS = 30_000;
const NAV_TIMEOUT_MS = 15_000;
const SETTLE_MS = 600;
/** Tab presses. Enough for most pages' full tab order; the verdict states partial coverage. */
export const MAX_TAB_STEPS = 120;
/** Focus styles captured for the first N distinct controls. */
const MAX_FOCUS_SAMPLES = 40;
const PHONE = { width: 390, height: 844 };

export interface RenderedA11yResult {
  checks: PulseScanCheckInput[];
  observation: RenderedA11yObservation | null;
  /** Milliseconds spent measuring after the page loaded (navigation excluded). */
  measureMs: number | null;
  collectorError?: string;
}

interface ActiveRead {
  i: number;
  ref?: ElementRef;
  before?: StyleSignature | null;
  after?: StyleSignature;
  obscured?: boolean | null;
  inDialog?: boolean;
}

async function walkKeyboard(page: Page, inventory: InventoryItem[], mouseOnly: ElementRef[]): Promise<WalkObservation> {
  const sequence: number[] = [];
  const focusSamples: FocusSample[] = [];
  const sampled = new Set<number>();
  let cycle: WalkObservation["cycle"] = null;
  const byI = new Map(inventory.map((x) => [x.i, x]));

  for (let step = 0; step < MAX_TAB_STEPS; step++) {
    await page.keyboard.press("Tab");
    const capture = focusSamples.length < MAX_FOCUS_SAMPLES;
    const read = (await page.evaluate(activeScript(capture))) as ActiveRead;
    sequence.push(read.i);
    if (read.i >= 0 && read.after && !sampled.has(read.i)) {
      sampled.add(read.i);
      focusSamples.push({ i: read.i, ref: byI.get(read.i)?.ref ?? { selector: "", text: "", tag: "" }, before: read.before ?? null, after: read.after, obscured: read.obscured ?? null });
    }
    const { state, cycleFrom } = walkState(sequence);
    if (state === "wrapped" || state === "stuck") break;
    if (state === "cycle") {
      const members = [...new Set(sequence.slice(cycleFrom).filter((v) => v >= 0))];
      const inDialog = Boolean(await page.evaluate(IN_DIALOG_SCRIPT));
      // The way out of a widget that legitimately holds focus.
      await page.keyboard.press("Escape");
      await page.keyboard.press("Tab");
      const a = (await page.evaluate(activeScript(false))) as ActiveRead;
      await page.keyboard.press("Tab");
      const b = (await page.evaluate(activeScript(false))) as ActiveRead;
      const escapeReleased = [a.i, b.i].some((v) => !members.includes(v));
      cycle = { members, inDialog, escapeReleased };
      break;
    }
  }
  return { inventory, sequence, mouseOnly, cycle, focusSamples };
}

async function testSkipLink(page: Page, sequence: number[]): Promise<SkipLinkObservation | null> {
  const firstStops = [...new Set(sequence.filter((v) => v >= 0))].slice(0, 8);
  if (firstStops.length === 0) return null;
  const found = (await page.evaluate(skipLinkFindScript(firstStops))) as
    | { i: number; id: string; text: string; selector: string; targetExists: boolean }
    | null;
  if (!found) return null;
  const link: ElementRef = { selector: found.selector, text: found.text, tag: "a" };
  const position = firstStops.indexOf(found.i) + 1;
  if (!found.targetExists) return { link, position, target: found.id, targetExists: false, moved: null };
  let moved: boolean | null = null;
  try {
    const focused = await page.evaluate(skipLinkFocusScript(found.i));
    if (focused) {
      await page.keyboard.press("Enter");
      await new Promise((r) => setTimeout(r, 150));
      await page.keyboard.press("Tab");
      moved = (await page.evaluate(skipLinkResultScript(found.id))) as boolean | null;
    }
  } catch {
    moved = null;
  }
  return { link, position, target: found.id, targetExists: true, moved };
}

/**
 * Measure an already-loaded page. Exported for the integration test, which loads
 * fixture markup with setContent (the SSRF guard rightly refuses local pages).
 */
export async function collectRenderedA11y(page: Page, url: string): Promise<RenderedA11yObservation> {
  const stepErrors: Record<string, string> = {};
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 140);

  const setup = (await page.evaluate(SETUP_SCRIPT)) as { inventory: InventoryItem[]; mouseOnly: ElementRef[]; words: number };

  let walk: WalkObservation | null = null;
  let skipLink: SkipLinkObservation | null = null;
  try {
    walk = await walkKeyboard(page, setup.inventory, setup.mouseOnly);
  } catch (e) { stepErrors.walk = msg(e); }
  if (walk) {
    try { skipLink = await testSkipLink(page, walk.sequence); } catch (e) { stepErrors.skip = msg(e); }
  }

  let contrast: RenderedA11yObservation["contrast"] = null;
  try {
    contrast = (await page.evaluate(CONTRAST_SCRIPT)) as { samples: ContrastSample[]; unmeasurable: number };
  } catch (e) { stepErrors.contrast = msg(e); }

  let targets: RenderedA11yObservation["targets"] = null;
  try {
    // Same page, phone width: CSS media queries respond to a resize without a reload.
    await page.setViewport({ width: PHONE.width, height: PHONE.height });
    await new Promise((r) => setTimeout(r, 300));
    targets = (await page.evaluate(TARGETS_SCRIPT)) as { viewportWidth: number; items: TargetItem[] };
  } catch (e) { stepErrors.targets = msg(e); }

  return { url, renderedWords: setup.words, walk, contrast, targets, skipLink, stepErrors };
}

export async function runRenderedA11yAgent(url: string): Promise<RenderedA11yResult> {
  let browser: import("puppeteer-core").Browser | null = null;
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The rendered accessibility pass timed out.")), HARD_TIMEOUT_MS);
    timer.unref?.();
  });

  try {
    const work = (async () => {
      const safeUrl = (await assertScannableUrl(url)).url;
      browser = await launchHeadlessBrowser({ defaultViewport: { width: 1280, height: 900 } });
      const page = await browser.newPage();
      await guardBrowserRequests(page);
      try {
        await page.goto(safeUrl, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
      } catch (e) {
        // A page that never fires `load` (a stuck tracker) may still be fully drawn.
        const words = await page.evaluate("document.body ? document.body.innerText.length : 0").catch(() => 0);
        if (!words) throw e;
      }
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      const t0 = Date.now();
      const observation = await collectRenderedA11y(page, page.url() || safeUrl);
      return { observation, measureMs: Date.now() - t0 };
    })();
    // The deadline can win while this is still running; its later rejection is not news.
    work.catch(() => undefined);
    const { observation, measureMs } = await Promise.race([work, deadline]);
    return { checks: evaluateRenderedA11y(observation), observation, measureMs };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "the browser could not load the page.";
    return {
      checks: renderedA11yUnavailable(`the page could not be measured in a browser (${reason.slice(0, 140)}).`),
      observation: null,
      measureMs: null,
      collectorError: reason.slice(0, 160),
    };
  } finally {
    if (timer) clearTimeout(timer);
    await (browser as import("puppeteer-core").Browser | null)?.close().catch(() => {});
  }
}
