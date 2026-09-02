import { launchHeadlessBrowser } from "@/server/headless-browser";
import { assertScannableUrl, guardBrowserRequests } from "@/server/pulse-lite/url-guard";
import { summariseAuthenticatedPage, type AuthenticatedPageSignals } from "./auth-content";

export type AuthPageContent = AuthenticatedPageSignals;

/**
 * Launches a headless browser, navigates to the login URL, fills in the
 * provided credentials, waits for post-login navigation, then extracts key
 * page content from the authenticated view.
 *
 * Returns null on any failure — never throws.
 * Credentials are used once and discarded — never stored or logged.
 */
export async function runAuthAgent(
  loginUrl: string,
  email: string,
  password: string,
): Promise<AuthPageContent | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any = null;

  const AGENT_TIMEOUT_MS = 28_000;

  const run = async (): Promise<AuthPageContent | null> => {
    try {
      const safeLoginUrl = (await assertScannableUrl(loginUrl)).url;
      // Shared launcher — see visual-agent: the Lambda binary can't run on the
      // Alpine container, and this agent's swallowed errors hid that.
      browser = await launchHeadlessBrowser({ defaultViewport: { width: 1280, height: 800 } });

      const page = await browser.newPage();

      // Chromium follows redirects and loads subresources independently of Node's
      // fetch path. Intercept every network request so a public page cannot pivot
      // the authenticated browser into localhost, a private service or metadata.
      await guardBrowserRequests(page);

      // Navigate to the login URL
      await page.goto(safeLoginUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });

      // Wait for an email input field
      const emailSelector = 'input[type="email"], input[name="email"], input[placeholder*="email" i]';
      await page.waitForSelector(emailSelector, { timeout: 10_000 });

      // Fill email
      await page.type(emailSelector, email, { delay: 30 });

      // Fill password
      const passwordSelector = 'input[type="password"]';
      await page.waitForSelector(passwordSelector, { timeout: 5_000 });
      await page.type(passwordSelector, password, { delay: 30 });

      // Click submit — try button[type="submit"] first, then buttons containing
      // "sign in", "log in", or "login" text (case-insensitive)
      const currentUrl = page.url();

      const clicked = await page.evaluate(() => {
        // Try type="submit" first
        const submitBtn = document.querySelector<HTMLElement>('button[type="submit"]');
        if (submitBtn) { submitBtn.click(); return true; }

        // Fallback: find buttons by text content
        const buttons = Array.from(document.querySelectorAll<HTMLElement>("button"));
        const loginBtn = buttons.find((btn) => {
          const text = (btn.textContent ?? "").toLowerCase().trim();
          return text.includes("sign in") || text.includes("log in") || text.includes("login");
        });
        if (loginBtn) { loginBtn.click(); return true; }

        return false;
      });

      if (!clicked) return null;

      // Wait for URL to change (navigation away from login page)
      try {
        await page.waitForFunction(
          (prevUrl: string) => window.location.href !== prevUrl,
          { timeout: 10_000 },
          currentUrl,
        );
      } catch {
        // Navigation may not have changed the URL (e.g. SPAs that stay on the same route)
        // Continue anyway and extract whatever content is available
      }

      // Wait a moment for the page to settle
      await new Promise((r) => setTimeout(r, 1_500));

      const authenticatedUrl = page.url();

      // Extract content from the authenticated page
      const content = await page.evaluate((): { pageTitle: string | null; h1: string | null; navItems: string[] } => {
        const pageTitle = document.title || null;

        const h1El = document.querySelector("h1");
        const h1 = h1El ? (h1El.textContent ?? "").trim() || null : null;

        // Collect nav link text (max 20)
        const navLinks = Array.from(document.querySelectorAll("nav a, [role='navigation'] a, header a"))
          .map((el) => (el.textContent ?? "").trim())
          .filter((t) => t.length > 0 && t.length < 80)
          .slice(0, 20);

        return { pageTitle, h1, navItems: navLinks };
      });

      return summariseAuthenticatedPage({
        pageTitle: content.pageTitle,
        h1: content.h1,
        navItems: content.navItems,
        authenticatedUrl,
      });
    } catch {
      return null;
    }
  };

  try {
    return await Promise.race([
      run(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), AGENT_TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}
