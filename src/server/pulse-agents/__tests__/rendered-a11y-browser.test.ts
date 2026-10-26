// Integration: the in-page collectors against real markup in real Chromium.
//
// Runs only where a browser exists (PUPPETEER_EXECUTABLE_PATH, or Chrome at its macOS
// path). CI has none, so there it is skipped — the verdict logic is covered by the pure
// tests in pulse-checks/__tests__/rendered-a11y.test.ts either way.

import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser } from "puppeteer-core";
import { collectRenderedA11y } from "../rendered-a11y-agent";
import { evaluateRenderedA11y } from "@/server/pulse-checks/rendered-a11y";

const MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executable = process.env.PUPPETEER_EXECUTABLE_PATH || (existsSync(MAC_CHROME) ? MAC_CHROME : "");

const GOOD = `<!doctype html><html lang="en"><head><style>
  body { font: 16px/1.5 sans-serif; color: #111; background: #fff; margin: 0 }
  .skip { position: absolute; left: -9999px } .skip:focus { left: 8px; top: 8px }
  nav a, button { display: inline-block; min-width: 44px; min-height: 44px; padding: 12px; margin: 4px }
</style></head><body>
  <a class="skip" href="#main">Skip to main content</a>
  <nav><a href="/a">Home</a><a href="/b">About</a><a href="/c">Contact</a></nav>
  <main id="main"><h1>Welcome</h1>
    <p>Plain readable text in a paragraph that is long enough to measure.</p>
    <p>Another paragraph of ordinary dark text on a white page.</p>
    <p>Read <a href="/d">our guide</a> before you start, it explains everything.</p>
    <p>More text here to sample.</p><p>And a final paragraph of text.</p>
    <button>Save</button><button>Cancel</button>
  </main></body></html>`;

const BAD = `<!doctype html><html lang="en"><head><style>
  body { font: 16px/1.5 sans-serif; color: #aaa; background: #fff; margin: 0 }
  a:focus, button:focus { outline: none }
  .icons a { display: inline-block; width: 12px; height: 12px; margin: 0 2px; background: #ccc }
  .menu { width: 60px; height: 30px; background: #eee }
</style></head><body>
  <a href="#missing">Skip to content</a>
  <div class="menu" role="button">Menu</div>
  <div class="icons"><a href="/x" aria-label="X"></a><a href="/y" aria-label="Y"></a><a href="/z" aria-label="Z"></a><a href="/w" aria-label="W"></a></div>
  <p>Light grey text that fails contrast on a white background.</p>
  <p>More light grey text that fails contrast as well, sadly.</p>
  <p>Yet more pale text in a third paragraph.</p><p>Fourth pale paragraph.</p><p>Fifth pale paragraph.</p>
  <button>One</button><button>Two</button><button>Three</button>
</body></html>`;

const TRAP = `<!doctype html><html><body><p>Some text so the page is not empty, and enough words.</p>
  <button id="a">First</button><button id="b">Second</button><button id="c">Unreachable</button>
  <script>document.getElementById('b').addEventListener('keydown', function (e) {
    if (e.key === 'Tab') { e.preventDefault(); document.getElementById('a').focus(); } });</script>
</body></html>`;

describe.skipIf(!executable)("rendered accessibility collector in Chromium", () => {
  let browser: Browser;
  beforeAll(async () => {
    const puppeteer = (await import("puppeteer-core")).default;
    browser = await puppeteer.launch({ executablePath: executable, headless: true, args: ["--no-sandbox"], defaultViewport: { width: 1280, height: 900 } });
  });
  afterAll(async () => { await browser?.close(); });

  async function measure(html: string) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setContent(html, { waitUntil: "load" });
    const obs = await collectRenderedA11y(page, "https://fixture.test/");
    await page.close();
    return Object.fromEntries(evaluateRenderedA11y(obs).map((c) => [c.checkKey, c]));
  }

  it("passes an accessible page on every measure", async () => {
    const c = await measure(GOOD);
    expect(c.rendered_keyboard_reachable.status).toBe("PASS");
    expect(c.rendered_no_keyboard_trap.status).toBe("PASS");
    expect(c.rendered_focus_visible.status).toBe("PASS");
    expect(c.rendered_skip_link_works.status).toBe("PASS");
    expect(c.rendered_text_contrast.status).toBe("PASS");
    expect(c.touch_target_size.status).toBe("PASS");
  }, 30_000);

  it("names each defect on an inaccessible page", async () => {
    const c = await measure(BAD);
    expect(c.rendered_keyboard_reachable.status).toBe("FAIL");
    expect(c.rendered_keyboard_reachable.detail).toContain("Menu");
    expect(c.rendered_focus_visible.status).toBe("FAIL");
    expect(c.rendered_skip_link_works.status).toBe("FAIL");
    expect(c.rendered_skip_link_works.detail).toContain("#missing");
    expect(c.rendered_text_contrast.status).toBe("FAIL");
    expect(c.touch_target_size.status).toBe("FAIL");
  }, 30_000);

  it("finds a keyboard trap that Escape cannot leave", async () => {
    const c = await measure(TRAP);
    expect(c.rendered_no_keyboard_trap.status).toBe("FAIL");
    expect(c.rendered_no_keyboard_trap.detail).toContain("First");
  }, 30_000);
});
