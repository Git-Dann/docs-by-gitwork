// Integration: the consent collector against fixture pages in real Chromium.
//
// Pages are served through request interception on a made-up https origin, so the
// page can set cookies and reload like a real site, and tracker beacons are answered
// locally. Runs only where a browser exists; CI has none, so there it is skipped —
// the verdicts are covered by pulse-checks/__tests__/consent-tracking.test.ts.

import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "puppeteer-core";
import { collectConsent } from "../consent-tracking-agent";
import { evaluateConsentTracking } from "@/server/pulse-checks/consent-tracking";

const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executable = process.env.PUPPETEER_EXECUTABLE_PATH || (existsSync(MAC_CHROME) ? MAC_CHROME : "");
const ORIGIN = "https://consent-fixture.test";
const GA = "https://region1.google-analytics.com/g/collect?v=2&tid=G-TEST&en=page_view";

const banner = (rejectLabel: string) => `
  <div id="banner" style="position:fixed;bottom:0;left:0;right:0;padding:16px;background:#fff">
    <p>We use cookies to understand how the site is used.</p>
    <button onclick="document.cookie='consent=yes;path=/';location.reload()">Accept all</button>
    <button onclick="document.cookie='consent=no;path=/';document.getElementById('banner').remove()">${rejectLabel}</button>
  </div>`;
const body = "<h1>Fixture shop</h1><p>Plenty of ordinary words on this page so it reads as a real rendered page.</p>";

/** Fires GA and sets _ga on every load, whatever the visitor chose. */
const IGNORES_CHOICE = `<!doctype html><html><body>${body}${banner("Reject all")}
  <script>fetch(${JSON.stringify(GA)}, { mode: "no-cors" }); document.cookie = "_ga=GA1.1.123.456;path=/";</script></body></html>`;

/** Fires GA only after consent=yes. */
const WAITS = `<!doctype html><html><body>${body}
  <script>if (document.cookie.includes("consent=yes")) { fetch(${JSON.stringify(GA)}, { mode: "no-cors" }); document.cookie = "_ga=GA1.1.1.1;path=/"; }
  else if (!document.cookie.includes("consent=")) document.write(${JSON.stringify(banner("Reject all"))});</script></body></html>`;

/** Accept only: no way to say no on the first layer. */
const ACCEPT_ONLY = `<!doctype html><html><body>${body}
  <div><p>This site uses cookies.</p><button>Accept all</button><button>Manage preferences</button></div></body></html>`;

let browser: Browser | null = null;

async function run(html: string) {
  // Each fixture gets its own empty cookie jar, like a first visit.
  const ctx = await browser!.createBrowserContext();
  const page: Page = await ctx.newPage();
  const recorder = { current: [] as string[] };
  page.on("request", (r) => { recorder.current.push(r.url()); });
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    if (r.url().startsWith(ORIGIN)) void r.respond({ status: 200, contentType: "text/html", body: html });
    else void r.respond({ status: 204, body: "" });
  });
  const load = async () => { await page.goto(`${ORIGIN}/`, { waitUntil: "load" }); };
  await load();
  const observation = await collectConsent(page, `${ORIGIN}/`, recorder, load, 800);
  await ctx.close();
  return Object.fromEntries(evaluateConsentTracking(observation).map((c) => [c.checkKey, c.status]));
}

describe.skipIf(!executable)("consent collector in Chromium", () => {
  beforeAll(async () => {
    const puppeteer = (await import("puppeteer-core")).default;
    browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox"] });
  }, 30_000);
  afterAll(async () => { await browser?.close(); });

  it("catches a site that tracks before the choice and after Reject", async () => {
    const r = await run(IGNORES_CHOICE);
    expect(r).toMatchObject({
      consent_no_tracking_before_choice: "FAIL",
      consent_no_tracking_cookies_before_choice: "FAIL",
      // _ga was already set before the choice, so it is not "new" — but GA fired again.
      consent_reject_honoured: "FAIL",
    });
  }, 30_000);

  it("passes a site that waits for consent and honours Reject", async () => {
    const r = await run(WAITS);
    expect(r).toEqual({
      consent_no_tracking_before_choice: "PASS",
      consent_no_tracking_cookies_before_choice: "PASS",
      consent_reject_honoured: "PASS",
    });
  }, 30_000);

  it("cannot test Reject on an accept-only banner", async () => {
    const r = await run(ACCEPT_ONLY);
    expect(r.consent_reject_honoured).toBe("INCONCLUSIVE");
  }, 30_000);
});
