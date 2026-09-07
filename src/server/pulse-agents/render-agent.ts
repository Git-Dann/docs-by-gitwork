// Wave A0 — Render agent.
//
// Fetches a page's HTML **after** its JavaScript has run, so the content and SEO checks can
// read a client-rendered app instead of declaring it unassessable.
//
// Why this exists: Pulse fetches raw HTML. A Lovable/Bolt/v0/Vite app serves an empty shell —
// one measured target had 6 words, 0 headings and 0 links in its source and a complete page in
// the browser — and that population is precisely who Pulse is sold to. Before this, the honest
// outcome for them was INCONCLUSIVE on every content control: not wrong, but not an assessment
// either.
//
// ⚠️ It runs ONLY when the static HTML already looks like a shell. Rendering a server-rendered
// page costs a browser launch to learn nothing, and a scanner that boots Chromium for every URL
// is a scanner nobody runs on a schedule.

import { launchHeadlessBrowser } from "@/server/headless-browser";
import { assertScannableUrl, guardBrowserRequests } from "@/server/pulse-lite/url-guard";
import { staticTextWordCount } from "@/server/pulse-lite/spa-detect";

/** Hard ceiling on the whole attempt. A scan cannot hang on one slow hydration. */
const HARD_TIMEOUT_MS = 25_000;
const NAV_TIMEOUT_MS = 18_000;
/** After load, give late client-side fetches a moment to paint their content. */
const SETTLE_MS = 1_200;

export interface RenderResult {
  /** Post-hydration HTML, or null when rendering did not produce usable content. */
  html: string | null;
  /** Visible words in the static source, for the before/after the check details quote. */
  staticWords: number;
  /** Visible words after hydration. */
  renderedWords: number;
  /** Why there is no HTML. Null on success — never an empty string, which reads as "no reason". */
  error: string | null;
}

/**
 * The rendered DOM has to be MATERIALLY richer than the source before it is worth trusting.
 *
 * A page that hydrates to the same content it already served gains nothing, and swapping in a
 * near-identical DOM would make the scan's provenance ("measured from the rendered page") true
 * in letter and misleading in spirit. It also guards the failure that matters: a hydration that
 * errored leaves the shell in place, and without this the shell would be re-measured and its
 * emptiness reported as a confident finding — the exact false FAIL this agent exists to remove.
 */
export function isMateriallyRicher(staticWords: number, renderedWords: number): boolean {
  if (renderedWords < 30) return false;
  return renderedWords >= staticWords * 2 || renderedWords - staticWords >= 100;
}

export async function runRenderAgent(url: string): Promise<RenderResult> {
  const out: RenderResult = { html: null, staticWords: 0, renderedWords: 0, error: null };
  let browser: import("puppeteer-core").Browser | null = null;

  const deadline = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Rendering timed out.")), HARD_TIMEOUT_MS).unref?.(),
  );

  try {
    const work = (async () => {
      const safeUrl = (await assertScannableUrl(url)).url;
      browser = await launchHeadlessBrowser({ defaultViewport: { width: 1280, height: 900 } });
      const page = await browser.newPage();
      // Same SSRF rule for every subresource the page pulls, not just the navigation —
      // a rendered page fetches whatever it likes, from inside our network.
      await guardBrowserRequests(page);
      await page.goto(safeUrl, { waitUntil: "networkidle2", timeout: NAV_TIMEOUT_MS });
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      return page.content();
    })();

    const html = await Promise.race([work, deadline]);
    out.renderedWords = staticTextWordCount(html);
    out.html = html;
    return out;
  } catch (error) {
    out.error = error instanceof Error ? error.message : "Rendering failed.";
    return out;
  } finally {
    await (browser as import("puppeteer-core").Browser | null)?.close().catch(() => {});
  }
}
