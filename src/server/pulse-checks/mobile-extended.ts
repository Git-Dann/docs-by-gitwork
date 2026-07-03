import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, platformIs, skip } from "./_types";

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
  const hasReducedMotion = /prefers-reduced-motion/i.test(html);
  checks.push({ category: CATEGORIES.MOBILE, checkKey: "reduced_motion_css", label: "prefers-reduced-motion CSS", status: hasReducedMotion ? "PASS" : "WARN", detail: hasReducedMotion ? "prefers-reduced-motion media query detected." : "No prefers-reduced-motion CSS — users with vestibular disorders need a way to reduce animations (WCAG 2.3.3)." });

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
  const isIosApp = platformIs(ctx.platform, "IOS_APP") || ctx.ctx.isMobileApp;
  checks.push({ category: CATEGORIES.MOBILE, checkKey: "apple_app_clip_support", label: "App Clips support (iOS)", status: isIosApp ? (hasAppClips ? "PASS" : "WARN") : "PASS", detail: isIosApp ? (hasAppClips ? "App Clips signals detected." : "iOS app signals detected but no App Clips — App Clips enable instant app experiences without full installation, great for onboarding.") : "Not applicable." });

  // Android Instant Apps
  const hasInstantApp = /instant.*app|android.*instant|intent.*instant/i.test(html);
  const isAndroidApp = platformIs(ctx.platform, "ANDROID_APP") || ctx.ctx.isMobileApp;
  checks.push({ category: CATEGORIES.MOBILE, checkKey: "android_instant_app", label: "Android Instant Apps", status: isAndroidApp ? (hasInstantApp ? "PASS" : "WARN") : "PASS", detail: isAndroidApp ? (hasInstantApp ? "Android Instant App signals detected." : "Android app signals detected but no Instant App — Android Instant Apps let users try your app without installing, reducing friction.") : "Not applicable." });

  return checks;
}
