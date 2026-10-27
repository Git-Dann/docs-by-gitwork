// Consent-before-tracking collector.
//
// Loads the page in a FRESH headless Chromium (no stored cookies, so it is a first
// visit), records every request and cookie for a fixed window with nothing clicked,
// then presses the banner's first-layer Reject control, reloads, and records again.
//
// Collect-only. The verdicts are pure functions in pulse-checks/consent-tracking.ts.
// Any failure becomes INCONCLUSIVE checks plus a `collectorError` — never a PASS.

import type { Frame, Page } from "puppeteer-core";
import { launchHeadlessBrowser } from "@/server/headless-browser";
import { assertScannableUrl, guardBrowserRequests } from "@/server/pulse-lite/url-guard";
import {
  consentTrackingUnavailable,
  evaluateConsentTracking,
  FIND_CONTROLS_SCRIPT,
  PRESS_REJECT_SCRIPT,
  type ConsentControl,
  type ConsentObservation,
  type ConsentPhase,
  type ObservedCookie,
} from "@/server/pulse-checks/consent-tracking";
import type { PulseScanCheckInput } from "@/types/pulse";

const HARD_TIMEOUT_MS = 40_000;
const NAV_TIMEOUT_MS = 15_000;
/** How long a first visit is watched before a choice could reasonably have been made. */
export const WATCH_MS = 6_000;
const AFTER_PRESS_MS = 1_500;

export interface ConsentTrackingResult {
  checks: PulseScanCheckInput[];
  observation: ConsentObservation | null;
  collectorError?: string;
}

interface FoundControls {
  reject: { text: string; selector: string } | null;
  accept: { text: string; selector: string } | null;
  blocked: boolean;
  words: number;
}

async function readCookies(page: Page): Promise<ObservedCookie[]> {
  // Every cookie in this page's browser context, third-party ones included
  // (page.cookies() only returns the ones for the page's own URL).
  const cookies = await page.browserContext().cookies();
  return cookies.map((c) => ({ name: c.name, domain: c.domain }));
}

async function findControls(page: Page): Promise<{ words: number; blocked: boolean; reject: (ConsentControl & { frame: Frame }) | null; accept: ConsentControl | null }> {
  let words = 0;
  let blocked = false;
  let reject: (ConsentControl & { frame: Frame }) | null = null;
  let accept: ConsentControl | null = null;
  const main = page.mainFrame();
  // Main frame first: a reject button on the page itself wins over one in an iframe.
  const frames = [main, ...page.frames().filter((f) => f !== main)].slice(0, 12);
  for (const frame of frames) {
    let found: FoundControls;
    try {
      found = (await frame.evaluate(FIND_CONTROLS_SCRIPT)) as FoundControls;
    } catch {
      continue; // detached or not yet ready — another frame may still answer
    }
    if (frame === main) {
      words = found.words;
      blocked = found.blocked;
    }
    if (!reject && found.reject) reject = { ...found.reject, inFrame: frame !== main, frame };
    if (!accept && found.accept) accept = { ...found.accept, inFrame: frame !== main };
    if (reject && accept) break;
  }
  return { words, blocked, reject, accept };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Observe an already-loaded first visit. `recorder` is the live request log the
 * caller attached before navigating; `reload` reloads the page. Exported for the
 * integration test, which serves fixture pages through request interception.
 */
export async function collectConsent(
  page: Page,
  url: string,
  recorder: { current: string[] },
  reload: () => Promise<void>,
  watchMs: number = WATCH_MS,
): Promise<ConsentObservation> {
  const stepErrors: Record<string, string> = {};
  const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 140);

  await wait(watchMs);
  const controls = await findControls(page);
  let before: ConsentPhase | null = null;
  try {
    before = { requests: [...recorder.current], cookies: await readCookies(page) };
  } catch (e) {
    stepErrors.before = msg(e);
  }

  let afterReject: ConsentPhase | null = null;
  if (controls.reject && before) {
    try {
      // Everything from the press onwards belongs to the "after rejecting" phase.
      recorder.current = [];
      const pressed = Boolean(await controls.reject.frame.evaluate(PRESS_REJECT_SCRIPT));
      if (!pressed) throw new Error("the button disappeared before it could be pressed");
      await wait(AFTER_PRESS_MS);
      await reload();
      await wait(watchMs);
      afterReject = { requests: [...recorder.current], cookies: await readCookies(page) };
    } catch (e) {
      stepErrors.reject = msg(e);
    }
  }

  const reject = controls.reject ? { text: controls.reject.text, selector: controls.reject.selector, inFrame: controls.reject.inFrame } : null;
  return {
    url,
    renderedWords: controls.words,
    blockedPage: controls.blocked,
    windowMs: watchMs,
    before,
    rejectControl: reject,
    acceptControl: controls.accept,
    afterReject,
    stepErrors,
  };
}

/** `markets`: the scan's target markets; analytics is judged more strictly where the EU applies. */
export async function runConsentTrackingAgent(url: string, markets: string[] = []): Promise<ConsentTrackingResult> {
  let browser: import("puppeteer-core").Browser | null = null;
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The consent check timed out.")), HARD_TIMEOUT_MS);
    timer.unref?.();
  });

  try {
    const work = (async () => {
      const safeUrl = (await assertScannableUrl(url)).url;
      // A new launch is a new, empty profile: no cookies, no stored consent.
      browser = await launchHeadlessBrowser({ defaultViewport: { width: 1280, height: 900 } });
      const page = await browser.newPage();
      const recorder = { current: [] as string[] };
      page.on("request", (request) => {
        if (recorder.current.length < 2000) recorder.current.push(request.url());
      });
      await guardBrowserRequests(page);
      const load = async () => {
        try {
          await page.goto(safeUrl, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
        } catch (e) {
          // A page that never fires `load` (a stuck tracker) may still be fully drawn.
          const words = await page.evaluate("document.body ? document.body.innerText.length : 0").catch(() => 0);
          if (!words) throw e;
        }
      };
      await load();
      return collectConsent(page, page.url() || safeUrl, recorder, load);
    })();
    work.catch(() => undefined);
    const observation = await Promise.race([work, deadline]);
    return { checks: evaluateConsentTracking({ ...observation, markets }), observation };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "the browser could not load the page.";
    return {
      checks: consentTrackingUnavailable(`the page could not be loaded in a browser (${reason.slice(0, 140)}).`),
      observation: null,
      collectorError: reason.slice(0, 160),
    };
  } finally {
    if (timer) clearTimeout(timer);
    await (browser as import("puppeteer-core").Browser | null)?.close().catch(() => {});
  }
}
