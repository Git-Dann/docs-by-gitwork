import { CATEGORIES } from "./categories";
import { fetchScannableUrl } from "@/server/pulse-lite/url-guard";
import { type ExtendedCheckContext, type PulseScanCheckInput, platformIs, probeInconclusive, skip } from "./_types";

const MAX_STYLESHEETS = 40;
const STYLESHEET_READ_TIMEOUT_MS = 8_000;
const STYLESHEET_READ_MAX_BYTES = 2_000_000;

/**
 * Looks for a CSS pattern in the stylesheets the page links. Media-query support
 * (prefers-reduced-motion etc.) almost always ships in external CSS bundles, so
 * testing the HTML alone reported it missing on github.com, linear.app and
 * bolt.new, which all have it.
 *
 * Returns "unknown" when a stylesheet could not be read (network error, timeout,
 * 403, 429, 5xx), because an unread stylesheet is not evidence of absence. A 404 or
 * 410 stylesheet does not exist and the browser applies nothing from it, so it counts
 * as read and empty: one stale link must not turn a real WARN into INCONCLUSIVE.
 */
/**
 * true / false = the stylesheet was read (or does not exist); null = it could not be read.
 * The read is bounded in time AND size, both covering the body: a page can link a slow
 * or multi-megabyte stylesheet, and fetchWithTimeout's deadline ends when headers arrive.
 * A body cut off by either bound without a match is null, never "absent".
 */
async function stylesheetContains(url: string, pattern: RegExp): Promise<boolean | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STYLESHEET_READ_TIMEOUT_MS);
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error("stylesheet read timed out")), { once: true });
  });
  aborted.catch(() => {});
  try {
    const res = await fetchScannableUrl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Gitwork-Pulse/1.0" },
    });
    if (res.status === 404 || res.status === 410) return false;
    if (!res.ok) return null;
    // A soft-routed missing file answers 200 with the site's HTML shell. Browsers refuse to
    // apply text/html as a stylesheet, so it contributes nothing — the same as a 404.
    if ((res.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) return false;
    const reader = res.body?.getReader();
    if (!reader) return false;
    const decoder = new TextDecoder();
    let text = "";
    let bytes = 0;
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      if (!value) continue;
      bytes += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (pattern.test(text)) {
        reader.cancel().catch(() => {});
        return true;
      }
      if (bytes >= STYLESHEET_READ_MAX_BYTES) {
        reader.cancel().catch(() => {});
        return null;
      }
    }
    return pattern.test(text + decoder.decode());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function findInLinkedStylesheets(
  html: string,
  baseUrl: string,
  pattern: RegExp,
): Promise<"found" | "absent" | "unknown"> {
  const hrefs = new Set<string>();
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const isStyle = /\brel\s*=\s*["']?[^"'>]*\bstylesheet\b/i.test(tag) || /\bas\s*=\s*["']?style\b/i.test(tag);
    if (!isStyle) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? tag.match(/\bhref\s*=\s*([^\s"'>]+)/i)?.[1];
    if (!href) continue;
    try {
      hrefs.add(new URL(href.replace(/&amp;/g, "&"), baseUrl).toString());
    } catch {
      /* unparseable href */
    }
  }
  if (hrefs.size === 0) return "absent";
  const urls = [...hrefs].slice(0, MAX_STYLESHEETS);
  const results = await Promise.all(urls.map((url) => stylesheetContains(url, pattern)));
  if (results.some((r) => r === true)) return "found";
  if (results.some((r) => r === null) || hrefs.size > MAX_STYLESHEETS) return "unknown";
  return "absent";
}

export async function runMobileExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  const html = ctx.pageResult.html;
  const checks: PulseScanCheckInput[] = [];

  if (platformIs(ctx.platform, "API_BACKEND", "CLI_TOOL")) {
    return skip(CATEGORIES.MOBILE, [
      ["web_push_notifications", "Web Push Notifications support"],
      ["push_permission_polite", "Polite push permission prompt"],
      ["offline_mode_capable", "Service worker offline support"],
      ["reduced_motion_css", "prefers-reduced-motion CSS"],
      ["high_contrast_css", "prefers-contrast CSS"],
      ["biometric_auth_signals", "WebAuthn biometric auth signals"],
      ["screen_reader_tested_signal", "Accessibility testing evidence"],
      ["gesture_navigation", "Swipe / gesture navigation"],
      ["apple_app_clip_support", "App Clips support (iOS)"],
      ["android_instant_app", "Android Instant Apps"],
    ], "Not applicable for this platform type.");
  }

  // Web Push
  const hasWebPush = /web.*push|push.*notification|service.*worker.*push|notification.*permission|\"push\"/i.test(html);
  checks.push({ category: CATEGORIES.MOBILE, checkKey: "web_push_notifications", label: "Web Push Notifications support", status: hasWebPush ? "PASS" : "WARN", detail: hasWebPush ? "Web Push Notifications signals detected." : "No Web Push support detected — Web Push is a high-engagement re-activation channel for web apps, now supported on all major platforms including iOS 16.4+." });

  // Polite push permission
  const hasImmediatePush = /Notification\.requestPermission\s*\(\s*\)/i.test(html) || /requestPermission.*onload|requestPermission.*DOMContentLoaded/i.test(html);
  checks.push({ category: CATEGORIES.MOBILE, checkKey: "push_permission_polite", label: "Polite push permission prompt", status: hasImmediatePush ? "WARN" : "PASS", detail: hasImmediatePush ? "Immediate push permission request detected — browsers may suppress or block immediate permission prompts. Trigger after user interaction." : "No immediate push permission trigger detected." });

  // Offline mode
  const hasServiceWorker = /service.?worker|workbox|offline.*capable|cache.*api.*service|pwa.*offline/i.test(html) || /navigator\.serviceWorker/i.test(html);
  checks.push({ category: CATEGORIES.MOBILE, checkKey: "offline_mode_capable", label: "Service worker offline support", status: hasServiceWorker ? "PASS" : "WARN", detail: hasServiceWorker ? "Service worker / offline capability signals detected." : "No service worker signals — offline support via service workers enables PWA-grade reliability and app store distribution." });

  // prefers-reduced-motion
  const reducedMotion = /prefers-reduced-motion/i.test(html)
    ? "found"
    : await findInLinkedStylesheets(html, ctx.pageResult.finalUrl || ctx.httpsUrl, /prefers-reduced-motion/i);
  if (reducedMotion === "unknown") {
    checks.push(probeInconclusive(CATEGORIES.MOBILE, "reduced_motion_css", "prefers-reduced-motion CSS", "One or more linked stylesheets could not be read, so the absence of a prefers-reduced-motion query cannot be established."));
  } else {
    const hasReducedMotion = reducedMotion === "found";
    checks.push({ category: CATEGORIES.MOBILE, checkKey: "reduced_motion_css", label: "prefers-reduced-motion CSS", status: hasReducedMotion ? "PASS" : "WARN", detail: hasReducedMotion ? "prefers-reduced-motion media query detected." : "No prefers-reduced-motion CSS in the page or its linked stylesheets — users with vestibular disorders need a way to reduce animations (WCAG 2.3.3, AAA)." });
  }

  // prefers-contrast
  const hasHighContrast = /prefers-contrast/i.test(html);
  checks.push({ category: CATEGORIES.MOBILE, checkKey: "high_contrast_css", label: "prefers-contrast CSS media query", status: hasHighContrast ? "PASS" : "WARN", detail: hasHighContrast ? "prefers-contrast media query detected." : "No prefers-contrast CSS — support high-contrast mode for users with low vision." });

  // Biometric auth
  const hasBiometric = /webauthn|passkey|fido2|fingerprint.*auth|face.*id.*login|biometric/i.test(html);
  checks.push({ category: CATEGORIES.MOBILE, checkKey: "biometric_auth_signals", label: "WebAuthn biometric auth signals", status: hasBiometric ? "PASS" : "WARN", detail: hasBiometric ? "Biometric / WebAuthn signals detected." : "No biometric auth signals — WebAuthn biometric login (fingerprint, Face ID) improves mobile security and conversion." });

  // Screen reader tested
  const hasA11yTesting = /axe|lighthouse.*accessibility|wave.*accessibility|screen.*reader.*tested|accessibility.*tested|a11y.*tested/i.test(html);
  checks.push({ category: CATEGORIES.MOBILE, checkKey: "screen_reader_tested_signal", label: "Accessibility testing evidence", status: hasA11yTesting ? "PASS" : "WARN", detail: hasA11yTesting ? "Accessibility testing tool signals detected." : "No accessibility testing evidence — integrate axe, Lighthouse accessibility audits, or manual screen reader testing into your CI pipeline." });

  // Gesture navigation
  const hasGestures = /swipe|gesture|touch.*navigate|drag.*drop|hammerjs|touch.*event/i.test(html);
  checks.push({ category: CATEGORIES.MOBILE, checkKey: "gesture_navigation", label: "Swipe / gesture navigation", status: hasGestures ? "PASS" : "WARN", detail: hasGestures ? "Gesture navigation signals detected." : "No gesture navigation detected — swipe gestures are expected in mobile-first apps; consider swipe-to-go-back and pull-to-refresh." });

  // App Clips (iOS)
  const hasAppClips = /app.*clip|appclip|apple.*app.*clip/i.test(html) || /<meta[^>]+name=["']apple-itunes-app["'][^>]*app-clip/i.test(html);
  // CROSS_PLATFORM_MOBILE counts as both targets: a React Native / Flutter app ships
  // an iOS build and an Android build, so it is in scope for both platforms' features.
  const isIosApp = platformIs(ctx.platform, "IOS_APP", "CROSS_PLATFORM_MOBILE") || ctx.ctx.isMobileApp;
  checks.push({ category: CATEGORIES.MOBILE, checkKey: "apple_app_clip_support", label: "App Clips support (iOS)", status: isIosApp ? (hasAppClips ? "PASS" : "WARN") : "PASS", detail: isIosApp ? (hasAppClips ? "App Clips signals detected." : "iOS app signals detected but no App Clips — App Clips enable instant app experiences without full installation, great for onboarding.") : "Not applicable." });

  // Android Instant Apps
  const hasInstantApp = /instant.*app|android.*instant|intent.*instant/i.test(html);
  const isAndroidApp = platformIs(ctx.platform, "ANDROID_APP", "CROSS_PLATFORM_MOBILE") || ctx.ctx.isMobileApp;
  checks.push({ category: CATEGORIES.MOBILE, checkKey: "android_instant_app", label: "Android Instant Apps", status: isAndroidApp ? (hasInstantApp ? "PASS" : "WARN") : "PASS", detail: isAndroidApp ? (hasInstantApp ? "Android Instant App signals detected." : "Android app signals detected but no Instant App — Android Instant Apps let users try your app without installing, reducing friction.") : "Not applicable." });

  return checks;
}
