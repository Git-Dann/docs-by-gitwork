/**
 * The ONE way to launch headless Chromium. Every puppeteer caller must use this.
 *
 * Why this exists: production runs on a musl-libc **Alpine** container, and
 * `@sparticuz/chromium`'s bundled binary is glibc-linked (built for AWS Lambda's
 * Amazon Linux). It physically cannot run there — the two libc ABIs are
 * incompatible, and no installable library fixes it. So the Dockerfile installs
 * Alpine's own Chromium and sets `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`
 * (Puppeteer's documented fix for this exact case — https://pptr.dev/troubleshooting).
 *
 * The trap: that env var has to actually be READ at the launch site. It was
 * wired into the Docs/proposals PDF routes but not the Pulse PDF route or the
 * Pulse browser agents, so those three silently launched the unusable Lambda
 * binary — surfacing as "Navigating frame was detached" on the Pulse PDF, and
 * as quietly-missing screenshots/auth checks in the agents (they swallow
 * errors by design). Centralising the launch means a new caller can't get it
 * wrong, and the Alpine/Lambda reasoning lives in one place.
 *
 * The `@sparticuz/chromium` path is kept as the fallback for any environment
 * where no native binary is present (serverless, or a local machine).
 */

import type { Browser } from "puppeteer-core";

export interface LaunchOptions {
  /** Viewport for pages created from this browser. */
  defaultViewport?: { width: number; height: number } | null;
}

/**
 * Args for a native (distro-installed) Chromium running inside a container.
 * `chromium.args` from @sparticuz/chromium is tuned for Lambda and assumes its
 * own binary/paths, so it isn't the right set for the native one.
 */
const NATIVE_CONTAINER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-software-rasterizer",
  "--no-zygote",
];

/**
 * Launch Chromium, preferring a native binary via PUPPETEER_EXECUTABLE_PATH and
 * falling back to the bundled @sparticuz build. Caller owns `browser.close()`.
 */
export async function launchHeadlessBrowser(options: LaunchOptions = {}): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;
  const nativePath = process.env.PUPPETEER_EXECUTABLE_PATH;

  if (nativePath) {
    return puppeteer.launch({
      args: NATIVE_CONTAINER_ARGS,
      executablePath: nativePath,
      headless: true,
      ...(options.defaultViewport !== undefined
        ? { defaultViewport: options.defaultViewport }
        : {}),
    });
  }

  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
    ...(options.defaultViewport !== undefined ? { defaultViewport: options.defaultViewport } : {}),
  });
}
