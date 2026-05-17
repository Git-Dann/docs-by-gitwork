import { safeGithubRequest, parseGithubRepo } from "@/lib/github";
import type { PulseScanCheckInput, PulseScanInputType } from "@/types/pulse";

export const SCAN_VERSION = "pulse-v1";

const FETCH_TIMEOUT_MS = 10_000;

type UrlType = "web" | "app_store" | "play_store";

function detectUrlType(url: string): UrlType {
  const lower = url.toLowerCase();
  if (lower.includes("apps.apple.com") || lower.includes("itunes.apple.com")) return "app_store";
  if (lower.includes("play.google.com/store/apps")) return "play_store";
  return "web";
}

type FetchResult = {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  html: string;
  responseTimeMs: number;
  finalUrl: string;
};

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPage(url: string): Promise<FetchResult | null> {
  try {
    const start = Date.now();
    const response = await fetchWithTimeout(url, {
      redirect: "follow",
      headers: { "User-Agent": "Gitwork-Pulse/1.0" },
    });
    const responseTimeMs = Date.now() - start;
    const html = await response.text().catch(() => "");
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return { ok: response.ok, status: response.status, headers, html, responseTimeMs, finalUrl: response.url };
  } catch {
    return null;
  }
}

async function headRequest(url: string): Promise<number> {
  try {
    const response = await fetchWithTimeout(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "Gitwork-Pulse/1.0" },
    });
    return response.status;
  } catch {
    return 0;
  }
}

function detectTechStack(headers: Record<string, string>, html: string): string[] {
  const stack: string[] = [];

  if (headers["x-vercel-id"]) stack.push("Vercel");
  if (headers["x-powered-by"]?.toLowerCase().includes("next")) stack.push("Next.js");
  if (headers["x-powered-by"]?.toLowerCase().includes("express")) stack.push("Express");
  if (headers["cf-ray"]) stack.push("Cloudflare");
  if (headers["server"]?.toLowerCase().includes("nginx")) stack.push("Nginx");
  if (headers["server"]?.toLowerCase().includes("apache")) stack.push("Apache");

  if (html.includes("__NEXT_DATA__") || html.includes("_next/static")) stack.push("Next.js");
  if (html.includes("nuxt") || html.includes("__NUXT__")) stack.push("Nuxt.js");
  if (html.includes("svelte") || html.includes("_svelte")) stack.push("Svelte");
  if (html.includes("gatsby")) stack.push("Gatsby");
  if (html.includes("react")) stack.push("React");
  if (html.includes("vue")) stack.push("Vue");
  if (html.includes("js.stripe.com") || html.includes("stripe")) stack.push("Stripe");
  if (html.includes("supabase")) stack.push("Supabase");
  if (html.includes("firebase")) stack.push("Firebase");
  if (html.includes("clerk")) stack.push("Clerk");
  if (html.includes("next-auth") || html.includes("nextauth")) stack.push("NextAuth");
  if (html.includes("plausible.io")) stack.push("Plausible");
  if (html.includes("posthog")) stack.push("PostHog");
  if (html.includes("gtag") || html.includes("google-analytics") || html.includes("_ga")) stack.push("Google Analytics");
  if (html.includes("sentry")) stack.push("Sentry");
  if (html.includes("intercom")) stack.push("Intercom");

  return [...new Set(stack)];
}

type ProjectContext = {
  isPaymentEnabled: boolean;
  isAuthEnabled: boolean;
  isSaas: boolean;
  isMobileApp: boolean;
  hasBackend: boolean;
};

function detectProjectContext(html: string, headers: Record<string, string>): ProjectContext {
  const lower = html.toLowerCase();

  const isPaymentEnabled =
    lower.includes("js.stripe.com") || lower.includes("stripe") || lower.includes("paddle") ||
    lower.includes("lemon squeezy") ||
    ["/pricing", "/billing", "/checkout", "/subscribe", "/plans"].some(
      (p) => lower.includes(`href="${p}`) || lower.includes(`href='${p}`),
    );

  const isAuthEnabled =
    ["/login", "/signin", "/sign-in", "/signup", "/sign-up", "/auth", "/register"].some(
      (p) => lower.includes(`href="${p}`) || lower.includes(`href='${p}`),
    ) || ["clerk", "next-auth", "nextauth", "supabase", "auth0", "lucia", "kinde"].some((p) => lower.includes(p));

  const isSaas =
    (isPaymentEnabled || isAuthEnabled) &&
    (lower.includes("subscription") || lower.includes("/mo") || lower.includes("per month") ||
      lower.includes("free trial") || lower.includes("dashboard") || lower.includes("/app/") ||
      lower.includes(`href="/app"`) || lower.includes("upgrade") || lower.includes("pricing plan") ||
      lower.includes("your account"));

  const isMobileApp =
    lower.includes("apps.apple.com") || lower.includes("play.google.com/store/apps") ||
    /rel=["']apple-touch-icon["']/i.test(html) || lower.includes("app store") ||
    lower.includes("google play") || lower.includes("download the app") ||
    lower.includes("download on the") || /name=["']apple-itunes-app["']/i.test(html);

  const hasBackend =
    !!headers["x-powered-by"] || !!headers["x-vercel-id"] || !!headers["cf-ray"] ||
    lower.includes("/api/") || isAuthEnabled || isPaymentEnabled;

  return { isPaymentEnabled, isAuthEnabled, isSaas, isMobileApp, hasBackend };
}

function skipChecks(
  checks: PulseScanCheckInput[],
  category: string,
  entries: Array<[string, string]>,
  reason: string,
): void {
  for (const [checkKey, label] of entries) {
    checks.push({ category, checkKey, label, status: "SKIPPED", detail: reason });
  }
}

async function runMobileStoreChecks(url: string, storeType: "app_store" | "play_store"): Promise<{ checks: PulseScanCheckInput[]; techStack: string[] }> {
  const checks: PulseScanCheckInput[] = [];
  const pageResult = await fetchPage(url);

  const html = pageResult?.html ?? "";
  const lower = html.toLowerCase();
  const isAppStore = storeType === "app_store";
  const storeLabel = isAppStore ? "App Store" : "Google Play";

  // App listed + reachable
  checks.push({
    category: "Store Listing",
    checkKey: "store_page_live",
    label: `${storeLabel} listing is live`,
    status: pageResult && pageResult.status < 400 ? "PASS" : "FAIL",
    detail: pageResult && pageResult.status < 400
      ? `${storeLabel} listing is publicly accessible.`
      : `${storeLabel} listing returned ${pageResult?.status ?? "no response"} — app may be unlisted or removed.`,
  });

  if (!pageResult || pageResult.status >= 400) {
    return { checks: checks.map((c, i) => ({ ...c, sortOrder: i })), techStack: [] };
  }

  // App name / title
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1];
  const hasTitle = Boolean(ogTitle && ogTitle.length > 2);
  checks.push({
    category: "Store Listing",
    checkKey: "store_app_title",
    label: "App name / title",
    status: hasTitle ? "PASS" : "WARN",
    detail: hasTitle ? `App title detected: "${ogTitle}".` : "Could not detect app title in store listing.",
    evidence: ogTitle ?? undefined,
  });

  // Description quality
  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{20,})["']/i)?.[1]
    ?? html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{20,})["']/i)?.[1];
  const descLength = ogDesc?.length ?? 0;
  checks.push({
    category: "Store Listing",
    checkKey: "store_description",
    label: "App description",
    status: descLength > 200 ? "PASS" : descLength > 50 ? "WARN" : "FAIL",
    detail: descLength > 200
      ? "App description is detailed and complete."
      : descLength > 50
        ? "App description is short — a longer description improves store discovery."
        : "No meaningful app description detected — required for store approval and discoverability.",
  });

  // Screenshots (og:image count as a signal)
  const ogImages = (html.match(/<meta[^>]+property=["']og:image["']/gi) ?? []).length;
  const hasScreenshots = isAppStore
    ? lower.includes("screenshot") || lower.includes("preview") || ogImages >= 1
    : lower.includes("screenshot") || ogImages >= 1;
  checks.push({
    category: "Store Listing",
    checkKey: "store_screenshots",
    label: "Screenshots / preview assets",
    status: hasScreenshots ? "PASS" : "FAIL",
    detail: hasScreenshots
      ? "Screenshot or preview assets detected in the listing."
      : "No screenshot assets detected — stores require at least 3–4 screenshots.",
  });

  // Ratings / reviews
  const hasRating = lower.includes("rating") || lower.includes("stars") || lower.includes("reviews")
    || lower.includes("rated") || /\d+(\.\d)?\s*(out of|\/)\s*5/i.test(html);
  checks.push({
    category: "Store Listing",
    checkKey: "store_ratings",
    label: "Ratings & reviews",
    status: hasRating ? "PASS" : "WARN",
    detail: hasRating
      ? "Rating or review data detected — social proof is present."
      : "No ratings detected. New apps won't have ratings, but they drive conversion significantly.",
  });

  // Privacy policy
  const hasPrivacy = lower.includes("privacy policy") || lower.includes("privacy-policy")
    || lower.includes("privacypolicy") || lower.includes("privacy_policy")
    || /privacy/i.test(html) && /policy/i.test(html);
  checks.push({
    category: "Store Listing",
    checkKey: "store_privacy_policy",
    label: "Privacy policy linked",
    status: hasPrivacy ? "PASS" : "FAIL",
    detail: hasPrivacy
      ? "Privacy policy reference detected — required by both stores."
      : "No privacy policy detected. Both Apple and Google require a privacy policy URL — this will block publishing.",
  });

  // Age / content rating
  const hasAgeRating = isAppStore
    ? lower.includes("rated") || lower.includes("age") || lower.includes("4+") || lower.includes("17+") || lower.includes("12+")
    : lower.includes("pegi") || lower.includes("rated for") || lower.includes("content rating") || lower.includes("everyone");
  checks.push({
    category: "Store Listing",
    checkKey: "store_age_rating",
    label: "Age / content rating",
    status: hasAgeRating ? "PASS" : "WARN",
    detail: hasAgeRating
      ? "Age/content rating detected in the listing."
      : "No content rating signals found — required by both stores and affects discoverability filters.",
  });

  // In-app purchases disclosure
  const hasIAP = lower.includes("in-app purchase") || lower.includes("in app purchase")
    || lower.includes("subscription") || lower.includes("offers in-app");
  checks.push({
    category: "Store Listing",
    checkKey: "store_iap_disclosed",
    label: "In-app purchases disclosed",
    status: "PASS", // presence or absence are both valid; just noting the state
    detail: hasIAP
      ? "In-app purchases or subscriptions are disclosed in the listing."
      : "No in-app purchase disclosures detected — if the app monetises, ensure this is declared.",
  });

  // App preview video (Apple) / promo video (Play)
  const hasVideo = lower.includes("preview") && (lower.includes("video") || lower.includes("mp4"))
    || lower.includes("app preview") || lower.includes("promo video");
  checks.push({
    category: "Store Listing",
    checkKey: "store_preview_video",
    label: isAppStore ? "App preview video" : "Promo video",
    status: hasVideo ? "PASS" : "WARN",
    detail: hasVideo
      ? "App preview/promo video detected — video significantly improves conversion."
      : "No preview video detected — a 15–30s video can increase install rates by 20–35%.",
  });

  if (isAppStore) {
    // App Store: subtitle (shown under title in search)
    const hasSubtitle = lower.includes("subtitle") || (ogTitle && ogTitle.includes(" - "));
    checks.push({
      category: "Store Listing",
      checkKey: "appstore_subtitle",
      label: "App subtitle (keyword field)",
      status: hasSubtitle ? "PASS" : "WARN",
      detail: hasSubtitle
        ? "App subtitle detected — this 30-character field is a key keyword placement."
        : "No subtitle detected — the App Store subtitle is valuable keyword real-estate for search ranking.",
    });

    // Apple privacy nutrition label
    const hasNutritionLabel = lower.includes("data used") || lower.includes("data not collected")
      || lower.includes("privacy practices") || lower.includes("data linked to you");
    checks.push({
      category: "Store Listing",
      checkKey: "appstore_privacy_label",
      label: "Apple privacy nutrition label",
      status: hasNutritionLabel ? "PASS" : "FAIL",
      detail: hasNutritionLabel
        ? "Privacy nutrition label sections detected — Apple requires this before publishing."
        : "No privacy nutrition label detected — Apple requires you to declare all data collection. Missing this will block App Review.",
    });
  } else {
    // Play Store: data safety section
    const hasDataSafety = lower.includes("data safety") || lower.includes("data shared")
      || lower.includes("data collected") || lower.includes("safety section");
    checks.push({
      category: "Store Listing",
      checkKey: "playstore_data_safety",
      label: "Data Safety section",
      status: hasDataSafety ? "PASS" : "FAIL",
      detail: hasDataSafety
        ? "Data Safety section detected — Google requires this to publish."
        : "No Data Safety section detected — Google Play requires all apps to declare data collection practices. Missing this blocks publishing.",
    });

    // Play Store: content rating (IARC)
    const hasIARC = lower.includes("iarc") || lower.includes("everyone") || lower.includes("teen")
      || lower.includes("mature 17+") || lower.includes("rated for 3+");
    checks.push({
      category: "Store Listing",
      checkKey: "playstore_content_rating",
      label: "IARC content rating",
      status: hasIARC ? "PASS" : "WARN",
      detail: hasIARC
        ? "Content rating detected — IARC questionnaire completed."
        : "No IARC content rating detected. Google Play requires a content rating questionnaire before the app can go live.",
    });
  }

  // Tech stack inference for mobile
  const techStack: string[] = [];
  if (isAppStore) {
    techStack.push("iOS");
    if (lower.includes("flutter")) techStack.push("Flutter");
    else if (lower.includes("react native")) techStack.push("React Native");
    else techStack.push("Swift / SwiftUI");
  } else {
    techStack.push("Android");
    if (lower.includes("flutter")) techStack.push("Flutter");
    else if (lower.includes("react native")) techStack.push("React Native");
    else techStack.push("Kotlin");
  }

  return {
    checks: checks.map((c, i) => ({ ...c, sortOrder: i })),
    techStack: [...new Set(techStack)],
  };
}

export async function runUrlChecks(url: string): Promise<{ checks: PulseScanCheckInput[]; techStack: string[] }> {
  const urlType = detectUrlType(url);
  if (urlType === "app_store" || urlType === "play_store") {
    return runMobileStoreChecks(url, urlType);
  }

  const checks: PulseScanCheckInput[] = [];

  const httpsUrl = url.startsWith("http://") ? url.replace("http://", "https://") : url;
  const httpUrl = httpsUrl.replace("https://", "http://");

  const pageResult = await fetchPage(httpsUrl);

  // Infrastructure
  checks.push({
    category: "Infrastructure",
    checkKey: "ssl_valid",
    label: "HTTPS / SSL certificate",
    status: pageResult ? "PASS" : "FAIL",
    detail: pageResult ? "HTTPS connection succeeded." : "HTTPS connection failed or certificate error.",
    evidence: httpsUrl,
  });

  if (pageResult) {
    const ctx = detectProjectContext(pageResult.html, pageResult.headers);
    const redir = await headRequest(httpUrl);
    checks.push({
      category: "Infrastructure",
      checkKey: "http_redirect",
      label: "HTTP → HTTPS redirect",
      status: redir >= 300 && redir < 400 ? "PASS" : "WARN",
      detail: redir >= 300 && redir < 400
        ? "HTTP redirects to HTTPS."
        : "HTTP does not redirect to HTTPS.",
      evidence: `HTTP status: ${redir || "no response"}`,
    });

    const rt = pageResult.responseTimeMs;
    checks.push({
      category: "Infrastructure",
      checkKey: "response_time",
      label: "Response time",
      status: rt < 2000 ? "PASS" : rt < 5000 ? "WARN" : "FAIL",
      detail: `Page loaded in ${rt}ms.`,
      evidence: `${rt}ms`,
    });

    checks.push({
      category: "Infrastructure",
      checkKey: "status_200",
      label: "Returns 200 OK",
      status: pageResult.status === 200 ? "PASS" : pageResult.status < 400 ? "WARN" : "FAIL",
      detail: `HTTP status ${pageResult.status}.`,
      evidence: String(pageResult.status),
    });

    const hostname = new URL(httpsUrl).hostname;
    const platformSuffixes = [".vercel.app", ".netlify.app", ".railway.app", ".render.com", ".fly.dev", ".pages.dev", ".onrender.com"];
    const hasCustomDomain = !platformSuffixes.some((suffix) => hostname.endsWith(suffix));
    checks.push({
      category: "Infrastructure",
      checkKey: "custom_domain",
      label: "Custom domain",
      status: hasCustomDomain ? "PASS" : "WARN",
      detail: hasCustomDomain ? "Custom domain detected." : `Hosting on a platform subdomain (${hostname}).`,
      evidence: hostname,
    });

    const cdnHeaders = ["x-vercel-id", "cf-ray", "x-amz-cf-id", "x-cache", "x-fastly-request-id"];
    const cdnDetected = cdnHeaders.find((h) => pageResult.headers[h]);
    checks.push({
      category: "Infrastructure",
      checkKey: "cdn_detected",
      label: "CDN present",
      status: cdnDetected ? "PASS" : "WARN",
      detail: cdnDetected ? `CDN detected via ${cdnDetected} header.` : "No CDN headers detected.",
      evidence: cdnDetected ? `${cdnDetected}: ${pageResult.headers[cdnDetected]}` : undefined,
    });

    // SEO
    const title = pageResult.html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
    checks.push({
      category: "SEO",
      checkKey: "meta_title",
      label: "<title> tag",
      status: title ? "PASS" : "FAIL",
      detail: title ? `Title: "${title}"` : "No <title> tag found.",
      evidence: title ?? undefined,
    });

    const metaDesc = pageResult.html.match(/<meta\s+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]?.trim()
      ?? pageResult.html.match(/<meta\s+content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1]?.trim();
    checks.push({
      category: "SEO",
      checkKey: "meta_description",
      label: "Meta description",
      status: metaDesc ? "PASS" : "WARN",
      detail: metaDesc ? `Description found (${metaDesc.length} chars).` : "No meta description tag.",
      evidence: metaDesc ?? undefined,
    });

    const hasOg = pageResult.html.includes('property="og:') || pageResult.html.includes("property='og:");
    checks.push({
      category: "SEO",
      checkKey: "og_tags",
      label: "Open Graph tags",
      status: hasOg ? "PASS" : "WARN",
      detail: hasOg ? "Open Graph tags found." : "No Open Graph tags detected.",
    });

    const hasCanonical = pageResult.html.includes('rel="canonical"') || pageResult.html.includes("rel='canonical'");
    checks.push({
      category: "SEO",
      checkKey: "canonical_url",
      label: "Canonical URL",
      status: hasCanonical ? "PASS" : "WARN",
      detail: hasCanonical ? "Canonical URL tag found." : "No canonical URL tag.",
    });

    const hasH1 = /<h1[\s>]/i.test(pageResult.html);
    checks.push({
      category: "SEO",
      checkKey: "h1_present",
      label: "H1 heading",
      status: hasH1 ? "PASS" : "WARN",
      detail: hasH1 ? "H1 heading found." : "No H1 heading found.",
    });

    const robotsStatus = await headRequest(`${httpsUrl.replace(/\/$/, "")}/robots.txt`);
    checks.push({
      category: "SEO",
      checkKey: "has_robots_txt",
      label: "robots.txt",
      status: robotsStatus === 200 ? "PASS" : "WARN",
      detail: robotsStatus === 200 ? "robots.txt found." : "No robots.txt detected.",
      evidence: `Status: ${robotsStatus || "no response"}`,
    });

    const sitemapStatus = await headRequest(`${httpsUrl.replace(/\/$/, "")}/sitemap.xml`);
    checks.push({
      category: "SEO",
      checkKey: "has_sitemap",
      label: "sitemap.xml",
      status: sitemapStatus === 200 ? "PASS" : "WARN",
      detail: sitemapStatus === 200 ? "sitemap.xml found." : "No sitemap detected.",
      evidence: `Status: ${sitemapStatus || "no response"}`,
    });

    // Security
    const csp = pageResult.headers["content-security-policy"];
    checks.push({
      category: "Security",
      checkKey: "csp_header",
      label: "Content-Security-Policy",
      status: csp ? "PASS" : "WARN",
      detail: csp ? "CSP header present." : "No Content-Security-Policy header.",
    });

    const hsts = pageResult.headers["strict-transport-security"];
    checks.push({
      category: "Security",
      checkKey: "hsts_header",
      label: "HSTS header",
      status: hsts ? "PASS" : "WARN",
      detail: hsts ? "HSTS header present." : "No Strict-Transport-Security header.",
      evidence: hsts ?? undefined,
    });

    const xfo = pageResult.headers["x-frame-options"];
    checks.push({
      category: "Security",
      checkKey: "x_frame_options",
      label: "Clickjacking protection",
      status: xfo ? "PASS" : "WARN",
      detail: xfo ? `X-Frame-Options: ${xfo}` : "No X-Frame-Options header.",
      evidence: xfo ?? undefined,
    });

    const envStatus = await headRequest(`${httpsUrl.replace(/\/$/, "")}/.env`);
    checks.push({
      category: "Security",
      checkKey: "no_exposed_env",
      label: ".env not public",
      status: envStatus !== 200 ? "PASS" : "FAIL",
      detail: envStatus !== 200 ? ".env file is not publicly accessible." : ".env file appears to be publicly accessible.",
      evidence: `Status: ${envStatus || "no response"}`,
    });

    const gitStatus = await headRequest(`${httpsUrl.replace(/\/$/, "")}/.git/HEAD`);
    checks.push({
      category: "Security",
      checkKey: "no_exposed_git",
      label: ".git directory not public",
      status: gitStatus !== 200 ? "PASS" : "FAIL",
      detail: gitStatus !== 200 ? ".git directory is not publicly accessible." : ".git directory appears exposed.",
      evidence: `Status: ${gitStatus || "no response"}`,
    });

    // Performance
    const encoding = pageResult.headers["content-encoding"];
    checks.push({
      category: "Performance",
      checkKey: "compression",
      label: "Gzip/Brotli compression",
      status: encoding ? "PASS" : "WARN",
      detail: encoding ? `Compression enabled (${encoding}).` : "No compression detected.",
      evidence: encoding ?? undefined,
    });

    const cacheControl = pageResult.headers["cache-control"];
    checks.push({
      category: "Performance",
      checkKey: "caching_headers",
      label: "Cache-Control headers",
      status: cacheControl ? "PASS" : "WARN",
      detail: cacheControl ? `Cache-Control: ${cacheControl}` : "No Cache-Control header.",
      evidence: cacheControl ?? undefined,
    });

    // Payments & Auth
    const hasStripe = pageResult.html.includes("js.stripe.com") || pageResult.html.includes("stripe");
    checks.push({
      category: "Payments",
      checkKey: "stripe_signals",
      label: "Stripe integration",
      status: hasStripe ? "PASS" : "WARN",
      detail: hasStripe ? "Stripe detected in page source." : "No Stripe integration detected.",
    });

    const paymentLinks = ["/pricing", "/billing", "/subscribe", "/checkout", "/plans"];
    const hasPricingPage = paymentLinks.some((path) =>
      pageResult.html.toLowerCase().includes(`href="${path}`) ||
      pageResult.html.toLowerCase().includes(`href='${path}`),
    );
    checks.push({
      category: "Payments",
      checkKey: "pricing_page",
      label: "Pricing/billing UI",
      status: hasPricingPage ? "PASS" : "WARN",
      detail: hasPricingPage ? "Pricing or billing page links detected." : "No pricing/billing page links found.",
    });

    const authLinks = ["/login", "/signin", "/sign-in", "/signup", "/sign-up", "/auth", "/register"];
    const hasAuth = authLinks.some((path) =>
      pageResult.html.toLowerCase().includes(`href="${path}`) ||
      pageResult.html.toLowerCase().includes(`href='${path}`),
    );
    checks.push({
      category: "Authentication",
      checkKey: "auth_ui_signals",
      label: "Login/signup UI",
      status: hasAuth ? "PASS" : "WARN",
      detail: hasAuth ? "Login or signup links detected." : "No login/signup links detected.",
    });

    const authProviders = ["clerk", "next-auth", "nextauth", "supabase", "auth0", "lucia", "kinde"];
    const hasOAuthSignals = authProviders.some((p) => pageResult.html.toLowerCase().includes(p));
    checks.push({
      category: "Authentication",
      checkKey: "oauth_signals",
      label: "Auth provider",
      status: hasOAuthSignals ? "PASS" : "WARN",
      detail: hasOAuthSignals ? "Auth provider detected in page source." : "No known auth provider detected.",
    });

    // Observability
    const errorTools = ["sentry", "bugsnag", "logrocket", "rollbar", "datadog"];
    const hasErrorMonitoring = errorTools.some((t) => pageResult.html.toLowerCase().includes(t));
    checks.push({
      category: "Observability",
      checkKey: "error_monitoring",
      label: "Error monitoring",
      status: hasErrorMonitoring ? "PASS" : "WARN",
      detail: hasErrorMonitoring ? "Error monitoring tool detected." : "No error monitoring detected (Sentry, Bugsnag, etc.).",
    });

    const analyticsTools = ["gtag", "plausible.io", "posthog", "mixpanel", "amplitude", "_ga"];
    const hasAnalytics = analyticsTools.some((t) => pageResult.html.toLowerCase().includes(t));
    checks.push({
      category: "Observability",
      checkKey: "analytics_present",
      label: "Analytics",
      status: hasAnalytics ? "PASS" : "WARN",
      detail: hasAnalytics ? "Analytics tool detected." : "No analytics detected (GA4, Plausible, PostHog, etc.).",
    });

    const healthEndpointStatus = await headRequest(`${httpsUrl.replace(/\/$/, "")}/api/health`);
    const healthAltStatus = healthEndpointStatus !== 200
      ? await headRequest(`${httpsUrl.replace(/\/$/, "")}/health`)
      : 200;
    checks.push({
      category: "Observability",
      checkKey: "health_endpoint",
      label: "/health endpoint",
      status: healthEndpointStatus === 200 || healthAltStatus === 200 ? "PASS" : "WARN",
      detail:
        healthEndpointStatus === 200 || healthAltStatus === 200
          ? "Health check endpoint found."
          : "No /health or /api/health endpoint detected.",
    });

    // Legal & Compliance
    const htmlLower = pageResult.html.toLowerCase();
    const hasPrivacy = ["/privacy", "/privacy-policy", "/legal/privacy", "/legal"].some((p) =>
      htmlLower.includes(`href="${p}"`) || htmlLower.includes(`href='${p}'`) ||
      htmlLower.includes(`href="${p} `) || htmlLower.includes(`href="${p}>`),
    );
    checks.push({
      category: "Legal & Compliance",
      checkKey: "privacy_policy",
      label: "Privacy Policy",
      status: hasPrivacy ? "PASS" : "FAIL",
      detail: hasPrivacy
        ? "Privacy policy link detected."
        : "No privacy policy link — required for GDPR, CCPA, and app store distribution.",
    });

    const hasToS = ["/terms", "/tos", "/terms-of-service", "/terms-and-conditions", "/legal/terms"].some((p) =>
      htmlLower.includes(`href="${p}"`) || htmlLower.includes(`href='${p}'`) ||
      htmlLower.includes(`href="${p} `) || htmlLower.includes(`href="${p}>`),
    );
    checks.push({
      category: "Legal & Compliance",
      checkKey: "terms_of_service",
      label: "Terms of Service",
      status: hasToS ? "PASS" : "FAIL",
      detail: hasToS
        ? "Terms of service link detected."
        : "No terms of service — required for any product collecting payments or user data.",
    });

    const hasCookieBanner = ["cookiebot", "osano", "onetrust", "cookie-consent", "cookieconsent", "cookie_notice", "gdpr"].some((s) =>
      htmlLower.includes(s),
    );
    const hasCookieLink = ["/cookie-policy", "/cookies", "/legal/cookies"].some((p) =>
      htmlLower.includes(`href="${p}`) || htmlLower.includes(`href='${p}`),
    );
    checks.push({
      category: "Legal & Compliance",
      checkKey: "cookie_consent",
      label: "Cookie consent / GDPR",
      status: hasCookieBanner || hasCookieLink ? "PASS" : "WARN",
      detail: hasCookieBanner || hasCookieLink
        ? "Cookie consent or GDPR compliance mechanism detected."
        : "No cookie consent mechanism — required for EU/UK markets and ad platform compliance.",
    });

    const hasRefundPolicy = ["/refund", "/refund-policy", "/cancellation", "/money-back", "/return-policy"].some((p) =>
      htmlLower.includes(`href="${p}`) || htmlLower.includes(`href='${p}`),
    );
    checks.push({
      category: "Legal & Compliance",
      checkKey: "refund_policy",
      label: "Refund / Cancellation policy",
      status: hasRefundPolicy ? "PASS" : "WARN",
      detail: hasRefundPolicy
        ? "Refund or cancellation policy link detected."
        : "No refund policy — recommended for payment processor compliance and reducing chargebacks.",
    });

    // Missing Pages — batch HEAD requests in parallel
    const baseUrl = httpsUrl.replace(/\/$/, "");
    const [aboutStatus, contactStatus, faqStatus, statusPageStatus, changelogStatus] = await Promise.all([
      headRequest(`${baseUrl}/about`),
      headRequest(`${baseUrl}/contact`),
      headRequest(`${baseUrl}/faq`),
      headRequest(`${baseUrl}/status`),
      headRequest(`${baseUrl}/changelog`),
    ]);

    checks.push({
      category: "Missing Pages",
      checkKey: "about_page",
      label: "About / Team page",
      status: aboutStatus === 200 ? "PASS" : "WARN",
      detail: aboutStatus === 200
        ? "/about page found."
        : "No /about page — builds team credibility and brand trust with prospects.",
      evidence: `Status: ${aboutStatus || "no response"}`,
    });

    checks.push({
      category: "Missing Pages",
      checkKey: "contact_page",
      label: "Contact page",
      status: contactStatus === 200 ? "PASS" : "WARN",
      detail: contactStatus === 200
        ? "/contact page found."
        : "No /contact page — users need a way to reach you for support and sales inquiries.",
      evidence: `Status: ${contactStatus || "no response"}`,
    });

    checks.push({
      category: "Missing Pages",
      checkKey: "faq_page",
      label: "FAQ / Help page",
      status: faqStatus === 200 ? "PASS" : "WARN",
      detail: faqStatus === 200
        ? "/faq page found."
        : "No /faq page — reduces support burden and improves onboarding.",
      evidence: `Status: ${faqStatus || "no response"}`,
    });

    const hasStatusSignals = htmlLower.includes("statuspage") || htmlLower.includes("status.io") ||
      htmlLower.includes("betteruptime") || htmlLower.includes("uptimerobot");
    checks.push({
      category: "Missing Pages",
      checkKey: "status_page",
      label: "Status / uptime page",
      status: statusPageStatus === 200 || hasStatusSignals ? "PASS" : "WARN",
      detail: statusPageStatus === 200 || hasStatusSignals
        ? "Status page or uptime monitoring tool detected."
        : "No status page — needed to communicate incidents and build operational trust.",
    });

    checks.push({
      category: "Missing Pages",
      checkKey: "changelog",
      label: "Changelog / What's new",
      status: changelogStatus === 200 ? "PASS" : "WARN",
      detail: changelogStatus === 200
        ? "/changelog page found."
        : "No changelog — users want to know what's shipping; important for retention and credibility.",
      evidence: `Status: ${changelogStatus || "no response"}`,
    });

    // SaaS Readiness
    const hasBillingPortal = ["/billing", "/billing-portal", "/subscription", "/manage-subscription"].some((p) =>
      htmlLower.includes(`href="${p}`) || htmlLower.includes(`href='${p}`),
    );
    checks.push({
      category: "SaaS Readiness",
      checkKey: "billing_portal",
      label: "Billing / subscription management",
      status: hasBillingPortal ? "PASS" : "WARN",
      detail: hasBillingPortal
        ? "Billing or subscription management link found."
        : "No billing portal detected — users need self-service subscription management to reduce churn.",
    });

    const hasAccountSettings = ["/account", "/settings", "/profile", "/dashboard/settings", "/app/settings"].some((p) =>
      htmlLower.includes(`href="${p}`) || htmlLower.includes(`href='${p}`),
    );
    checks.push({
      category: "SaaS Readiness",
      checkKey: "account_settings",
      label: "Account settings",
      status: hasAccountSettings ? "PASS" : "WARN",
      detail: hasAccountSettings
        ? "Account settings page link found."
        : "No account settings page — users need to manage their profile and preferences.",
    });

    const hasPasswordReset = ["/forgot-password", "/reset-password", "/auth/forgot", "/forgot", "/password-reset"].some((p) =>
      htmlLower.includes(`href="${p}`) || htmlLower.includes(`href='${p}`),
    );
    checks.push({
      category: "SaaS Readiness",
      checkKey: "password_reset",
      label: "Password reset",
      status: hasPasswordReset ? "PASS" : "WARN",
      detail: hasPasswordReset
        ? "Password reset flow link detected."
        : "No password reset — essential for user account recovery; absence increases churn.",
    });

    const hasSupportWidget = ["intercom", "crisp.chat", "zendesk", "freshdesk", "tawk.to", "chatwoot"].some((s) =>
      htmlLower.includes(s),
    );
    const hasSupportLink = ["/support", "/help", "/help-center", "/helpdesk"].some((p) =>
      htmlLower.includes(`href="${p}`) || htmlLower.includes(`href='${p}`),
    );
    checks.push({
      category: "SaaS Readiness",
      checkKey: "support_channel",
      label: "Support channel",
      status: hasSupportWidget || hasSupportLink ? "PASS" : "WARN",
      detail: hasSupportWidget || hasSupportLink
        ? "Support page or live chat widget detected."
        : "No support channel found — users with no help path will churn silently.",
    });

    const hasSocialProof = ["testimonial", "review", "customer stor", "case stud", "trusted by", "loved by", "join thousands", "rating"].some((s) =>
      htmlLower.includes(s),
    );
    checks.push({
      category: "SaaS Readiness",
      checkKey: "social_proof",
      label: "Social proof / testimonials",
      status: hasSocialProof ? "PASS" : "WARN",
      detail: hasSocialProof
        ? "Social proof signals detected (testimonials, reviews, customer stories)."
        : "No social proof found — critical for conversion and buyer confidence.",
    });

    const hasOnboarding = ["/onboarding", "/welcome", "/get-started", "/setup", "/tour", "/quickstart"].some((p) =>
      htmlLower.includes(`href="${p}`) || htmlLower.includes(`href='${p}`),
    );
    checks.push({
      category: "SaaS Readiness",
      checkKey: "onboarding_flow",
      label: "Onboarding flow",
      status: hasOnboarding ? "PASS" : "WARN",
      detail: hasOnboarding
        ? "Onboarding or welcome flow link detected."
        : "No onboarding flow — most vibe-coded apps skip this; it's the #1 activation lever.",
    });

    // Mobile & Accessibility
    const hasViewport = /name=["']viewport["']/i.test(pageResult.html);
    checks.push({
      category: "Mobile & Accessibility",
      checkKey: "viewport_meta",
      label: "Viewport meta tag",
      status: hasViewport ? "PASS" : "FAIL",
      detail: hasViewport
        ? "Viewport meta tag found — site is mobile-aware."
        : "No viewport meta tag — site will not render correctly on mobile devices.",
    });

    const hasHtmlLang = /<html[^>]+lang=/i.test(pageResult.html);
    checks.push({
      category: "Mobile & Accessibility",
      checkKey: "html_lang",
      label: "HTML language attribute",
      status: hasHtmlLang ? "PASS" : "WARN",
      detail: hasHtmlLang
        ? "HTML lang attribute found — correct for screen readers and SEO."
        : "No lang attribute on <html> element — required for screen reader accessibility.",
    });

    const hasAriaAttributes = /aria-[a-z]+=/i.test(pageResult.html);
    checks.push({
      category: "Mobile & Accessibility",
      checkKey: "aria_attributes",
      label: "ARIA accessibility attributes",
      status: hasAriaAttributes ? "PASS" : "WARN",
      detail: hasAriaAttributes
        ? "ARIA attributes detected — indicates accessibility consideration in markup."
        : "No ARIA attributes found — site may not be usable by screen reader users.",
    });

    const hasResponsiveImages = pageResult.html.includes("srcset") || pageResult.html.includes("<picture") ||
      pageResult.html.includes('loading="lazy"') || pageResult.html.includes("loading='lazy'");
    checks.push({
      category: "Mobile & Accessibility",
      checkKey: "responsive_images",
      label: "Responsive / optimised images",
      status: hasResponsiveImages ? "PASS" : "WARN",
      detail: hasResponsiveImages
        ? "Responsive image patterns detected (srcset, lazy loading, picture element)."
        : "No responsive image patterns — may cause poor performance and layout issues on mobile.",
    });

    // Social sharing SEO
    const hasOgImage = /property=["']og:image["']/i.test(pageResult.html);
    checks.push({
      category: "SEO",
      checkKey: "og_image",
      label: "og:image (social preview)",
      status: hasOgImage ? "PASS" : "WARN",
      detail: hasOgImage
        ? "og:image tag found — links will display a preview image when shared."
        : "No og:image — links shared on Slack, iMessage, LinkedIn, and X will show a blank card.",
    });

    const hasTwitterCard = /name=["']twitter:card["']/i.test(pageResult.html);
    checks.push({
      category: "SEO",
      checkKey: "twitter_card",
      label: "Twitter / X Card",
      status: hasTwitterCard ? "PASS" : "WARN",
      detail: hasTwitterCard
        ? "Twitter Card meta tag found."
        : "No Twitter Card — links shared on X won't expand into rich preview cards.",
    });

    // Additional security headers
    const xCto = pageResult.headers["x-content-type-options"];
    checks.push({
      category: "Security",
      checkKey: "x_content_type_options",
      label: "X-Content-Type-Options",
      status: xCto ? "PASS" : "WARN",
      detail: xCto
        ? "X-Content-Type-Options header present — MIME sniffing blocked."
        : "No X-Content-Type-Options — browsers may MIME-sniff responses, enabling content injection attacks.",
      evidence: xCto ?? undefined,
    });

    const permissionsPolicy = pageResult.headers["permissions-policy"];
    checks.push({
      category: "Security",
      checkKey: "permissions_policy",
      label: "Permissions-Policy",
      status: permissionsPolicy ? "PASS" : "WARN",
      detail: permissionsPolicy
        ? "Permissions-Policy header present."
        : "No Permissions-Policy — browser features (camera, microphone, geolocation) are unrestricted.",
    });

    const referrerPolicy = pageResult.headers["referrer-policy"];
    checks.push({
      category: "Security",
      checkKey: "referrer_policy",
      label: "Referrer-Policy",
      status: referrerPolicy ? "PASS" : "WARN",
      detail: referrerPolicy
        ? `Referrer-Policy: ${referrerPolicy}`
        : "No Referrer-Policy — page URLs may leak to third parties via the Referer header.",
      evidence: referrerPolicy ?? undefined,
    });

    // Transactional email detection
    const emailProviderSignals = ["resend.com", "sendgrid.net", "mailgun.com", "postmarkapp.com", "sparkpostmail", "mandrillapp", "ses.amazonaws.com"];
    const hasEmailProvider = emailProviderSignals.some((p) => htmlLower.includes(p));
    checks.push({
      category: "SaaS Readiness",
      checkKey: "email_provider",
      label: "Transactional email provider",
      status: hasEmailProvider ? "PASS" : "WARN",
      detail: hasEmailProvider
        ? "Transactional email provider detected (Resend, SendGrid, Mailgun, Postmark, etc.)."
        : "No email provider detected — password reset, welcome emails, and payment receipts may not be configured.",
    });

    // AI platform watermark detection
    const aiWatermarks = ["built with lovable", "made with lovable", "lovable.dev", "bolt.new", "created with bolt", "created with v0", "generated by v0", "v0.dev", "replit.com/badge"];
    const hasAiWatermark = aiWatermarks.some((s) => htmlLower.includes(s));
    checks.push({
      category: "Code Quality",
      checkKey: "ai_platform_origin",
      label: "AI platform watermark",
      status: hasAiWatermark ? "WARN" : "PASS",
      detail: hasAiWatermark
        ? "AI platform attribution detected (Lovable, Bolt, v0, Replit) — custom branding should be applied before launch."
        : "No AI platform watermarks detected in page source.",
    });

    // Parallel batch: favicon, PWA manifest
    const [faviconStatus, manifestStatus] = await Promise.all([
      headRequest(`${baseUrl}/favicon.ico`),
      headRequest(`${baseUrl}/manifest.json`),
    ]);
    // Stripe webhook — only fetch if payment signals detected, saves a network round-trip for non-commerce sites
    const stripeWebhookStatus = ctx.isPaymentEnabled
      ? await headRequest(`${baseUrl}/api/webhooks/stripe`)
      : 0;

    const hasFaviconLink = /rel=["'](shortcut icon|icon)["']/i.test(pageResult.html);
    checks.push({
      category: "Mobile & Accessibility",
      checkKey: "favicon",
      label: "Favicon / app icon",
      status: hasFaviconLink || faviconStatus === 200 ? "PASS" : "WARN",
      detail: hasFaviconLink || faviconStatus === 200
        ? "Favicon found."
        : "No favicon detected — vibe-coded apps often retain the AI platform's default icon after launch.",
      evidence: !hasFaviconLink ? `Status: ${faviconStatus || "no response"}` : undefined,
    });

    const hasManifestLink = /rel=["']manifest["']/i.test(pageResult.html);
    checks.push({
      category: "Mobile & Accessibility",
      checkKey: "pwa_manifest",
      label: "Web App Manifest (PWA)",
      status: hasManifestLink || manifestStatus === 200 ? "PASS" : "WARN",
      detail: hasManifestLink || manifestStatus === 200
        ? "Web app manifest found — app supports home screen installation."
        : "No manifest.json — app cannot be installed as a PWA or trigger Chrome's install prompt.",
      evidence: !hasManifestLink ? `Status: ${manifestStatus || "no response"}` : undefined,
    });

    if (ctx.isPaymentEnabled) {
      const stripeWebhookExists = stripeWebhookStatus > 0 && stripeWebhookStatus < 500;
      checks.push({
        category: "Payments",
        checkKey: "stripe_webhook",
        label: "Stripe webhook endpoint",
        status: stripeWebhookExists ? "PASS" : "WARN",
        detail: stripeWebhookExists
          ? "Stripe webhook endpoint found — subscription lifecycle events will be processed."
          : "No Stripe webhook detected — subscription upgrades, failures, and cancellations won't be handled automatically.",
        evidence: stripeWebhookStatus ? `Status: ${stripeWebhookStatus}` : undefined,
      });
    } else {
      checks.push({ category: "Payments", checkKey: "stripe_webhook", label: "Stripe webhook endpoint", status: "SKIPPED", detail: "Skipped — no payment integration detected on this project." });
    }

    // App Store & Mobile Distribution — skip entirely (including the .well-known/ HEAD requests) if no mobile signals
    const [aasaStatus, assetLinksStatus] = ctx.isMobileApp ? await Promise.all([
      headRequest(`${baseUrl}/.well-known/apple-app-site-association`),
      headRequest(`${baseUrl}/.well-known/assetlinks.json`),
    ]) : [0, 0];
    const hasAppleSmartBanner = /name=["']apple-itunes-app["']/i.test(pageResult.html);
    if (!ctx.isMobileApp) {
      skipChecks(checks, "App Store & Mobile", [
        ["apple_touch_icon", "Apple touch icon"],
        ["apple_app_store", "Apple App Store presence"],
        ["google_play_store", "Google Play Store presence"],
        ["universal_links", "Universal Links (iOS deep linking)"],
        ["android_asset_links", "Android App Links (deep linking)"],
        ["wallet_payments", "Apple Pay / Google Pay / Amazon Pay"],
      ], "Skipped — no mobile app signals detected on this project.");
    } else {

    const hasAppleTouchIcon = /rel=["']apple-touch-icon["']/i.test(pageResult.html);
    checks.push({
      category: "App Store & Mobile",
      checkKey: "apple_touch_icon",
      label: "Apple touch icon",
      status: hasAppleTouchIcon ? "PASS" : "WARN",
      detail: hasAppleTouchIcon
        ? "Apple touch icon found — app can be pinned to iOS home screen with correct branding."
        : "No apple-touch-icon — required for iOS home screen install and Apple App Store submission.",
    });

    const hasAppStoreLink = htmlLower.includes("apps.apple.com") || htmlLower.includes("itunes.apple.com");
    checks.push({
      category: "App Store & Mobile",
      checkKey: "apple_app_store",
      label: "Apple App Store presence",
      status: hasAppleSmartBanner || hasAppStoreLink ? "PASS" : "WARN",
      detail: hasAppleSmartBanner || hasAppStoreLink
        ? "Apple App Store link or Smart App Banner detected."
        : "No Apple App Store signals — if targeting iOS users, consider a native app or PWA submission.",
    });

    const hasGooglePlayLink = htmlLower.includes("play.google.com/store/apps");
    checks.push({
      category: "App Store & Mobile",
      checkKey: "google_play_store",
      label: "Google Play Store presence",
      status: hasGooglePlayLink ? "PASS" : "WARN",
      detail: hasGooglePlayLink
        ? "Google Play Store link detected."
        : "No Google Play Store link — Android distribution via Play Store or TWA (Trusted Web Activity) not detected.",
    });

    checks.push({
      category: "App Store & Mobile",
      checkKey: "universal_links",
      label: "Universal Links (iOS deep linking)",
      status: aasaStatus === 200 ? "PASS" : "WARN",
      detail: aasaStatus === 200
        ? "apple-app-site-association file found — iOS Universal Links configured for app/web handoff."
        : "No apple-app-site-association — Universal Links not set up (required for App Clips and native app ↔ web routing).",
      evidence: `Status: ${aasaStatus || "no response"}`,
    });

    checks.push({
      category: "App Store & Mobile",
      checkKey: "android_asset_links",
      label: "Android App Links (deep linking)",
      status: assetLinksStatus === 200 ? "PASS" : "WARN",
      detail: assetLinksStatus === 200
        ? "assetlinks.json found — Android App Links configured."
        : "No assetlinks.json — Android deep linking not set up (required for Play Store TWA submission).",
      evidence: `Status: ${assetLinksStatus || "no response"}`,
    });

    const hasApplePaySignals = htmlLower.includes("applepaysession") || htmlLower.includes("apple-pay-sdk") || htmlLower.includes("apple_pay");
    const hasGooglePaySignals = htmlLower.includes("pay.google.com") || htmlLower.includes("google.payments") || htmlLower.includes("googlepay");
    const hasAmazonPaySignals = htmlLower.includes("pay.amazon.com") || htmlLower.includes("amazonpay") || htmlLower.includes("amazon_pay");
    const hasWalletPayments = hasApplePaySignals || hasGooglePaySignals || hasAmazonPaySignals;
    const walletNames = [hasApplePaySignals && "Apple Pay", hasGooglePaySignals && "Google Pay", hasAmazonPaySignals && "Amazon Pay"].filter(Boolean).join(", ");
    checks.push({
      category: "App Store & Mobile",
      checkKey: "wallet_payments",
      label: "Apple Pay / Google Pay / Amazon Pay",
      status: hasWalletPayments ? "PASS" : "WARN",
      detail: hasWalletPayments
        ? `Wallet payment detected (${walletNames}) — mobile checkout optimised.`
        : "No wallet payments detected — Apple Pay, Google Pay, and Amazon Pay dramatically improve mobile conversion rates.",
    });
    } // end if (ctx.isMobileApp)

    // Global Distribution & Localisation
    const hasHreflang = htmlLower.includes("hreflang");
    checks.push({
      category: "Global Distribution",
      checkKey: "hreflang_tags",
      label: "hreflang tags (multi-region SEO)",
      status: hasHreflang ? "PASS" : "WARN",
      detail: hasHreflang
        ? "hreflang tags found — search engines will serve the correct regional version to each country."
        : "No hreflang tags — Google won't know which language/region version to surface to international users.",
    });

    const hasCharsetUtf8 = /charset=["']?utf-8/i.test(pageResult.html) || pageResult.headers["content-type"]?.toLowerCase().includes("utf-8");
    checks.push({
      category: "Global Distribution",
      checkKey: "charset_utf8",
      label: "UTF-8 character encoding",
      status: hasCharsetUtf8 ? "PASS" : "WARN",
      detail: hasCharsetUtf8
        ? "UTF-8 charset declared — supports all international character sets."
        : "No UTF-8 charset — Chinese, Japanese, Arabic, and other non-Latin characters may render incorrectly.",
    });

    const hasCcpaSignal = htmlLower.includes("do not sell") || htmlLower.includes("your privacy choices") || htmlLower.includes("opt-out of sale") || htmlLower.includes("ccpa");
    checks.push({
      category: "Global Distribution",
      checkKey: "ccpa_compliance",
      label: "CCPA (California privacy rights)",
      status: hasCcpaSignal ? "PASS" : "WARN",
      detail: hasCcpaSignal
        ? "CCPA compliance signals detected — California consumer privacy rights addressed."
        : "No CCPA signals — required for California users (40M people). Must include a &lsquo;Do Not Sell&rsquo; opt-out link.",
    });

    const currencySymbols = ["€", "£", "¥", "₹", "kr ", "chf", "sgd", "aud", "cad", "r$"];
    const hasMultiCurrency = currencySymbols.some((s) => pageResult.html.toLowerCase().includes(s));
    checks.push({
      category: "Global Distribution",
      checkKey: "multi_currency",
      label: "Multi-currency pricing",
      status: hasMultiCurrency ? "PASS" : "WARN",
      detail: hasMultiCurrency
        ? "Multiple currency symbols detected — product appears to support international pricing."
        : "USD-only pricing detected — EU (€), UK (£), and Asian markets expect local currency; USD-only loses 20–40% of international revenue.",
    });

    const hasRtlSupport = /dir=["']rtl["']/i.test(pageResult.html) || htmlLower.includes(":dir(rtl)") || htmlLower.includes("[dir=rtl]");
    checks.push({
      category: "Global Distribution",
      checkKey: "rtl_support",
      label: "RTL language support",
      status: hasRtlSupport ? "PASS" : "WARN",
      detail: hasRtlSupport
        ? "Right-to-left layout support detected — Arabic, Hebrew, and Persian markets accessible."
        : "No RTL support detected — required for Arabic (420M speakers), Hebrew, Farsi, and Urdu-speaking markets.",
    });

    const hasLanguageSwitcher = /href=["'][^"']*\/(en|de|fr|es|ja|zh|ko|ar|pt|nl|it|pl|sv)[\/"']/i.test(pageResult.html) ||
      htmlLower.includes('hreflang="x-default"') ||
      htmlLower.includes("language-selector") ||
      htmlLower.includes("lang-switcher") ||
      htmlLower.includes("locale-switcher");
    checks.push({
      category: "Global Distribution",
      checkKey: "language_switcher",
      label: "Language / region switcher",
      status: hasLanguageSwitcher ? "PASS" : "WARN",
      detail: hasLanguageSwitcher
        ? "Language or region selector detected."
        : "No language switcher found — international users cannot switch to their preferred language.",
    });

    const hasInternationalPayments = htmlLower.includes("paypal") || htmlLower.includes("klarna") ||
      htmlLower.includes("afterpay") || htmlLower.includes("ideal") || htmlLower.includes("sofort") ||
      htmlLower.includes("alipay") || htmlLower.includes("wechat pay") || htmlLower.includes("paytm") ||
      htmlLower.includes("upi") || htmlLower.includes("sepa");
    checks.push({
      category: "Global Distribution",
      checkKey: "international_payments",
      label: "International payment methods",
      status: hasInternationalPayments ? "PASS" : "WARN",
      detail: hasInternationalPayments
        ? "International payment methods detected (PayPal, Klarna, iDEAL, Alipay, etc.)."
        : "Card-only payments detected — EU (iDEAL, SEPA, Klarna), Asia (Alipay, WeChat Pay, UPI), and LATAM markets expect local options.",
    });

    const hasEuVatSignal = htmlLower.includes(" vat") || htmlLower.includes("value added tax") || htmlLower.includes("tax invoice") || htmlLower.includes("ust-idnr") || htmlLower.includes("mwst");
    checks.push({
      category: "Global Distribution",
      checkKey: "eu_vat",
      label: "EU VAT / tax handling",
      status: hasEuVatSignal ? "PASS" : "WARN",
      detail: hasEuVatSignal
        ? "VAT or tax handling signals detected — EU digital services tax compliance appears considered."
        : "No VAT signals detected — EU DST regulations require VAT collection and invoicing for European B2C customers.",
    });

    // ─── Additional SEO ────────────────────────────────────────────────────────
    const hasStructuredData = /<script[^>]+type=["']application\/ld\+json["']/i.test(pageResult.html);
    checks.push({
      category: "SEO",
      checkKey: "structured_data",
      label: "JSON-LD structured data",
      status: hasStructuredData ? "PASS" : "WARN",
      detail: hasStructuredData
        ? "JSON-LD structured data found — rich results eligible in Google Search."
        : "No JSON-LD structured data — add schema.org markup to enable rich snippets (reviews, FAQs, product details).",
    });

    const hasPreloadLinks = /<link[^>]+rel=["']preload["']/i.test(pageResult.html);
    checks.push({
      category: "SEO",
      checkKey: "preload_hints",
      label: "Resource preload hints",
      status: hasPreloadLinks ? "PASS" : "WARN",
      detail: hasPreloadLinks
        ? "Resource preload hints detected — critical resources load earlier."
        : "No preload hints — add <link rel=preload> for fonts, hero images, and critical JS/CSS.",
    });

    const hasVerificationMeta = /name=["'](google-site-verification|msvalidate\.01|yandex-verification)["']/i.test(pageResult.html);
    checks.push({
      category: "SEO",
      checkKey: "search_engine_verified",
      label: "Search engine verification",
      status: hasVerificationMeta ? "PASS" : "WARN",
      detail: hasVerificationMeta
        ? "Search Console / Bing Webmaster verification meta tag found."
        : "No search engine verification — link Google Search Console to monitor indexing and search performance.",
    });

    const hasMetaRobots = /name=["']robots["']/i.test(pageResult.html);
    const blocksIndexing = hasMetaRobots && /content=["'][^"']*noindex/i.test(pageResult.html);
    checks.push({
      category: "SEO",
      checkKey: "meta_robots",
      label: "Robots meta tag",
      status: blocksIndexing ? "FAIL" : hasMetaRobots ? "PASS" : "WARN",
      detail: blocksIndexing
        ? "noindex robots meta tag detected — search engines will not index this page."
        : hasMetaRobots
          ? "Robots meta tag found."
          : "No robots meta tag — add one to control indexing behaviour per page.",
    });

    const hasOgSiteName = /property=["']og:site_name["']/i.test(pageResult.html);
    checks.push({
      category: "SEO",
      checkKey: "og_site_name",
      label: "og:site_name (brand in shares)",
      status: hasOgSiteName ? "PASS" : "WARN",
      detail: hasOgSiteName
        ? "og:site_name found — brand name will appear in social shares."
        : "No og:site_name — add it so your brand name appears consistently when links are shared on social.",
    });

    // ─── Additional Security ───────────────────────────────────────────────────
    const hasSri = /integrity=["'][a-z0-9+/=\-]+["']/i.test(pageResult.html);
    checks.push({
      category: "Security",
      checkKey: "subresource_integrity",
      label: "Subresource Integrity (SRI)",
      status: hasSri ? "PASS" : "WARN",
      detail: hasSri
        ? "SRI hashes found on external scripts — supply-chain injection attacks mitigated."
        : "No SRI hashes — a compromised CDN could inject malicious code into your app.",
    });

    const setCookieHeader = pageResult.headers["set-cookie"] ?? "";
    const hasSecureCookieAttrs = setCookieHeader.toLowerCase().includes("secure") && setCookieHeader.toLowerCase().includes("samesite");
    checks.push({
      category: "Security",
      checkKey: "secure_cookie_attributes",
      label: "Secure cookie attributes",
      status: hasSecureCookieAttrs ? "PASS" : setCookieHeader ? "WARN" : "WARN",
      detail: hasSecureCookieAttrs
        ? "Cookies have Secure and SameSite attributes — session hijacking risk reduced."
        : "Cookies lack Secure or SameSite attributes — vulnerable to CSRF and session theft on mixed-content pages.",
    });

    const corsHeader = pageResult.headers["access-control-allow-origin"];
    const hasWildcardCors = corsHeader === "*";
    checks.push({
      category: "Security",
      checkKey: "cors_policy",
      label: "CORS policy",
      status: hasWildcardCors ? "WARN" : corsHeader ? "PASS" : "WARN",
      detail: hasWildcardCors
        ? "CORS allows all origins (*) — restrict to trusted domains in production."
        : corsHeader
          ? `CORS header configured (${corsHeader}).`
          : "No CORS header — verify cross-origin policy is correctly configured for API routes.",
    });

    const securityTxtStatus = await headRequest(`${baseUrl}/.well-known/security.txt`);
    checks.push({
      category: "Security",
      checkKey: "security_txt",
      label: "security.txt (responsible disclosure)",
      status: securityTxtStatus === 200 ? "PASS" : "WARN",
      detail: securityTxtStatus === 200
        ? "security.txt found — responsible disclosure channel available for security researchers."
        : "No security.txt — security researchers have no official path to report vulnerabilities (RFC 9116).",
    });

    const serverHeader = pageResult.headers["server"] ?? "";
    const exposesVersion = /\d+\.\d+/.test(serverHeader) && serverHeader.length > 3;
    checks.push({
      category: "Security",
      checkKey: "server_header_leakage",
      label: "Server version not exposed",
      status: exposesVersion ? "WARN" : "PASS",
      detail: exposesVersion
        ? `Server header exposes version (${serverHeader}) — attackers can target known CVEs for this version.`
        : "Server header does not expose detailed version information.",
    });

    const hasMixedContent = /http:\/\/[^"'\s>]+\.(js|css|woff2?|svg)/i.test(pageResult.html);
    checks.push({
      category: "Security",
      checkKey: "no_mixed_content",
      label: "No mixed HTTP/HTTPS content",
      status: hasMixedContent ? "WARN" : "PASS",
      detail: hasMixedContent
        ? "HTTP (non-HTTPS) resource URLs found in page — mixed content triggers browser security warnings."
        : "No obvious mixed content — resource references appear to be HTTPS.",
    });

    // ─── Additional Performance ─────────────────────────────────────────────────
    const hasPreconnect = /<link[^>]+rel=["']preconnect["']/i.test(pageResult.html);
    checks.push({
      category: "Performance",
      checkKey: "preconnect_hints",
      label: "Preconnect / DNS prefetch hints",
      status: hasPreconnect ? "PASS" : "WARN",
      detail: hasPreconnect
        ? "Preconnect hints found — third-party connections warm up before they are needed."
        : "No preconnect hints — add <link rel=preconnect> for fonts, CDN, and analytics origins.",
    });

    const hasNativeLazy = /loading=["']lazy["']/i.test(pageResult.html);
    checks.push({
      category: "Performance",
      checkKey: "native_lazy_loading",
      label: "Native image lazy loading",
      status: hasNativeLazy ? "PASS" : "WARN",
      detail: hasNativeLazy
        ? "loading=lazy detected — images below the fold load on demand, reducing initial page weight."
        : "No native lazy loading — add loading=lazy to below-the-fold images to improve LCP.",
    });

    const hasFontDisplaySwap = /font-display:\s*swap/i.test(pageResult.html);
    checks.push({
      category: "Performance",
      checkKey: "font_display_swap",
      label: "Font display optimisation",
      status: hasFontDisplaySwap ? "PASS" : "WARN",
      detail: hasFontDisplaySwap
        ? "font-display: swap found — text visible during web font loading (no FOIT)."
        : "No font-display: swap — web fonts may block text render, contributing to poor CLS/LCP scores.",
    });

    const varyHeader = pageResult.headers["vary"];
    checks.push({
      category: "Performance",
      checkKey: "vary_header",
      label: "Vary header (content negotiation)",
      status: varyHeader ? "PASS" : "WARN",
      detail: varyHeader
        ? `Vary: ${varyHeader} — CDN caches serve the correct variant per request.`
        : "No Vary header — CDN may serve wrong compression type to some clients.",
    });

    const serverTimingHeader = pageResult.headers["server-timing"];
    checks.push({
      category: "Performance",
      checkKey: "server_timing",
      label: "Server-Timing header",
      status: serverTimingHeader ? "PASS" : "WARN",
      detail: serverTimingHeader
        ? "Server-Timing header present — backend performance metrics exposed to browser DevTools."
        : "No Server-Timing header — add it to expose database/cache timings for performance diagnostics.",
    });

    // ─── Additional Authentication ──────────────────────────────────────────────
    if (!ctx.isAuthEnabled) {
      skipChecks(checks, "Authentication", [
        ["mfa_signals", "Multi-factor authentication (MFA)"],
        ["email_verification_flow", "Email verification flow"],
        ["magic_link_auth", "Magic link / passwordless login"],
        ["enterprise_sso", "Enterprise SSO / SAML"],
      ], "Skipped — no authentication system detected on this project.");
    } else {
    const hasMfa = ["two-factor", "2fa", "authenticator app", "totp", "multi-factor", "mfa"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "Authentication",
      checkKey: "mfa_signals",
      label: "Multi-factor authentication (MFA)",
      status: hasMfa ? "PASS" : "WARN",
      detail: hasMfa
        ? "MFA / 2FA signals detected — account security hardened."
        : "No MFA/2FA signals — enterprise buyers require MFA; absence blocks B2B deals.",
    });

    const hasEmailVerification = ["verify your email", "confirm your email", "email verification", "activate your account", "check your inbox"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "Authentication",
      checkKey: "email_verification_flow",
      label: "Email verification flow",
      status: hasEmailVerification ? "PASS" : "WARN",
      detail: hasEmailVerification
        ? "Email verification signals detected — user email addresses are validated on sign-up."
        : "No email verification signals — unverified accounts lead to spam, poor deliverability, and bounce rates.",
    });

    const hasMagicLink = ["magic link", "passwordless", "sign in with email", "email link", "one-time link"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "Authentication",
      checkKey: "magic_link_auth",
      label: "Magic link / passwordless login",
      status: hasMagicLink ? "PASS" : "WARN",
      detail: hasMagicLink
        ? "Passwordless/magic link login detected — frictionless auth available."
        : "No passwordless auth — magic links improve sign-up conversion by removing password friction.",
    });

    const hasSso = ["single sign-on", "saml", "okta", "azure ad", "active directory", "enterprise sso", "sso login"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "Authentication",
      checkKey: "enterprise_sso",
      label: "Enterprise SSO / SAML",
      status: hasSso ? "PASS" : "WARN",
      detail: hasSso
        ? "Enterprise SSO signals detected — enterprise deals enabled."
        : "No SSO/SAML signals — enterprise buyers mandate SSO; absence is a deal-breaker for mid-market procurement.",
    });
    } // end if (ctx.isAuthEnabled)

    // ─── Additional Legal & Compliance ──────────────────────────────────────────
    const hasDataDeletion = ["delete my account", "delete account", "right to erasure", "delete your data", "close account", "request deletion"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "Legal & Compliance",
      checkKey: "data_deletion_right",
      label: "Data deletion / right to erasure (GDPR Art. 17)",
      status: hasDataDeletion ? "PASS" : "WARN",
      detail: hasDataDeletion
        ? "Account or data deletion mechanism detected — GDPR Art. 17 compliance supported."
        : "No account deletion option visible — GDPR Art. 17 requires users can request erasure of all personal data.",
    });

    const [accessibilityStatus, dpaStatus, cookiePolicyStatus] = await Promise.all([
      headRequest(`${baseUrl}/accessibility`),
      headRequest(`${baseUrl}/dpa`),
      headRequest(`${baseUrl}/cookie-policy`),
    ]);
    const accessibilityAltStatus = accessibilityStatus !== 200 ? await headRequest(`${baseUrl}/accessibility-statement`) : 200;
    const dpaAltStatus = dpaStatus !== 200 ? await headRequest(`${baseUrl}/data-processing-agreement`) : 200;
    const cookiePolicyAltStatus = cookiePolicyStatus !== 200 ? await headRequest(`${baseUrl}/cookies`) : 200;

    checks.push({
      category: "Legal & Compliance",
      checkKey: "accessibility_statement",
      label: "Accessibility statement",
      status: accessibilityStatus === 200 || accessibilityAltStatus === 200 ? "PASS" : "WARN",
      detail: accessibilityStatus === 200 || accessibilityAltStatus === 200
        ? "Accessibility statement page found — EU Web Accessibility Directive compliance documented."
        : "No accessibility statement — required by EU Web Accessibility Directive; recommended for all public-facing SaaS.",
    });

    const hasCoppaSignals = ["under 13", "13 years", "children's privacy", "coppa", "child-directed", "parental consent", "age gate", "age verification"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "Legal & Compliance",
      checkKey: "coppa_signals",
      label: "COPPA / children's privacy",
      status: hasCoppaSignals ? "PASS" : "WARN",
      detail: hasCoppaSignals
        ? "COPPA compliance signals detected — children's privacy handling addressed."
        : "No COPPA signals — if any users could be under 13 (US) or 16 (EU), additional parental consent is legally required.",
    });

    checks.push({
      category: "Legal & Compliance",
      checkKey: "dpa_available",
      label: "Data Processing Agreement (GDPR Art. 28)",
      status: dpaStatus === 200 || dpaAltStatus === 200 ? "PASS" : "WARN",
      detail: dpaStatus === 200 || dpaAltStatus === 200
        ? "DPA page found — GDPR Art. 28 processor obligations documented."
        : "No DPA available — required for B2B enterprise customers under GDPR; absence blocks EU procurement.",
    });

    const hasIcpLicense = htmlLower.includes("icp备") || htmlLower.includes("备案号") || htmlLower.includes("icp证") || /[京沪粤]icp/i.test(pageResult.html);
    checks.push({
      category: "Legal & Compliance",
      checkKey: "icp_license",
      label: "China ICP license (for CN market)",
      status: hasIcpLicense ? "PASS" : "WARN",
      detail: hasIcpLicense
        ? "ICP license number detected — China internet content hosting compliance addressed."
        : "No ICP license — required for websites serving users in China; absence means ISPs can block access.",
    });

    const hasPrivacyLastUpdated = htmlLower.includes("last updated") || htmlLower.includes("last revised") || htmlLower.includes("effective date") || htmlLower.includes("last modified");
    checks.push({
      category: "Legal & Compliance",
      checkKey: "privacy_last_updated",
      label: "Privacy policy maintenance date",
      status: hasPrivacyLastUpdated ? "PASS" : "WARN",
      detail: hasPrivacyLastUpdated
        ? "Policy maintenance date detected — shows the privacy policy is actively maintained."
        : "No 'last updated' date in policy — regulators and users expect visible evidence of ongoing policy maintenance.",
    });

    checks.push({
      category: "Legal & Compliance",
      checkKey: "cookie_policy_page",
      label: "Dedicated cookie policy page",
      status: cookiePolicyStatus === 200 || cookiePolicyAltStatus === 200 ? "PASS" : "WARN",
      detail: cookiePolicyStatus === 200 || cookiePolicyAltStatus === 200
        ? "Dedicated cookie policy page found — GDPR ePrivacy Directive requirement met."
        : "No dedicated cookie policy — GDPR and ePrivacy Directive require transparent disclosure of all cookies used.",
    });

    const hasDpoContact = htmlLower.includes("dpo@") || htmlLower.includes("privacy@") || htmlLower.includes("data protection officer") || htmlLower.includes("data-protection@");
    checks.push({
      category: "Legal & Compliance",
      checkKey: "gdpr_dpo_contact",
      label: "GDPR privacy contact (DPO)",
      status: hasDpoContact ? "PASS" : "WARN",
      detail: hasDpoContact
        ? "Privacy/DPO contact email detected — data subject requests can be handled."
        : "No DPO or privacy contact visible — GDPR requires a designated privacy contact for data subject requests.",
    });

    // ─── Additional Missing Pages (batch) ─────────────────────────────────────
    const [blogStatus, careersStatus, pressStatus, docsStatus, integrationsStatus, mediaKitStatus] = await Promise.all([
      headRequest(`${baseUrl}/blog`),
      headRequest(`${baseUrl}/careers`),
      headRequest(`${baseUrl}/press`),
      headRequest(`${baseUrl}/docs`),
      headRequest(`${baseUrl}/integrations`),
      headRequest(`${baseUrl}/media-kit`),
    ]);
    const blogAltStatus = blogStatus !== 200 ? await headRequest(`${baseUrl}/resources`) : 200;
    const careersAltStatus = careersStatus !== 200 ? await headRequest(`${baseUrl}/jobs`) : 200;
    const pressAltStatus = pressStatus !== 200 ? await headRequest(`${baseUrl}/media`) : 200;
    const docsAltStatus = docsStatus !== 200 ? await headRequest(`${baseUrl}/documentation`) : 200;
    const integrationsAltStatus = integrationsStatus !== 200 ? await headRequest(`${baseUrl}/partners`) : 200;
    const brandKitStatus = mediaKitStatus !== 200 ? await headRequest(`${baseUrl}/brand`) : 200;

    checks.push({
      category: "Missing Pages",
      checkKey: "blog_resources",
      label: "Blog / resources hub",
      status: blogStatus === 200 || blogAltStatus === 200 ? "PASS" : "WARN",
      detail: blogStatus === 200 || blogAltStatus === 200
        ? "Blog or resources page found — content marketing enabled."
        : "No blog or resources section — content marketing drives 3× more leads than outbound for SaaS.",
    });

    checks.push({
      category: "Missing Pages",
      checkKey: "careers_page",
      label: "Careers / jobs page",
      status: careersStatus === 200 || careersAltStatus === 200 ? "PASS" : "WARN",
      detail: careersStatus === 200 || careersAltStatus === 200
        ? "Careers page found."
        : "No careers page — even a simple 'we're hiring' page signals momentum and attracts talent.",
    });

    checks.push({
      category: "Missing Pages",
      checkKey: "press_media",
      label: "Press / media page",
      status: pressStatus === 200 || pressAltStatus === 200 ? "PASS" : "WARN",
      detail: pressStatus === 200 || pressAltStatus === 200
        ? "Press or media page found."
        : "No press page — journalists need a media kit (logo, screenshots, founder bio) to write about you.",
    });

    checks.push({
      category: "Missing Pages",
      checkKey: "documentation",
      label: "Documentation / developer docs",
      status: docsStatus === 200 || docsAltStatus === 200 ? "PASS" : "WARN",
      detail: docsStatus === 200 || docsAltStatus === 200
        ? "Documentation page found."
        : "No docs page — users and developers need documentation to onboard and integrate successfully.",
    });

    checks.push({
      category: "Missing Pages",
      checkKey: "integrations_page",
      label: "Integrations / partners page",
      status: integrationsStatus === 200 || integrationsAltStatus === 200 ? "PASS" : "WARN",
      detail: integrationsStatus === 200 || integrationsAltStatus === 200
        ? "Integrations or partners page found."
        : "No integrations page — listing integrations (Zapier, Slack, Make.com) is a top buying signal for SaaS.",
    });

    let has404Page = false;
    try {
      const notFoundResponse = await fetchWithTimeout(`${baseUrl}/this-page-does-not-exist-pulse-check`, {
        headers: { "User-Agent": "Gitwork-Pulse/1.0" },
        redirect: "follow",
      });
      if (notFoundResponse.status === 404) {
        const notFoundHtml = await notFoundResponse.text().catch(() => "");
        has404Page = notFoundHtml.length > 200 && !notFoundHtml.toLowerCase().includes("cannot get");
      }
    } catch {
      // ignore
    }
    checks.push({
      category: "Missing Pages",
      checkKey: "custom_404_page",
      label: "Custom 404 error page",
      status: has404Page ? "PASS" : "WARN",
      detail: has404Page
        ? "Custom 404 page detected — broken links lead to a branded error experience."
        : "No custom 404 page — broken links dump users on a raw error; a custom 404 with navigation retains them.",
    });

    // ─── Additional SaaS Readiness ─────────────────────────────────────────────
    if (!ctx.isSaas) {
      skipChecks(checks, "SaaS Readiness", [
        ["demo_booking", "Demo booking / discovery call"],
        ["free_trial_cta", "Free trial / free plan CTA"],
        ["api_availability", "Public API / developer access"],
        ["affiliate_program", "Affiliate / referral program"],
        ["security_trust_page", "Security / trust page"],
        ["in_app_notifications", "In-app notification system"],
      ], "Skipped — no SaaS product signals detected on this project.");
    } else {
    const hasDemoBooking = ["book a demo", "schedule a demo", "request a demo", "calendly.com", "savvycal.com", "cal.com"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "SaaS Readiness",
      checkKey: "demo_booking",
      label: "Demo booking / discovery call",
      status: hasDemoBooking ? "PASS" : "WARN",
      detail: hasDemoBooking
        ? "Demo booking link or scheduling widget detected."
        : "No demo booking — high-ACV SaaS needs a 'book a demo' CTA to capture enterprise leads.",
    });

    const hasFreeTrial = ["free trial", "start for free", "get started free", "try for free", "free plan", "no credit card required"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "SaaS Readiness",
      checkKey: "free_trial_cta",
      label: "Free trial / free plan CTA",
      status: hasFreeTrial ? "PASS" : "WARN",
      detail: hasFreeTrial
        ? "Free trial or free plan CTA detected — reduces purchase friction."
        : "No free trial signal — freemium or free trial converts 3–5× better than paid-only for early SaaS.",
    });

    const [apiStatus, affiliateStatus, securityPageStatus] = await Promise.all([
      headRequest(`${baseUrl}/api`),
      headRequest(`${baseUrl}/affiliate`),
      headRequest(`${baseUrl}/security`),
    ]);
    const apiAltStatus = apiStatus !== 200 ? await headRequest(`${baseUrl}/api-docs`) : 200;
    const affiliateAltStatus = affiliateStatus !== 200 ? await headRequest(`${baseUrl}/referral`) : 200;
    const trustPageStatus = securityPageStatus !== 200 ? await headRequest(`${baseUrl}/trust`) : 200;

    checks.push({
      category: "SaaS Readiness",
      checkKey: "api_availability",
      label: "Public API / developer access",
      status: apiStatus === 200 || apiAltStatus === 200 ? "PASS" : "WARN",
      detail: apiStatus === 200 || apiAltStatus === 200
        ? "API endpoint or documentation found."
        : "No public API detected — an API unlocks integrations, Zapier/Make.com workflows, and developer-led growth.",
    });

    checks.push({
      category: "SaaS Readiness",
      checkKey: "affiliate_program",
      label: "Affiliate / referral program",
      status: affiliateStatus === 200 || affiliateAltStatus === 200 ? "PASS" : "WARN",
      detail: affiliateStatus === 200 || affiliateAltStatus === 200
        ? "Affiliate or referral program page found — word-of-mouth growth enabled."
        : "No affiliate or referral program — referral programs can generate 15–30% of SaaS revenue.",
    });

    checks.push({
      category: "SaaS Readiness",
      checkKey: "security_trust_page",
      label: "Security / trust page",
      status: securityPageStatus === 200 || trustPageStatus === 200 ? "PASS" : "WARN",
      detail: securityPageStatus === 200 || trustPageStatus === 200
        ? "Security or trust page found — enterprise procurement friction reduced."
        : "No security page — enterprise buyers complete security questionnaires; a /security page pre-empts them.",
    });

    const hasNotificationSignals = ["notification-center", "notification bell", "unread messages", "inbox notifications"].some((s) => htmlLower.includes(s)) ||
      /class=["'][^"']*notif[^"']*["']/i.test(pageResult.html);
    checks.push({
      category: "SaaS Readiness",
      checkKey: "in_app_notifications",
      label: "In-app notification system",
      status: hasNotificationSignals ? "PASS" : "WARN",
      detail: hasNotificationSignals
        ? "In-app notification signals detected."
        : "No notification system — in-app notifications drive feature adoption and reduce churn.",
    });
    } // end if (ctx.isSaas)

    // ─── Additional Observability ──────────────────────────────────────────────
    if (!ctx.hasBackend) {
      skipChecks(checks, "Observability", [
        ["uptime_monitoring", "External uptime monitoring"],
        ["log_aggregation", "Centralised log aggregation"],
        ["apm_signals", "Application Performance Monitoring (APM)"],
        ["real_user_monitoring", "Real User Monitoring (RUM)"],
      ], "Skipped — no backend or server-side signals detected on this project.");
    } else {
    const uptimeSignals = ["statuspage.io", "betteruptime.com", "uptimerobot", "pingdom", "freshping", "checkly", "hyperping"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "Observability",
      checkKey: "uptime_monitoring",
      label: "External uptime monitoring",
      status: uptimeSignals ? "PASS" : "WARN",
      detail: uptimeSignals
        ? "External uptime monitoring service detected."
        : "No uptime monitoring — you won't know about outages before users tweet about them.",
    });

    const logAggregationSignals = ["papertrail", "logtail", "logflare", "axiom", "betterstack", "baselime"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "Observability",
      checkKey: "log_aggregation",
      label: "Centralised log aggregation",
      status: logAggregationSignals ? "PASS" : "WARN",
      detail: logAggregationSignals
        ? "Log aggregation service detected."
        : "No log aggregation — debugging production issues without centralised logs takes 10× longer.",
    });

    const apmSignals = ["newrelic", "dynatrace", "appdynamics", "elastic apm", "scout apm", "sentry performance"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "Observability",
      checkKey: "apm_signals",
      label: "Application Performance Monitoring (APM)",
      status: apmSignals ? "PASS" : "WARN",
      detail: apmSignals
        ? "APM tool detected — transaction tracing and performance insights available."
        : "No APM detected — without transaction-level data, slow queries and N+1 problems go undetected.",
    });

    const rumSignals = ["speedcurve", "web-vitals", "lux.speedcurve", "perfume.js"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "Observability",
      checkKey: "real_user_monitoring",
      label: "Real User Monitoring (RUM)",
      status: rumSignals ? "PASS" : "WARN",
      detail: rumSignals
        ? "Real User Monitoring signals detected — field Core Web Vitals being collected."
        : "No RUM detected — lab performance data doesn't reflect real-world Core Web Vitals across user devices.",
    });
    } // end if (ctx.hasBackend)

    // ─── Additional Payments ──────────────────────────────────────────────────
    if (!ctx.isPaymentEnabled) {
      skipChecks(checks, "Payments", [
        ["payment_trust_badges", "Payment trust badges"],
        ["bnpl_options", "Buy Now Pay Later (BNPL)"],
        ["crypto_payments", "Cryptocurrency payment option"],
      ], "Skipped — no payment integration detected on this project.");
    } else {
    const hasPciTrustBadge = ["pci dss", "pci-dss", "payment security", "256-bit encryption", "ssl secured checkout"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "Payments",
      checkKey: "payment_trust_badges",
      label: "Payment trust badges",
      status: hasPciTrustBadge ? "PASS" : "WARN",
      detail: hasPciTrustBadge
        ? "Payment security trust signals detected — checkout conversion improved."
        : "No payment trust badges near checkout — SSL/PCI badges reduce cart abandonment by up to 30%.",
    });

    const hasBnpl = ["klarna", "afterpay", "affirm", "clearpay", "laybuy", "zip pay", "sezzle", "buy now pay later"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "Payments",
      checkKey: "bnpl_options",
      label: "Buy Now Pay Later (BNPL)",
      status: hasBnpl ? "PASS" : "WARN",
      detail: hasBnpl
        ? "BNPL option detected — large purchase friction reduced."
        : "No BNPL option — Klarna/Afterpay increases average order value by up to 45% for higher-priced products.",
    });

    const hasCryptoPayments = ["bitcoin", "ethereum", " usdc", "coinbase commerce", "bitpay", "nowpayments", "crypto payment"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "Payments",
      checkKey: "crypto_payments",
      label: "Cryptocurrency payment option",
      status: hasCryptoPayments ? "PASS" : "WARN",
      detail: hasCryptoPayments
        ? "Cryptocurrency payment option detected."
        : "No crypto payments — a growing segment prefers crypto; easy to add via Coinbase Commerce.",
    });
    } // end if (ctx.isPaymentEnabled)

    // ─── Additional App Store & Mobile ─────────────────────────────────────────
    if (!ctx.isMobileApp) {
      skipChecks(checks, "App Store & Mobile", [
        ["smart_app_banner_meta", "Smart App Banner (iOS web-to-app)"],
        ["amazon_app_store", "Amazon Appstore / Fire TV presence"],
        ["app_listing_screenshots", "App screenshots / listing assets"],
        ["app_icon_sizes", "App icon multiple resolutions"],
      ], "Skipped — no mobile app signals detected on this project.");
    } else {
    checks.push({
      category: "App Store & Mobile",
      checkKey: "smart_app_banner_meta",
      label: "Smart App Banner (iOS web-to-app)",
      status: hasAppleSmartBanner ? "PASS" : "WARN",
      detail: hasAppleSmartBanner
        ? "apple-itunes-app meta tag found — iOS users see a Smart App Banner to download the native app."
        : "No Smart App Banner — add <meta name=apple-itunes-app> to drive web-to-native app installs on iOS.",
    });

    const hasAmazonAppStore = htmlLower.includes("amazon.com/apps") || htmlLower.includes("amazon appstore") || htmlLower.includes("amazon underground");
    checks.push({
      category: "App Store & Mobile",
      checkKey: "amazon_app_store",
      label: "Amazon Appstore / Fire TV presence",
      status: hasAmazonAppStore ? "PASS" : "WARN",
      detail: hasAmazonAppStore
        ? "Amazon Appstore link detected — Fire tablet and Fire TV market addressed."
        : "No Amazon Appstore link — consider Amazon Appstore for Fire tablet reach and LATAM/emerging market Android users.",
    });

    const multipleOgImages = (pageResult.html.match(/property=["']og:image["']/gi) ?? []).length > 1;
    const hasScreenshotAssets = multipleOgImages || htmlLower.includes("app-screenshot") || /class=["'][^"']*screenshot[^"']*["']/i.test(pageResult.html);
    checks.push({
      category: "App Store & Mobile",
      checkKey: "app_listing_screenshots",
      label: "App screenshots / listing assets",
      status: hasScreenshotAssets ? "PASS" : "WARN",
      detail: hasScreenshotAssets
        ? "Multiple OG images or screenshot assets detected — store listing quality enhanced."
        : "No dedicated screenshot assets — App Store and Play Store listings require 3–8 high-quality screenshots.",
    });

    const appleTouchIconCount = (pageResult.html.match(/apple-touch-icon/gi) ?? []).length;
    checks.push({
      category: "App Store & Mobile",
      checkKey: "app_icon_sizes",
      label: "App icon multiple resolutions",
      status: appleTouchIconCount >= 2 ? "PASS" : appleTouchIconCount === 1 ? "WARN" : "WARN",
      detail: appleTouchIconCount >= 2
        ? `${appleTouchIconCount} Apple touch icon sizes detected — iOS device resolutions covered.`
        : appleTouchIconCount === 1
          ? "Only one Apple touch icon size — add 60×60, 76×76, 120×120, and 180×180 variants for full iOS support."
          : "No Apple touch icon — required for iOS home screen installation and App Store submission.",
    });
    } // end if (ctx.isMobileApp) — additional App Store section

    // ─── Additional Global Distribution ────────────────────────────────────────
    const hasCountrySelector = /country[\s-]?selector|region[\s-]?selector|select[\s\S]{0,200}country/i.test(pageResult.html) || htmlLower.includes("country-dropdown");
    checks.push({
      category: "Global Distribution",
      checkKey: "country_region_selector",
      label: "Country / region selector",
      status: hasCountrySelector ? "PASS" : "WARN",
      detail: hasCountrySelector
        ? "Country or region selector detected — users can choose their market."
        : "No country/region selector — global users expect to set their region for localised pricing and content.",
    });

    const hasComplianceBadge = ["soc 2", "soc2", "iso 27001", "iso27001", "gdpr compliant", "hipaa compliant", "pci dss certified"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "Global Distribution",
      checkKey: "compliance_certifications",
      label: "Compliance certifications (SOC 2, ISO 27001)",
      status: hasComplianceBadge ? "PASS" : "WARN",
      detail: hasComplianceBadge
        ? "Compliance certification badge detected — enterprise trust signals present."
        : "No compliance certifications visible — SOC 2 Type II is the minimum bar for enterprise B2B SaaS sales.",
    });

    const hasEuHostingSignal = htmlLower.includes("eu-west") || htmlLower.includes("eu-central") || htmlLower.includes("europe-west") || (htmlLower.includes("gdpr") && htmlLower.includes("eu data"));
    checks.push({
      category: "Global Distribution",
      checkKey: "eu_data_residency",
      label: "EU data residency signals",
      status: hasEuHostingSignal ? "PASS" : "WARN",
      detail: hasEuHostingSignal
        ? "EU data residency signals detected — GDPR data sovereignty requirements may be met."
        : "No EU data residency signals — EU enterprise buyers require data to stay within the EU under GDPR.",
    });

    const hasCompanyRegistration = /company (number|reg|registration)|registered in|vat number|registered company|\b(ltd|llc|inc|gmbh|bv|ab)\b/i.test(pageResult.html);
    checks.push({
      category: "Global Distribution",
      checkKey: "company_registration_info",
      label: "Company registration info",
      status: hasCompanyRegistration ? "PASS" : "WARN",
      detail: hasCompanyRegistration
        ? "Company registration details detected in page — legal entity transparency confirmed."
        : "No company registration visible — EU regulations require displaying registered company name and number in footer.",
    });

    const hasTimezoneAware = ["timezone", "time zone", "local time", "utc offset", "intl.datetimeformat"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "Global Distribution",
      checkKey: "timezone_locale_support",
      label: "Timezone / locale-aware content",
      status: hasTimezoneAware ? "PASS" : "WARN",
      detail: hasTimezoneAware
        ? "Timezone or locale-aware content signals detected."
        : "No timezone handling — dates and times should display in the user's local timezone for a global product.",
    });

    // ─── Trust & Brand ─────────────────────────────────────────────────────────
    const hasSocialLinks = ["twitter.com/", "x.com/", "linkedin.com/company", "github.com/", "instagram.com/", "youtube.com/"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "Trust & Brand",
      checkKey: "social_media_links",
      label: "Social media presence",
      status: hasSocialLinks ? "PASS" : "WARN",
      detail: hasSocialLinks
        ? "Social media links detected — brand is findable and building a public presence."
        : "No social media links — add Twitter/X, LinkedIn, and GitHub in the footer for brand credibility.",
    });

    const hasThirdPartyReviews = ["trustpilot", "g2.com", "capterra", "producthunt.com", "getapp.com", "software advice"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "Trust & Brand",
      checkKey: "third_party_reviews",
      label: "Third-party review platform",
      status: hasThirdPartyReviews ? "PASS" : "WARN",
      detail: hasThirdPartyReviews
        ? "Third-party review platform link or widget detected."
        : "No review platform links — Trustpilot or G2 badges add verifiable social proof; 72% of buyers trust reviews.",
    });

    const hasPressCoverage = ["as seen in", "featured in", "as featured in", "press coverage", "in the press", "media coverage"].some((s) => htmlLower.includes(s));
    checks.push({
      category: "Trust & Brand",
      checkKey: "press_coverage",
      label: "Press / media coverage section",
      status: hasPressCoverage ? "PASS" : "WARN",
      detail: hasPressCoverage
        ? "Press or media coverage section detected."
        : "No press coverage section — even one article mention adds significant credibility.",
    });

    const hasTeamPresence = (["founder", "our team", "meet the team", "co-founder"].some((s) => htmlLower.includes(s))) &&
      /<img[^>]+src=["'][^"']+["'][^>]*>/i.test(pageResult.html);
    checks.push({
      category: "Trust & Brand",
      checkKey: "team_presence",
      label: "Founder / team bio with photo",
      status: hasTeamPresence ? "PASS" : "WARN",
      detail: hasTeamPresence
        ? "Team or founder presence with images detected — human accountability builds trust."
        : "No visible founder or team bio — vibe-coded apps feel anonymous; a human face increases conversion.",
    });

    const hasProductHunt = htmlLower.includes("producthunt.com") || htmlLower.includes("product hunt") || htmlLower.includes("ph-badge");
    checks.push({
      category: "Trust & Brand",
      checkKey: "product_hunt_badge",
      label: "Product Hunt launch presence",
      status: hasProductHunt ? "PASS" : "WARN",
      detail: hasProductHunt
        ? "Product Hunt badge or link detected — launch community engaged."
        : "No Product Hunt presence — a PH launch generates early adopters, press, and social proof.",
    });

    checks.push({
      category: "Trust & Brand",
      checkKey: "media_kit",
      label: "Media kit / brand assets",
      status: mediaKitStatus === 200 || brandKitStatus === 200 ? "PASS" : "WARN",
      detail: mediaKitStatus === 200 || brandKitStatus === 200
        ? "Media kit or brand assets page found — journalists and partners have correct branding."
        : "No media kit — journalists and partners need logo files and brand guidelines at /media-kit.",
    });

    // ─── Code Quality (URL-detectable) ─────────────────────────────────────────
    const hasPlaceholderText = pageResult.html.toLowerCase().includes("lorem ipsum") || pageResult.html.toLowerCase().includes("placeholder text here");
    checks.push({
      category: "Code Quality",
      checkKey: "no_placeholder_text",
      label: "No placeholder / lorem ipsum content",
      status: hasPlaceholderText ? "FAIL" : "PASS",
      detail: hasPlaceholderText
        ? "Lorem ipsum or placeholder text detected — vibe-coded apps often ship with unfilled copy blocks."
        : "No placeholder text detected in page source.",
    });

    const hasHashRouting = /#\/[a-z]/i.test(pageResult.html) || htmlLower.includes("hashrouter") || htmlLower.includes("hash-router");
    checks.push({
      category: "Code Quality",
      checkKey: "no_hash_routing",
      label: "Clean URL routing (no hash routes)",
      status: hasHashRouting ? "WARN" : "PASS",
      detail: hasHashRouting
        ? "Hash-based routing detected (#/path) — search engines cannot index hash routes; use HTML5 history API routing."
        : "No hash routing detected — URL structure appears SEO-friendly.",
    });

    // ─── A1: Email Security (DNS-over-HTTPS) ──────────────────────────────────
    async function checkDnsRecord(name: string, type: string): Promise<string[]> {
      try {
        const res = await fetchWithTimeout(
          `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`,
          { headers: { Accept: "application/dns-json" } },
        );
        if (!res.ok) return [];
        const json = await res.json() as { Answer?: { data: string }[] };
        return (json.Answer ?? []).map((a) => a.data);
      } catch {
        return [];
      }
    }

    try {
      const [spfRecords, dmarcRecords, mxRecords] = await Promise.all([
        checkDnsRecord(hostname, "TXT"),
        checkDnsRecord(`_dmarc.${hostname}`, "TXT"),
        checkDnsRecord(hostname, "MX"),
      ]);

      const hasSpf = spfRecords.some((r) => r.includes("v=spf1"));
      checks.push({
        category: "Security",
        checkKey: "spf_record",
        label: "SPF record (email spoofing protection)",
        status: hasSpf ? "PASS" : "WARN",
        detail: hasSpf
          ? "SPF record found — mail server authenticity is declared."
          : "No SPF record found. SPF authenticates which mail servers can send on your behalf. Without it, anyone can spoof your domain in phishing emails.",
      });

      const hasDmarc = dmarcRecords.some((r) => r.includes("v=DMARC1"));
      checks.push({
        category: "Security",
        checkKey: "dmarc_record",
        label: "DMARC record (email impersonation protection)",
        status: hasDmarc ? "PASS" : "WARN",
        detail: hasDmarc
          ? "DMARC record found — email authentication policy is published."
          : "No DMARC record. DMARC builds on SPF/DKIM and tells receiving servers what to do with unauthenticated email. Essential to prevent domain impersonation.",
      });

      const hasMx = mxRecords.length > 0;
      checks.push({
        category: "Infrastructure",
        checkKey: "mx_record",
        label: "MX records (email infrastructure)",
        status: hasMx ? "PASS" : "WARN",
        detail: hasMx
          ? `MX records found — email infrastructure is declared (${mxRecords.length} record${mxRecords.length !== 1 ? "s" : ""}).`
          : "No MX records detected — the domain may not be configured to receive email.",
      });
    } catch {
      checks.push(
        { category: "Security", checkKey: "spf_record", label: "SPF record (email spoofing protection)", status: "WARN", detail: "Could not verify SPF record — DNS lookup failed." },
        { category: "Security", checkKey: "dmarc_record", label: "DMARC record (email impersonation protection)", status: "WARN", detail: "Could not verify DMARC record — DNS lookup failed." },
        { category: "Infrastructure", checkKey: "mx_record", label: "MX records (email infrastructure)", status: "WARN", detail: "Could not verify MX records — DNS lookup failed." },
      );
    }

    // ─── A2: Sensitive Path Exposure ──────────────────────────────────────────
    async function checkPaths(baseUrl: string, paths: string[], timeoutMs = 3000): Promise<number[]> {
      const results = await Promise.allSettled(
        paths.map((p) =>
          fetch(`${baseUrl}${p}`, {
            method: "HEAD",
            redirect: "follow",
            signal: AbortSignal.timeout(timeoutMs),
            headers: { "User-Agent": "Gitwork-Pulse/1.0" },
          }).then((r) => r.status).catch(() => 0),
        ),
      );
      return results.map((r) => (r.status === "fulfilled" ? r.value : 0));
    }

    const [adminStatuses, phpInfoStatuses, gitConfigStatus, debugStatuses, backupStatuses] = await Promise.all([
      checkPaths(httpsUrl, ["/admin", "/wp-admin"]),
      checkPaths(httpsUrl, ["/phpinfo.php", "/info.php"]),
      checkPaths(httpsUrl, ["/.git/config"]).then((s) => s[0]),
      checkPaths(httpsUrl, ["/telescope", "/__clockwork", "/horizon", "/_debug"]),
      checkPaths(httpsUrl, ["/backup.sql", "/dump.sql", "/.env.bak", "/db.sql"]),
    ]);

    const adminExposed = adminStatuses.some((s) => s === 200);
    checks.push({
      category: "Security",
      checkKey: "no_exposed_admin",
      label: "Admin panel not publicly accessible",
      status: adminExposed ? "WARN" : "PASS",
      detail: adminExposed
        ? "An admin path (/admin or /wp-admin) returned HTTP 200 — verify it requires authentication. Exposed admin panels are prime targets for credential stuffing attacks."
        : "Admin paths not freely accessible.",
    });

    const phpInfoExposed = phpInfoStatuses.some((s) => s === 200);
    checks.push({
      category: "Security",
      checkKey: "no_exposed_phpinfo",
      label: "PHP info page not exposed",
      status: phpInfoExposed ? "FAIL" : "PASS",
      detail: phpInfoExposed
        ? "phpinfo.php or info.php returned HTTP 200 — this file exposes PHP version, server paths, loaded extensions, and environment variables to attackers."
        : "No exposed PHP info pages detected.",
    });

    checks.push({
      category: "Security",
      checkKey: "no_exposed_git_config",
      label: "Git config not publicly accessible",
      status: gitConfigStatus === 200 ? "FAIL" : "PASS",
      detail: gitConfigStatus === 200
        ? "/.git/config is publicly accessible — this reveals repository URLs, credentials, and project structure. Remove or block access immediately."
        : "Git config not publicly accessible.",
    });

    const debugExposed = debugStatuses.some((s) => s === 200);
    checks.push({
      category: "Security",
      checkKey: "no_debug_endpoints",
      label: "Debug/monitoring endpoints not public",
      status: debugExposed ? "WARN" : "PASS",
      detail: debugExposed
        ? "A debug endpoint (/telescope, /__clockwork, /horizon, or /_debug) returned HTTP 200 — these expose internal request logs, jobs, and performance data."
        : "Debug and monitoring endpoints are not publicly accessible.",
    });

    const backupExposed = backupStatuses.some((s) => s === 200);
    checks.push({
      category: "Security",
      checkKey: "no_exposed_backup",
      label: "Database backup files not exposed",
      status: backupExposed ? "FAIL" : "PASS",
      detail: backupExposed
        ? "A database backup file (backup.sql, dump.sql, .env.bak, or db.sql) is publicly downloadable — this is a critical data breach risk."
        : "No exposed database backup files detected.",
    });

    // ─── A3: HTTP Protocol & Headers Quality ──────────────────────────────────
    const altSvcHeader = pageResult.headers["alt-svc"] ?? "";
    const http2Detected = altSvcHeader.includes("h2") || pageResult.headers["x-firefox-spdy"] === "h2";
    checks.push({
      category: "Performance",
      checkKey: "http2_enabled",
      label: "HTTP/2 protocol",
      status: http2Detected ? "PASS" : "WARN",
      detail: http2Detected
        ? "HTTP/2 detected via alt-svc header — multiplexed connections improve load performance."
        : "Could not verify HTTP/2 support — consider upgrading for multiplexing benefits. Modern servers (Nginx 1.9.5+, Apache 2.4.17+) support HTTP/2 natively.",
    });

    const xPoweredBy = pageResult.headers["x-powered-by"];
    checks.push({
      category: "Security",
      checkKey: "no_x_powered_by",
      label: "X-Powered-By header absent",
      status: xPoweredBy ? "FAIL" : "PASS",
      detail: xPoweredBy
        ? `X-Powered-By is set to "${xPoweredBy}" — this exposes your backend technology to attackers who can target known vulnerabilities in that stack.`
        : "X-Powered-By header is not present — backend technology is not disclosed.",
    });

    const serverHeader = pageResult.headers["server"] ?? "";
    const serverHasVersion = /[\/]\d+\.\d+/.test(serverHeader);
    checks.push({
      category: "Security",
      checkKey: "no_server_version",
      label: "Server version not disclosed",
      status: serverHasVersion ? "FAIL" : "PASS",
      detail: serverHasVersion
        ? `Server header "${serverHeader}" includes a version number — attackers can target known CVEs for that exact version.`
        : serverHeader
          ? `Server header present ("${serverHeader}") but no version number disclosed.`
          : "Server header not present — server identity and version are not disclosed.",
    });

    const corsHeader = pageResult.headers["access-control-allow-origin"] ?? "";
    checks.push({
      category: "Security",
      checkKey: "cors_not_wildcard",
      label: "CORS not open to all origins",
      status: corsHeader === "*" ? "FAIL" : "PASS",
      detail: corsHeader === "*"
        ? "Access-Control-Allow-Origin: * allows any website to read your API responses, enabling data theft and CSRF-style attacks. Restrict to specific trusted origins."
        : corsHeader
          ? `CORS origin is restricted to "${corsHeader}".`
          : "No CORS header present on the main page.",
    });

    // ─── A4: Content Quality (HTML analysis) ──────────────────────────────────
    const strippedText = pageResult.html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const wordCount = strippedText.split(/\s+/).filter((w) => w.length > 0).length;
    checks.push({
      category: "SEO",
      checkKey: "has_word_count",
      label: "Sufficient page content",
      status: wordCount >= 300 ? "PASS" : wordCount >= 100 ? "WARN" : "FAIL",
      detail: wordCount >= 300
        ? `Page contains approximately ${wordCount.toLocaleString()} words — good content depth for SEO.`
        : wordCount >= 100
          ? `Page contains approximately ${wordCount.toLocaleString()} words — below the recommended 300 words for indexed pages.`
          : `Page contains only approximately ${wordCount.toLocaleString()} words — too thin for search engine indexing. Search engines prefer pages with substantial content.`,
    });

    const hasH1 = /<h1[\s>]/i.test(pageResult.html);
    const hasH2orH3 = /<h[23][\s>]/i.test(pageResult.html);
    checks.push({
      category: "SEO",
      checkKey: "has_heading_hierarchy",
      label: "Heading hierarchy (H1→H2→H3)",
      status: hasH1 && hasH2orH3 ? "PASS" : hasH1 ? "WARN" : "FAIL",
      detail: hasH1 && hasH2orH3
        ? "Heading hierarchy detected (H1 and sub-headings present)."
        : hasH1
          ? "H1 found but no H2/H3 sub-headings — add sub-headings to improve content structure and SEO."
          : "No heading tags detected — headings are critical for SEO and screen reader navigation.",
    });

    const imgTags = pageResult.html.match(/<img[^>]*>/gi) ?? [];
    const imgsWithAlt = imgTags.filter((img) => /\balt=/i.test(img)).length;
    const altCoverage = imgTags.length > 0 ? imgsWithAlt / imgTags.length : 1;
    checks.push({
      category: "Accessibility",
      checkKey: "image_alt_coverage",
      label: "Image alt text coverage",
      status: imgTags.length === 0 ? "PASS" : altCoverage >= 0.8 ? "PASS" : altCoverage >= 0.5 ? "WARN" : "FAIL",
      detail: imgTags.length === 0
        ? "No images detected on this page."
        : `${imgsWithAlt}/${imgTags.length} images have alt attributes (${Math.round(altCoverage * 100)}%). ${altCoverage < 0.8 ? "Missing alt text fails WCAG 1.1.1 and harms screen reader users." : "Good alt text coverage."}`,
    });

    const internalLinkPattern = new RegExp(`<a[^>]+href=["'](/|https?://${hostname.replace(".", "\\.")})[^"']*["']`, "gi");
    const internalLinkMatches = pageResult.html.match(internalLinkPattern) ?? [];
    const internalLinkCount = internalLinkMatches.length;
    checks.push({
      category: "SEO",
      checkKey: "internal_links_present",
      label: "Internal linking",
      status: internalLinkCount > 5 ? "PASS" : internalLinkCount >= 1 ? "WARN" : "FAIL",
      detail: internalLinkCount > 5
        ? `${internalLinkCount} internal links detected — good link structure for SEO crawling.`
        : internalLinkCount >= 1
          ? `Only ${internalLinkCount} internal link${internalLinkCount !== 1 ? "s" : ""} detected — add more internal links to distribute page authority and aid navigation.`
          : "No internal links detected — search engines cannot crawl deeper pages without internal links.",
    });

    const hasConsoleLogs = /console\.log\s*\(/.test(pageResult.html);
    checks.push({
      category: "Code Quality",
      checkKey: "no_broken_inline_scripts",
      label: "No console.log in production HTML",
      status: hasConsoleLogs ? "WARN" : "PASS",
      detail: hasConsoleLogs
        ? "console.log() calls found in page HTML — debug logging left in production code can expose sensitive data and signals poor build hygiene."
        : "No console.log statements detected in page source.",
    });

    // ─── A5: PWA & Offline Readiness ──────────────────────────────────────────
    const hasServiceWorker = /navigator\.serviceWorker|registerServiceWorker|["']sw\.js["']|service[-_]worker/i.test(pageResult.html);
    checks.push({
      category: "Performance",
      checkKey: "service_worker_present",
      label: "Service worker (offline/caching)",
      status: hasServiceWorker ? "PASS" : "WARN",
      detail: hasServiceWorker
        ? "Service worker detected — offline support and cache-first loading are enabled."
        : "No service worker detected. Service workers enable offline support, background sync, and dramatically faster repeat visits via cache-first loading.",
    });

    const hasManifestLink = /<link[^>]+rel=["']manifest["']/i.test(pageResult.html);
    checks.push({
      category: "Performance",
      checkKey: "web_app_manifest_linked",
      label: "Web app manifest linked",
      status: hasManifestLink ? "PASS" : "WARN",
      detail: hasManifestLink
        ? "Web app manifest linked — PWA install prompt and home screen support enabled."
        : "No <link rel=\"manifest\"> found. A manifest.json enables Add to Home Screen on mobile, defines app name/icons, and is required for PWA install prompts.",
    });

    const hasThemeColor = /<meta[^>]+name=["']theme-color["']/i.test(pageResult.html);
    checks.push({
      category: "Performance",
      checkKey: "theme_color_defined",
      label: "Theme colour meta tag",
      status: hasThemeColor ? "PASS" : "WARN",
      detail: hasThemeColor
        ? "theme-color meta tag found — browser UI will match brand colour on mobile."
        : "No theme-color meta tag. theme-color customises the browser UI colour on mobile, improving brand recognition.",
    });

    // ─── A6: Third-Party Script Risk ──────────────────────────────────────────
    const scriptSrcMatches = pageResult.html.match(/<script[^>]+src=["']([^"']+)["']/gi) ?? [];
    const externalScriptDomains = new Set<string>();
    const oldJqueryFound: string[] = [];
    for (const tag of scriptSrcMatches) {
      const srcMatch = tag.match(/src=["']([^"']+)["']/i);
      if (!srcMatch) continue;
      const src = srcMatch[1];
      if (!src.startsWith("http")) continue;
      try {
        const scriptHostname = new URL(src).hostname;
        if (scriptHostname !== hostname) {
          externalScriptDomains.add(scriptHostname);
        }
      } catch { /* ignore */ }
      if (/jquery[-/]([12])\.\d+/i.test(src) || /jquery[-/]1\.\d+|jquery[-/]2\.\d+/i.test(src)) {
        oldJqueryFound.push(src);
      }
    }
    const thirdPartyDomainCount = externalScriptDomains.size;
    checks.push({
      category: "Performance",
      checkKey: "third_party_script_count",
      label: "Third-party script load",
      status: thirdPartyDomainCount <= 5 ? "PASS" : thirdPartyDomainCount <= 12 ? "WARN" : "FAIL",
      detail: thirdPartyDomainCount <= 5
        ? `${thirdPartyDomainCount} external script domain${thirdPartyDomainCount !== 1 ? "s" : ""} — reasonable third-party dependency footprint.`
        : `${thirdPartyDomainCount} external script domains — each is a DNS lookup and potential supply-chain attack vector. Audit and consolidate where possible.`,
      evidence: thirdPartyDomainCount > 0 ? [...externalScriptDomains].slice(0, 5).join(", ") : undefined,
    });

    checks.push({
      category: "Code Quality",
      checkKey: "no_jquery_old",
      label: "No outdated jQuery",
      status: oldJqueryFound.length > 0 ? "FAIL" : "PASS",
      detail: oldJqueryFound.length > 0
        ? `Old jQuery version detected (${oldJqueryFound[0]}) — jQuery 1.x/2.x has known XSS and prototype pollution vulnerabilities and is no longer maintained.`
        : "No outdated jQuery (1.x/2.x) detected.",
    });

    // ─── A7: SaaS / Business Signals ──────────────────────────────────────────
    const hasAnnualBilling = /annual|yearly|per year|save\s+\d|\bsave\b.*year|year.*save/i.test(pageResult.html);
    checks.push({
      category: "SaaS Readiness",
      checkKey: "annual_billing_signal",
      label: "Annual billing option",
      status: hasAnnualBilling ? "PASS" : "WARN",
      detail: hasAnnualBilling
        ? "Annual billing option detected — cash flow and churn reduction signals present."
        : "No annual billing signal found. Annual billing reduces churn by ~50% and improves cash flow. Most SaaS buyers expect a monthly vs annual toggle.",
    });

    const hasMoneyBack = /money[\s-]back|30[\s-]day|14[\s-]day|7[\s-]day|\brefund\b/i.test(pageResult.html);
    checks.push({
      category: "SaaS Readiness",
      checkKey: "money_back_signal",
      label: "Money-back guarantee signal",
      status: hasMoneyBack ? "PASS" : "WARN",
      detail: hasMoneyBack
        ? "Money-back guarantee or refund policy signal detected — purchase anxiety reduced."
        : "No money-back guarantee signal. A clearly stated refund policy reduces purchase anxiety and increases conversion rates.",
    });

    const hasLiveChat = /\b(intercom|crisp|tidio|drift|hubspot|freshchat|zendesk|tawk|liveagent|chatra|helpscout)\b/i.test(pageResult.html);
    checks.push({
      category: "SaaS Readiness",
      checkKey: "live_chat_signal",
      label: "Live chat / support widget",
      status: hasLiveChat ? "PASS" : "WARN",
      detail: hasLiveChat
        ? "Live chat or support widget detected — real-time support capability present."
        : "No live chat widget detected. Live chat can increase conversions by 20-40% and is now expected in SaaS products.",
    });

    const hasDemoBooking = /book\s+a\s+demo|schedule\s+a\s+demo|book\s+a\s+call|calendly\.com|cal\.com|book\s+demo/i.test(pageResult.html);
    checks.push({
      category: "SaaS Readiness",
      checkKey: "demo_booking_signal",
      label: "Demo booking or discovery call",
      status: hasDemoBooking ? "PASS" : "WARN",
      detail: hasDemoBooking
        ? "Demo booking or discovery call signal detected — sales-assist motion is supported."
        : "No demo booking path detected. A demo booking option is essential for PLG → sales-assist motion and enterprise prospects.",
    });

    const hasSocialProofNumbers = /\b\d[\d,]*\s*[k+]\s*(users?|customers?|teams?|companies|businesses)|\b\d[\d,]*\+\s*(users?|customers?|teams?)|\b(users?|customers?|teams?|companies)\s*\d[\d,]*[k+]?/i.test(pageResult.html);
    checks.push({
      category: "Trust & Brand",
      checkKey: "social_proof_numbers",
      label: "Quantified social proof",
      status: hasSocialProofNumbers ? "PASS" : "WARN",
      detail: hasSocialProofNumbers
        ? "Quantified social proof (numeric user/customer count) detected — specific numbers build credibility."
        : "No numeric social proof found. Specific numbers ('10,000 teams') convert 3x better than vague claims ('thousands of customers').",
    });

    const hasVideoEmbed = /youtube\.com\/embed|loom\.com\/embed|vimeo\.com\/video|wistia\.com|mux\.com/i.test(pageResult.html);
    checks.push({
      category: "SaaS Readiness",
      checkKey: "video_embed_present",
      label: "Product demo video",
      status: hasVideoEmbed ? "PASS" : "WARN",
      detail: hasVideoEmbed
        ? "Product demo video embed detected — visual product demonstration available."
        : "No product demo video detected. A demo video on the landing page typically increases conversion rate by 20-80%.",
    });

    // ─── A8: Developer / API Signals ──────────────────────────────────────────
    const hasApiDocsSignal = /api\s+docs|api\s+reference|developer\s+docs?\b/i.test(pageResult.html) ||
      /href=["'][^"']*\/(docs|api-docs|developers|api\/docs)[^"']*["']/i.test(pageResult.html);
    checks.push({
      category: "SaaS Readiness",
      checkKey: "api_docs_signal",
      label: "API documentation",
      status: hasApiDocsSignal ? "PASS" : "WARN",
      detail: hasApiDocsSignal
        ? "API documentation link or reference detected — developer resources are accessible."
        : "No API documentation signals found. API docs are essential for technical buyers and integration partners.",
    });

    const [openApiStatuses] = await Promise.all([
      checkPaths(httpsUrl, ["/openapi.json", "/openapi.yaml", "/swagger.json", "/api-docs"]),
    ]);
    const hasOpenApiEndpoint = openApiStatuses.some((s) => s === 200);
    checks.push({
      category: "SaaS Readiness",
      checkKey: "openapi_endpoint",
      label: "OpenAPI spec endpoint",
      status: hasOpenApiEndpoint ? "PASS" : "WARN",
      detail: hasOpenApiEndpoint
        ? "OpenAPI/Swagger spec endpoint found — machine-readable API spec enables auto-generated SDKs and Postman imports."
        : "No OpenAPI spec endpoint found. A machine-readable API spec enables auto-generated SDKs, Postman imports, and reduces integration friction.",
    });

    const hasGraphqlInHtml = /\bgraphql\b/i.test(pageResult.html);
    const graphqlPathStatus = await checkPaths(httpsUrl, ["/graphql"]).then((s) => s[0]);
    const hasGraphql = hasGraphqlInHtml || graphqlPathStatus === 200;
    checks.push({
      category: "SaaS Readiness",
      checkKey: "graphql_signal",
      label: "GraphQL API",
      status: hasGraphql ? "PASS" : "WARN",
      detail: hasGraphql
        ? "GraphQL API signal detected — flexible query API available for clients."
        : "No GraphQL signals found. GraphQL reduces over-fetching and enables flexible client queries. Common in modern developer platforms.",
    });

    // ─── A9: Conversion & UX Signals ──────────────────────────────────────────
    const hasSearch = /<input[^>]+type=["']search["']/i.test(pageResult.html) ||
      /role=["']search["']/i.test(pageResult.html) ||
      /placeholder=["'][^"']*search[^"']*["']/i.test(pageResult.html) ||
      /\b(algolia|typesense|fuse\.js)\b/i.test(pageResult.html);
    checks.push({
      category: "SaaS Readiness",
      checkKey: "search_functionality",
      label: "Search functionality",
      status: hasSearch ? "PASS" : "WARN",
      detail: hasSearch
        ? "Search functionality detected — users can find content without manual navigation."
        : "No search functionality detected. Apps without search force users to navigate manually — search reduces time-to-value.",
    });

    const hasGranularConsent = /accept\s+all|reject\s+all|manage\s+(cookies|preferences)/i.test(pageResult.html);
    const hasBasicConsent = /cookie\s*(consent|banner|notice)|we\s+use\s+cookies|this\s+site\s+uses\s+cookies/i.test(pageResult.html);
    checks.push({
      category: "Legal & Compliance",
      checkKey: "cookie_consent_granular",
      label: "Granular cookie consent (accept/reject all)",
      status: hasGranularConsent ? "PASS" : hasBasicConsent ? "WARN" : "FAIL",
      detail: hasGranularConsent
        ? "Granular cookie consent (accept all / reject all / manage preferences) detected — GDPR-compliant consent flow."
        : hasBasicConsent
          ? "Basic cookie notice detected but no reject/manage options — GDPR requires granular consent with the ability to decline non-essential cookies."
          : "No cookie consent mechanism detected — required by GDPR, ePrivacy Directive, and CCPA for sites using tracking cookies.",
    });

    const hasNewsletter = /newsletter|\bsubscribe\b|mailing\s+list|email\s+updates/i.test(pageResult.html);
    checks.push({
      category: "SaaS Readiness",
      checkKey: "newsletter_signup",
      label: "Newsletter / email list capture",
      status: hasNewsletter ? "PASS" : "WARN",
      detail: hasNewsletter
        ? "Newsletter or email capture detected — email list building is in place."
        : "No newsletter or email signup detected. Email lists compound over time — a newsletter is one of the highest-ROI acquisition channels for SaaS.",
    });

  } else {
    // Site unreachable — mark remaining checks as FAIL
    const failedChecks: Array<[string, string, string]> = [
      ["Infrastructure", "http_redirect", "HTTP → HTTPS redirect"],
      ["Infrastructure", "response_time", "Response time"],
      ["Infrastructure", "status_200", "Returns 200 OK"],
      ["Infrastructure", "custom_domain", "Custom domain"],
      ["Infrastructure", "cdn_detected", "CDN present"],
      ["SEO", "meta_title", "<title> tag"],
      ["SEO", "meta_description", "Meta description"],
      ["SEO", "og_tags", "Open Graph tags"],
      ["SEO", "canonical_url", "Canonical URL"],
      ["SEO", "h1_present", "H1 heading"],
      ["SEO", "has_robots_txt", "robots.txt"],
      ["SEO", "has_sitemap", "sitemap.xml"],
      ["Security", "csp_header", "Content-Security-Policy"],
      ["Security", "hsts_header", "HSTS header"],
      ["Security", "x_frame_options", "Clickjacking protection"],
      ["Security", "no_exposed_env", ".env not public"],
      ["Security", "no_exposed_git", ".git directory not public"],
      ["Performance", "compression", "Gzip/Brotli compression"],
      ["Performance", "caching_headers", "Cache-Control headers"],
      ["Payments", "stripe_signals", "Stripe integration"],
      ["Payments", "pricing_page", "Pricing/billing UI"],
      ["Authentication", "auth_ui_signals", "Login/signup UI"],
      ["Authentication", "oauth_signals", "Auth provider"],
      ["Observability", "error_monitoring", "Error monitoring"],
      ["Observability", "analytics_present", "Analytics"],
      ["Observability", "health_endpoint", "/health endpoint"],
      ["Legal & Compliance", "privacy_policy", "Privacy Policy"],
      ["Legal & Compliance", "terms_of_service", "Terms of Service"],
      ["Legal & Compliance", "cookie_consent", "Cookie consent / GDPR"],
      ["Legal & Compliance", "refund_policy", "Refund / Cancellation policy"],
      ["Missing Pages", "about_page", "About / Team page"],
      ["Missing Pages", "contact_page", "Contact page"],
      ["Missing Pages", "faq_page", "FAQ / Help page"],
      ["Missing Pages", "status_page", "Status / uptime page"],
      ["Missing Pages", "changelog", "Changelog / What's new"],
      ["SaaS Readiness", "billing_portal", "Billing / subscription management"],
      ["SaaS Readiness", "account_settings", "Account settings"],
      ["SaaS Readiness", "password_reset", "Password reset"],
      ["SaaS Readiness", "support_channel", "Support channel"],
      ["SaaS Readiness", "social_proof", "Social proof / testimonials"],
      ["SaaS Readiness", "onboarding_flow", "Onboarding flow"],
      ["Mobile & Accessibility", "viewport_meta", "Viewport meta tag"],
      ["Mobile & Accessibility", "html_lang", "HTML language attribute"],
      ["Mobile & Accessibility", "aria_attributes", "ARIA accessibility attributes"],
      ["Mobile & Accessibility", "responsive_images", "Responsive / optimised images"],
      ["SEO", "og_image", "og:image (social preview)"],
      ["SEO", "twitter_card", "Twitter / X Card"],
      ["Security", "x_content_type_options", "X-Content-Type-Options"],
      ["Security", "permissions_policy", "Permissions-Policy"],
      ["Security", "referrer_policy", "Referrer-Policy"],
      ["SaaS Readiness", "email_provider", "Transactional email provider"],
      ["Code Quality", "ai_platform_origin", "AI platform watermark"],
      ["Mobile & Accessibility", "favicon", "Favicon / app icon"],
      ["Mobile & Accessibility", "pwa_manifest", "Web App Manifest (PWA)"],
      ["Payments", "stripe_webhook", "Stripe webhook endpoint"],
      ["App Store & Mobile", "apple_touch_icon", "Apple touch icon"],
      ["App Store & Mobile", "apple_app_store", "Apple App Store presence"],
      ["App Store & Mobile", "google_play_store", "Google Play Store presence"],
      ["App Store & Mobile", "universal_links", "Universal Links (iOS deep linking)"],
      ["App Store & Mobile", "android_asset_links", "Android App Links (deep linking)"],
      ["App Store & Mobile", "wallet_payments", "Apple Pay / Google Pay / Amazon Pay"],
      ["Global Distribution", "hreflang_tags", "hreflang tags (multi-region SEO)"],
      ["Global Distribution", "charset_utf8", "UTF-8 character encoding"],
      ["Global Distribution", "ccpa_compliance", "CCPA (California privacy rights)"],
      ["Global Distribution", "multi_currency", "Multi-currency pricing"],
      ["Global Distribution", "rtl_support", "RTL language support"],
      ["Global Distribution", "language_switcher", "Language / region switcher"],
      ["Global Distribution", "international_payments", "International payment methods"],
      ["Global Distribution", "eu_vat", "EU VAT / tax handling"],
      // Additional SEO
      ["SEO", "structured_data", "JSON-LD structured data"],
      ["SEO", "preload_hints", "Resource preload hints"],
      ["SEO", "search_engine_verified", "Search engine verification"],
      ["SEO", "meta_robots", "Robots meta tag"],
      ["SEO", "og_site_name", "og:site_name (brand in shares)"],
      // Additional Security
      ["Security", "subresource_integrity", "Subresource Integrity (SRI)"],
      ["Security", "secure_cookie_attributes", "Secure cookie attributes"],
      ["Security", "cors_policy", "CORS policy"],
      ["Security", "security_txt", "security.txt (responsible disclosure)"],
      ["Security", "server_header_leakage", "Server version not exposed"],
      ["Security", "no_mixed_content", "No mixed HTTP/HTTPS content"],
      // Additional Performance
      ["Performance", "preconnect_hints", "Preconnect / DNS prefetch hints"],
      ["Performance", "native_lazy_loading", "Native image lazy loading"],
      ["Performance", "font_display_swap", "Font display optimisation"],
      ["Performance", "vary_header", "Vary header (content negotiation)"],
      ["Performance", "server_timing", "Server-Timing header"],
      // Additional Authentication
      ["Authentication", "mfa_signals", "Multi-factor authentication (MFA)"],
      ["Authentication", "email_verification_flow", "Email verification flow"],
      ["Authentication", "magic_link_auth", "Magic link / passwordless login"],
      ["Authentication", "enterprise_sso", "Enterprise SSO / SAML"],
      // Additional Legal
      ["Legal & Compliance", "data_deletion_right", "Data deletion / right to erasure (GDPR Art. 17)"],
      ["Legal & Compliance", "accessibility_statement", "Accessibility statement"],
      ["Legal & Compliance", "coppa_signals", "COPPA / children's privacy"],
      ["Legal & Compliance", "dpa_available", "Data Processing Agreement (GDPR Art. 28)"],
      ["Legal & Compliance", "icp_license", "China ICP license (for CN market)"],
      ["Legal & Compliance", "privacy_last_updated", "Privacy policy maintenance date"],
      ["Legal & Compliance", "cookie_policy_page", "Dedicated cookie policy page"],
      ["Legal & Compliance", "gdpr_dpo_contact", "GDPR privacy contact (DPO)"],
      // Additional Missing Pages
      ["Missing Pages", "blog_resources", "Blog / resources hub"],
      ["Missing Pages", "careers_page", "Careers / jobs page"],
      ["Missing Pages", "press_media", "Press / media page"],
      ["Missing Pages", "documentation", "Documentation / developer docs"],
      ["Missing Pages", "integrations_page", "Integrations / partners page"],
      ["Missing Pages", "custom_404_page", "Custom 404 error page"],
      // Additional SaaS Readiness
      ["SaaS Readiness", "demo_booking", "Demo booking / discovery call"],
      ["SaaS Readiness", "free_trial_cta", "Free trial / free plan CTA"],
      ["SaaS Readiness", "api_availability", "Public API / developer access"],
      ["SaaS Readiness", "affiliate_program", "Affiliate / referral program"],
      ["SaaS Readiness", "security_trust_page", "Security / trust page"],
      ["SaaS Readiness", "in_app_notifications", "In-app notification system"],
      // Additional Observability
      ["Observability", "uptime_monitoring", "External uptime monitoring"],
      ["Observability", "log_aggregation", "Centralised log aggregation"],
      ["Observability", "apm_signals", "Application Performance Monitoring (APM)"],
      ["Observability", "real_user_monitoring", "Real User Monitoring (RUM)"],
      // Additional Payments
      ["Payments", "payment_trust_badges", "Payment trust badges"],
      ["Payments", "bnpl_options", "Buy Now Pay Later (BNPL)"],
      ["Payments", "crypto_payments", "Cryptocurrency payment option"],
      // Additional App Store & Mobile
      ["App Store & Mobile", "smart_app_banner_meta", "Smart App Banner (iOS web-to-app)"],
      ["App Store & Mobile", "amazon_app_store", "Amazon Appstore / Fire TV presence"],
      ["App Store & Mobile", "app_listing_screenshots", "App screenshots / listing assets"],
      ["App Store & Mobile", "app_icon_sizes", "App icon multiple resolutions"],
      // Additional Global Distribution
      ["Global Distribution", "country_region_selector", "Country / region selector"],
      ["Global Distribution", "compliance_certifications", "Compliance certifications (SOC 2, ISO 27001)"],
      ["Global Distribution", "eu_data_residency", "EU data residency signals"],
      ["Global Distribution", "company_registration_info", "Company registration info"],
      ["Global Distribution", "timezone_locale_support", "Timezone / locale-aware content"],
      // Trust & Brand (new category)
      ["Trust & Brand", "social_media_links", "Social media presence"],
      ["Trust & Brand", "third_party_reviews", "Third-party review platform"],
      ["Trust & Brand", "press_coverage", "Press / media coverage section"],
      ["Trust & Brand", "team_presence", "Founder / team bio with photo"],
      ["Trust & Brand", "product_hunt_badge", "Product Hunt launch presence"],
      ["Trust & Brand", "media_kit", "Media kit / brand assets"],
      // Code Quality (URL-detectable)
      ["Code Quality", "no_placeholder_text", "No placeholder / lorem ipsum content"],
      ["Code Quality", "no_hash_routing", "Clean URL routing (no hash routes)"],
    ];
    for (const [category, checkKey, label] of failedChecks) {
      checks.push({ category, checkKey, label, status: "FAIL", detail: "Could not reach the site." });
    }
  }

  const techStack = pageResult ? detectTechStack(pageResult.headers, pageResult.html) : [];
  return { checks: checks.map((check, i) => ({ ...check, sortOrder: i })), techStack };
}

type GitHubContentsEntry = { name: string; type: "file" | "dir" };
type GitHubContentsResponse = GitHubContentsEntry[] | { message?: string };

export async function runGithubChecks(repoInput: string): Promise<{ checks: PulseScanCheckInput[]; techStack: string[] }> {
  const parsed = parseGithubRepo(repoInput);
  const checks: PulseScanCheckInput[] = [];

  if (!parsed) {
    return {
      checks: [
        {
          category: "Code Quality",
          checkKey: "repo_parse",
          label: "Repository URL",
          status: "FAIL",
          detail: "Could not parse repository URL. Use 'owner/repo' or a full GitHub URL.",
        },
      ],
      techStack: [],
    };
  }

  const fullName = `${parsed.owner}/${parsed.repo}`;
  const contents = await safeGithubRequest<GitHubContentsResponse>(
    `/repos/${fullName}/contents`,
    [],
  );

  const entries = Array.isArray(contents) ? (contents as GitHubContentsEntry[]) : [];
  const names = entries.map((e) => e.name.toLowerCase());

  const hasReadme = names.some((n) => n.startsWith("readme"));
  const hasTests = names.some((n) => ["test", "tests", "__tests__", "spec", "specs"].includes(n));
  const hasLinter =
    names.includes("eslint.config.js") ||
    names.includes("eslint.config.mjs") ||
    names.includes(".eslintrc") ||
    names.includes(".eslintrc.js") ||
    names.includes("biome.json") ||
    names.includes(".prettierrc");
  const hasTs = names.includes("tsconfig.json");
  const hasEnvExample = names.includes(".env.example") || names.includes(".env.sample");
  const hasCi = names.includes(".github") || names.includes(".circleci");
  const hasLicense = names.some((n) => n.startsWith("license"));
  const hasPackageJson = names.includes("package.json");
  const hasPyProject = names.includes("pyproject.toml") || names.includes("requirements.txt");
  const hasManifest = hasPackageJson || hasPyProject || names.includes("cargo.toml") || names.includes("go.mod");
  const hasDockerfile = names.includes("dockerfile") || names.includes("docker-compose.yml") || names.includes("docker-compose.yaml");

  checks.push(
    {
      category: "Code Quality",
      checkKey: "has_readme",
      label: "README.md",
      status: hasReadme ? "PASS" : "FAIL",
      detail: hasReadme ? "README.md present." : "No README.md found.",
    },
    {
      category: "Code Quality",
      checkKey: "has_tests",
      label: "Test suite",
      status: hasTests ? "PASS" : "WARN",
      detail: hasTests ? "Test directory found." : "No test directory detected.",
    },
    {
      category: "Code Quality",
      checkKey: "has_linter",
      label: "Linter config",
      status: hasLinter ? "PASS" : "WARN",
      detail: hasLinter ? "Linting configuration found." : "No ESLint/Biome/Prettier config found.",
    },
    {
      category: "Code Quality",
      checkKey: "has_typescript",
      label: "TypeScript",
      status: hasTs ? "PASS" : "WARN",
      detail: hasTs ? "TypeScript configured (tsconfig.json found)." : "No TypeScript configuration found.",
    },
    {
      category: "Code Quality",
      checkKey: "has_env_example",
      label: ".env.example",
      status: hasEnvExample ? "PASS" : "WARN",
      detail: hasEnvExample ? ".env.example found." : "No .env.example file — environment setup is undocumented.",
    },
    {
      category: "Code Quality",
      checkKey: "ci_cd_present",
      label: "CI/CD pipeline",
      status: hasCi ? "PASS" : "WARN",
      detail: hasCi ? "CI/CD configuration found." : "No CI/CD configuration detected.",
    },
    {
      category: "Code Quality",
      checkKey: "has_license",
      label: "License file",
      status: hasLicense ? "PASS" : "WARN",
      detail: hasLicense ? "License file present." : "No license file found.",
    },
    {
      category: "Infrastructure",
      checkKey: "has_manifest",
      label: "Dependency manifest",
      status: hasManifest ? "PASS" : "WARN",
      detail: hasManifest ? "Dependency manifest found." : "No dependency manifest detected.",
    },
    {
      category: "Infrastructure",
      checkKey: "dockerfile_present",
      label: "Dockerfile / Docker Compose",
      status: hasDockerfile ? "PASS" : "WARN",
      detail: hasDockerfile ? "Docker configuration found." : "No Docker configuration detected.",
    },
  );

  // Additional Code Quality checks
  const hasContributing = names.some((n) => n.startsWith("contributing"));
  const hasCodeOfConduct = names.some((n) => n.startsWith("code_of_conduct") || n.startsWith("code-of-conduct"));
  const hasSecurityMd = names.some((n) => n === "security.md");
  const hasDependabot = names.includes(".github") && (() => {
    const githubDir = entries.find((e) => e.name === ".github" && e.type === "dir");
    return Boolean(githubDir);
  })();
  const hasChangelogFile = names.some((n) => n.startsWith("changelog") || n === "history.md");
  const hasOpenApiSpec = names.some((n) => ["openapi.yaml", "openapi.yml", "openapi.json", "swagger.yaml", "swagger.json"].includes(n));
  const hasEditorConfig = names.includes(".editorconfig");
  const hasGitignore = names.includes(".gitignore");

  checks.push(
    {
      category: "Code Quality",
      checkKey: "has_contributing",
      label: "CONTRIBUTING.md",
      status: hasContributing ? "PASS" : "WARN",
      detail: hasContributing ? "CONTRIBUTING.md found — contributor guidelines documented." : "No CONTRIBUTING.md — makes open-source contributions and team onboarding harder.",
    },
    {
      category: "Code Quality",
      checkKey: "has_code_of_conduct",
      label: "Code of Conduct",
      status: hasCodeOfConduct ? "PASS" : "WARN",
      detail: hasCodeOfConduct ? "Code of Conduct found." : "No Code of Conduct — required for GitHub marketplace listings and professional open-source projects.",
    },
    {
      category: "Code Quality",
      checkKey: "has_security_md",
      label: "SECURITY.md (vulnerability disclosure)",
      status: hasSecurityMd ? "PASS" : "WARN",
      detail: hasSecurityMd ? "SECURITY.md found — responsible disclosure policy documented." : "No SECURITY.md — GitHub recommends this for all repos to guide vulnerability reporting.",
    },
    {
      category: "Code Quality",
      checkKey: "has_dependabot",
      label: "Dependabot / automated dependency updates",
      status: hasDependabot ? "PASS" : "WARN",
      detail: hasDependabot ? ".github directory found — check for dependabot.yml for automated updates." : "No Dependabot configuration — unpatched dependencies are the #1 source of supply-chain vulnerabilities.",
    },
    {
      category: "Code Quality",
      checkKey: "has_changelog_file",
      label: "CHANGELOG.md",
      status: hasChangelogFile ? "PASS" : "WARN",
      detail: hasChangelogFile ? "CHANGELOG.md found — release history documented." : "No CHANGELOG.md — users and contributors can't track what changed between versions.",
    },
    {
      category: "Code Quality",
      checkKey: "has_openapi_spec",
      label: "OpenAPI / Swagger spec",
      status: hasOpenApiSpec ? "PASS" : "WARN",
      detail: hasOpenApiSpec ? "OpenAPI/Swagger spec found — API is documented and machine-readable." : "No OpenAPI spec — an openapi.yaml enables auto-generated SDKs, Postman collections, and API docs.",
    },
    {
      category: "Code Quality",
      checkKey: "has_editorconfig",
      label: ".editorconfig (consistent formatting)",
      status: hasEditorConfig ? "PASS" : "WARN",
      detail: hasEditorConfig ? ".editorconfig found — consistent code style across editors." : "No .editorconfig — without it, tabs vs spaces and line endings vary by contributor.",
    },
    {
      category: "Code Quality",
      checkKey: "has_gitignore",
      label: ".gitignore",
      status: hasGitignore ? "PASS" : "FAIL",
      detail: hasGitignore ? ".gitignore found — build artifacts and secrets excluded from version control." : "No .gitignore — secrets and build artifacts may be accidentally committed.",
    },
  );

  // ── Additional file presence checks ──────────────────────────────────────
  const hasDockerCompose = names.includes("docker-compose.yml") || names.includes("docker-compose.yaml");
  const hasMakefile = names.includes("makefile");
  const hasHuskyConfig = names.includes(".husky") || names.includes(".huskyrc");
  const hasVitest = names.some((n) => n === "vitest.config.ts" || n === "vitest.config.js");
  const hasJest = names.some((n) => n === "jest.config.js" || n === "jest.config.ts" || n === "jest.config.mjs");
  const hasPlaywright = names.some((n) => n.startsWith("playwright.config"));
  const hasCypress = names.some((n) => n === "cypress.json" || n === "cypress.config.js" || n === "cypress.config.ts" || n === "cypress");
  const hasE2eTests = hasPlaywright || hasCypress;
  const hasDevContainer = names.includes(".devcontainer");
  const hasRenovate = names.some((n) => n === "renovate.json" || n === ".renovaterc" || n === "renovate.json5");
  const hasHelmChart = names.includes("charts") || names.includes("helm");
  const hasK8s = names.includes("k8s") || names.includes("kubernetes");
  const hasInfraCode = hasHelmChart || hasK8s || names.includes("terraform") || names.includes("pulumi");
  const hasMigrations = names.some((n) => n === "migrations" || n === "db" || n === "database" || n === "prisma");
  const hasSupabase = names.includes("supabase");
  const hasPrisma = names.includes("prisma");
  const hasDrizzle = names.some((n) => n === "drizzle.config.ts" || n === "drizzle.config.js");
  const hasOrmConfig = hasPrisma || hasDrizzle || hasSupabase;
  const hasMonorepo = names.some((n) => n === "pnpm-workspace.yaml" || n === "lerna.json" || n === "nx.json" || n === "turbo.json");
  const hasCoverage = names.some((n) => n === "codecov.yml" || n === ".codecov.yml" || n === "coveralls.yml" || n.startsWith("coverage"));

  // suppress unused variable warnings for variables that may be useful in future
  void hasDockerCompose;

  checks.push(
    {
      category: "Code Quality",
      checkKey: "has_e2e_tests",
      label: "E2E test suite (Playwright / Cypress)",
      status: hasE2eTests ? "PASS" : "WARN",
      detail: hasE2eTests
        ? "End-to-end test configuration found."
        : "No E2E tests detected — Playwright or Cypress would catch regressions that unit tests miss.",
    },
    {
      category: "Code Quality",
      checkKey: "has_unit_test_config",
      label: "Unit test framework (Jest / Vitest)",
      status: hasVitest || hasJest ? "PASS" : "WARN",
      detail: hasVitest || hasJest
        ? "Unit test framework configured."
        : "No Jest/Vitest config found — unit tests are the fastest feedback loop for catching bugs.",
    },
    {
      category: "Code Quality",
      checkKey: "has_git_hooks",
      label: "Git hooks (Husky / lefthook)",
      status: hasHuskyConfig || names.includes("lefthook.yml") || names.includes(".lefthook.yml") ? "PASS" : "WARN",
      detail: hasHuskyConfig
        ? "Git hooks configured — linting and tests run before commits."
        : "No pre-commit hooks — lint errors and test failures can reach the main branch undetected.",
    },
    {
      category: "Infrastructure",
      checkKey: "has_orm_config",
      label: "ORM / database configuration",
      status: hasOrmConfig ? "PASS" : "WARN",
      detail: hasOrmConfig
        ? "Database ORM configuration detected (Prisma/Drizzle/Supabase)."
        : "No ORM config detected — consider Prisma or Drizzle for type-safe database access and migration management.",
    },
    {
      category: "Infrastructure",
      checkKey: "has_migrations",
      label: "Database migrations",
      status: hasMigrations ? "PASS" : "WARN",
      detail: hasMigrations
        ? "Database migrations directory detected."
        : "No migrations folder detected — schema changes without migrations make deployments risky and rollbacks difficult.",
    },
    {
      category: "Code Quality",
      checkKey: "has_renovate",
      label: "Renovate / automated dependency updates",
      status: hasRenovate ? "PASS" : "WARN",
      detail: hasRenovate
        ? "Renovate config found — dependencies stay up-to-date automatically."
        : "No Renovate config — dependencies gradually drift out of date, accumulating security debt.",
    },
    {
      category: "Infrastructure",
      checkKey: "has_devcontainer",
      label: "Dev container (.devcontainer)",
      status: hasDevContainer ? "PASS" : "WARN",
      detail: hasDevContainer
        ? ".devcontainer found — reproducible dev environment."
        : "No devcontainer — onboarding a new developer requires manual environment setup, which is error-prone.",
    },
    {
      category: "Infrastructure",
      checkKey: "has_infra_code",
      label: "Infrastructure as Code (Terraform / Helm / K8s)",
      status: hasInfraCode ? "PASS" : "WARN",
      detail: hasInfraCode
        ? "Infrastructure as Code configuration detected."
        : "No IaC detected — infrastructure managed manually means deployments are harder to reproduce and audit.",
    },
    {
      category: "Code Quality",
      checkKey: "has_makefile",
      label: "Makefile / task runner",
      status: hasMakefile ? "PASS" : "WARN",
      detail: hasMakefile
        ? "Makefile found — common tasks are standardised."
        : "No Makefile — developers must remember or document common commands (build, test, deploy) separately.",
    },
    {
      category: "Code Quality",
      checkKey: "is_monorepo",
      label: "Monorepo tooling (Turbo / Nx / pnpm workspaces)",
      status: hasMonorepo ? "PASS" : "WARN",
      detail: hasMonorepo
        ? "Monorepo configuration detected."
        : "Single package repository — fine for smaller projects, but consider a monorepo as the product grows.",
    },
    {
      category: "Code Quality",
      checkKey: "has_coverage_config",
      label: "Code coverage reporting",
      status: hasCoverage ? "PASS" : "WARN",
      detail: hasCoverage
        ? "Coverage configuration found."
        : "No coverage config — without coverage tracking you can't see which code paths are untested.",
    },
  );

  // Detect tech stack from package.json if available
  const techStack: string[] = [];
  if (hasPackageJson) {
    const pkgJson = await safeGithubRequest<Record<string, unknown>>(
      `/repos/${fullName}/contents/package.json`,
      {},
    );
    // GitHub returns base64-encoded content
    const encoded = (pkgJson as { content?: string }).content;
    if (encoded) {
      try {
        const decoded = Buffer.from(encoded.replace(/\n/g, ""), "base64").toString("utf-8");
        const pkg = JSON.parse(decoded) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps["next"]) techStack.push("Next.js");
        if (deps["react"]) techStack.push("React");
        if (deps["vue"]) techStack.push("Vue");
        if (deps["svelte"]) techStack.push("Svelte");
        if (deps["nuxt"]) techStack.push("Nuxt.js");
        if (deps["@remix-run/react"] || deps["@remix-run/node"]) techStack.push("Remix");
        if (deps["gatsby"]) techStack.push("Gatsby");
        if (deps["express"]) techStack.push("Express");
        if (deps["fastify"]) techStack.push("Fastify");
        if (deps["hono"]) techStack.push("Hono");
        if (deps["stripe"] || deps["@stripe/stripe-js"]) techStack.push("Stripe");
        if (deps["@supabase/supabase-js"]) techStack.push("Supabase");
        if (deps["firebase"] || deps["firebase-admin"]) techStack.push("Firebase");
        if (deps["@clerk/nextjs"] || deps["@clerk/clerk-react"]) techStack.push("Clerk");
        if (deps["next-auth"] || deps["@auth/core"]) techStack.push("NextAuth");
        if (deps["prisma"] || deps["@prisma/client"]) techStack.push("Prisma");
        if (deps["drizzle-orm"]) techStack.push("Drizzle");
        if (deps["@anthropic-ai/sdk"]) techStack.push("Anthropic Claude");
        if (deps["openai"]) techStack.push("OpenAI");
        if (deps["tailwindcss"]) techStack.push("Tailwind CSS");
      } catch {
        // Ignore parse errors
      }
    }
  }

  if (hasTs) techStack.push("TypeScript");

  return {
    checks: checks.map((check, i) => ({ ...check, sortOrder: i })),
    techStack: [...new Set(techStack)],
  };
}

export function skipAllChecks(inputType: PulseScanInputType): PulseScanCheckInput[] {
  if (inputType !== "FREE_TEXT") return [];

  const skippedChecks = [
    ["Infrastructure", "ssl_valid", "HTTPS / SSL certificate"],
    ["Infrastructure", "http_redirect", "HTTP → HTTPS redirect"],
    ["Infrastructure", "response_time", "Response time"],
    ["Infrastructure", "status_200", "Returns 200 OK"],
    ["Infrastructure", "custom_domain", "Custom domain"],
    ["Infrastructure", "cdn_detected", "CDN present"],
    ["SEO", "meta_title", "<title> tag"],
    ["SEO", "meta_description", "Meta description"],
    ["SEO", "og_tags", "Open Graph tags"],
    ["SEO", "canonical_url", "Canonical URL"],
    ["SEO", "h1_present", "H1 heading"],
    ["SEO", "has_robots_txt", "robots.txt"],
    ["SEO", "has_sitemap", "sitemap.xml"],
    ["Security", "csp_header", "Content-Security-Policy"],
    ["Security", "hsts_header", "HSTS header"],
    ["Security", "x_frame_options", "Clickjacking protection"],
    ["Security", "no_exposed_env", ".env not public"],
    ["Security", "no_exposed_git", ".git directory not public"],
    ["Performance", "compression", "Gzip/Brotli compression"],
    ["Performance", "caching_headers", "Cache-Control headers"],
    ["Payments", "stripe_signals", "Stripe integration"],
    ["Payments", "pricing_page", "Pricing/billing UI"],
    ["Authentication", "auth_ui_signals", "Login/signup UI"],
    ["Authentication", "oauth_signals", "Auth provider"],
    ["Observability", "error_monitoring", "Error monitoring"],
    ["Observability", "analytics_present", "Analytics"],
    ["Observability", "health_endpoint", "/health endpoint"],
    ["Code Quality", "has_readme", "README.md"],
    ["Code Quality", "has_tests", "Test suite"],
    ["Code Quality", "has_linter", "Linter config"],
    ["Code Quality", "has_typescript", "TypeScript"],
    ["Code Quality", "has_env_example", ".env.example"],
    ["Code Quality", "ci_cd_present", "CI/CD pipeline"],
    ["Code Quality", "has_license", "License file"],
    ["Legal & Compliance", "privacy_policy", "Privacy Policy"],
    ["Legal & Compliance", "terms_of_service", "Terms of Service"],
    ["Legal & Compliance", "cookie_consent", "Cookie consent / GDPR"],
    ["Legal & Compliance", "refund_policy", "Refund / Cancellation policy"],
    ["Missing Pages", "about_page", "About / Team page"],
    ["Missing Pages", "contact_page", "Contact page"],
    ["Missing Pages", "faq_page", "FAQ / Help page"],
    ["Missing Pages", "status_page", "Status / uptime page"],
    ["Missing Pages", "changelog", "Changelog / What's new"],
    ["SaaS Readiness", "billing_portal", "Billing / subscription management"],
    ["SaaS Readiness", "account_settings", "Account settings"],
    ["SaaS Readiness", "password_reset", "Password reset"],
    ["SaaS Readiness", "support_channel", "Support channel"],
    ["SaaS Readiness", "social_proof", "Social proof / testimonials"],
    ["SaaS Readiness", "onboarding_flow", "Onboarding flow"],
    ["Mobile & Accessibility", "viewport_meta", "Viewport meta tag"],
    ["Mobile & Accessibility", "html_lang", "HTML language attribute"],
    ["Mobile & Accessibility", "aria_attributes", "ARIA accessibility attributes"],
    ["Mobile & Accessibility", "responsive_images", "Responsive / optimised images"],
    ["SEO", "og_image", "og:image (social preview)"],
    ["SEO", "twitter_card", "Twitter / X Card"],
    ["Security", "x_content_type_options", "X-Content-Type-Options"],
    ["Security", "permissions_policy", "Permissions-Policy"],
    ["Security", "referrer_policy", "Referrer-Policy"],
    ["SaaS Readiness", "email_provider", "Transactional email provider"],
    ["Code Quality", "ai_platform_origin", "AI platform watermark"],
    ["Mobile & Accessibility", "favicon", "Favicon / app icon"],
    ["Mobile & Accessibility", "pwa_manifest", "Web App Manifest (PWA)"],
    ["Payments", "stripe_webhook", "Stripe webhook endpoint"],
    ["App Store & Mobile", "apple_touch_icon", "Apple touch icon"],
    ["App Store & Mobile", "apple_app_store", "Apple App Store presence"],
    ["App Store & Mobile", "google_play_store", "Google Play Store presence"],
    ["App Store & Mobile", "universal_links", "Universal Links (iOS deep linking)"],
    ["App Store & Mobile", "android_asset_links", "Android App Links (deep linking)"],
    ["App Store & Mobile", "wallet_payments", "Apple Pay / Google Pay / Amazon Pay"],
    ["Global Distribution", "hreflang_tags", "hreflang tags (multi-region SEO)"],
    ["Global Distribution", "charset_utf8", "UTF-8 character encoding"],
    ["Global Distribution", "ccpa_compliance", "CCPA (California privacy rights)"],
    ["Global Distribution", "multi_currency", "Multi-currency pricing"],
    ["Global Distribution", "rtl_support", "RTL language support"],
    ["Global Distribution", "language_switcher", "Language / region switcher"],
    ["Global Distribution", "international_payments", "International payment methods"],
    ["Global Distribution", "eu_vat", "EU VAT / tax handling"],
    // Additional SEO
    ["SEO", "structured_data", "JSON-LD structured data"],
    ["SEO", "preload_hints", "Resource preload hints"],
    ["SEO", "search_engine_verified", "Search engine verification"],
    ["SEO", "meta_robots", "Robots meta tag"],
    ["SEO", "og_site_name", "og:site_name (brand in shares)"],
    // Additional Security
    ["Security", "subresource_integrity", "Subresource Integrity (SRI)"],
    ["Security", "secure_cookie_attributes", "Secure cookie attributes"],
    ["Security", "cors_policy", "CORS policy"],
    ["Security", "security_txt", "security.txt (responsible disclosure)"],
    ["Security", "server_header_leakage", "Server version not exposed"],
    ["Security", "no_mixed_content", "No mixed HTTP/HTTPS content"],
    // Additional Performance
    ["Performance", "preconnect_hints", "Preconnect / DNS prefetch hints"],
    ["Performance", "native_lazy_loading", "Native image lazy loading"],
    ["Performance", "font_display_swap", "Font display optimisation"],
    ["Performance", "vary_header", "Vary header (content negotiation)"],
    ["Performance", "server_timing", "Server-Timing header"],
    // Additional Authentication
    ["Authentication", "mfa_signals", "Multi-factor authentication (MFA)"],
    ["Authentication", "email_verification_flow", "Email verification flow"],
    ["Authentication", "magic_link_auth", "Magic link / passwordless login"],
    ["Authentication", "enterprise_sso", "Enterprise SSO / SAML"],
    // Additional Legal
    ["Legal & Compliance", "data_deletion_right", "Data deletion / right to erasure (GDPR Art. 17)"],
    ["Legal & Compliance", "accessibility_statement", "Accessibility statement"],
    ["Legal & Compliance", "coppa_signals", "COPPA / children's privacy"],
    ["Legal & Compliance", "dpa_available", "Data Processing Agreement (GDPR Art. 28)"],
    ["Legal & Compliance", "icp_license", "China ICP license (for CN market)"],
    ["Legal & Compliance", "privacy_last_updated", "Privacy policy maintenance date"],
    ["Legal & Compliance", "cookie_policy_page", "Dedicated cookie policy page"],
    ["Legal & Compliance", "gdpr_dpo_contact", "GDPR privacy contact (DPO)"],
    // Additional Missing Pages
    ["Missing Pages", "blog_resources", "Blog / resources hub"],
    ["Missing Pages", "careers_page", "Careers / jobs page"],
    ["Missing Pages", "press_media", "Press / media page"],
    ["Missing Pages", "documentation", "Documentation / developer docs"],
    ["Missing Pages", "integrations_page", "Integrations / partners page"],
    ["Missing Pages", "custom_404_page", "Custom 404 error page"],
    // Additional SaaS Readiness
    ["SaaS Readiness", "demo_booking", "Demo booking / discovery call"],
    ["SaaS Readiness", "free_trial_cta", "Free trial / free plan CTA"],
    ["SaaS Readiness", "api_availability", "Public API / developer access"],
    ["SaaS Readiness", "affiliate_program", "Affiliate / referral program"],
    ["SaaS Readiness", "security_trust_page", "Security / trust page"],
    ["SaaS Readiness", "in_app_notifications", "In-app notification system"],
    // Additional Observability
    ["Observability", "uptime_monitoring", "External uptime monitoring"],
    ["Observability", "log_aggregation", "Centralised log aggregation"],
    ["Observability", "apm_signals", "Application Performance Monitoring (APM)"],
    ["Observability", "real_user_monitoring", "Real User Monitoring (RUM)"],
    // Additional Payments
    ["Payments", "payment_trust_badges", "Payment trust badges"],
    ["Payments", "bnpl_options", "Buy Now Pay Later (BNPL)"],
    ["Payments", "crypto_payments", "Cryptocurrency payment option"],
    // Additional App Store & Mobile
    ["App Store & Mobile", "smart_app_banner_meta", "Smart App Banner (iOS web-to-app)"],
    ["App Store & Mobile", "amazon_app_store", "Amazon Appstore / Fire TV presence"],
    ["App Store & Mobile", "app_listing_screenshots", "App screenshots / listing assets"],
    ["App Store & Mobile", "app_icon_sizes", "App icon multiple resolutions"],
    // Additional Global Distribution
    ["Global Distribution", "country_region_selector", "Country / region selector"],
    ["Global Distribution", "compliance_certifications", "Compliance certifications (SOC 2, ISO 27001)"],
    ["Global Distribution", "eu_data_residency", "EU data residency signals"],
    ["Global Distribution", "company_registration_info", "Company registration info"],
    ["Global Distribution", "timezone_locale_support", "Timezone / locale-aware content"],
    // Trust & Brand (new category)
    ["Trust & Brand", "social_media_links", "Social media presence"],
    ["Trust & Brand", "third_party_reviews", "Third-party review platform"],
    ["Trust & Brand", "press_coverage", "Press / media coverage section"],
    ["Trust & Brand", "team_presence", "Founder / team bio with photo"],
    ["Trust & Brand", "product_hunt_badge", "Product Hunt launch presence"],
    ["Trust & Brand", "media_kit", "Media kit / brand assets"],
    // Code Quality (URL-detectable)
    ["Code Quality", "no_placeholder_text", "No placeholder / lorem ipsum content"],
    ["Code Quality", "no_hash_routing", "Clean URL routing (no hash routes)"],
  ] as const;

  return skippedChecks.map(([category, checkKey, label], i) => ({
    category,
    checkKey,
    label,
    status: "SKIPPED" as const,
    detail: "Not applicable for free-text input.",
    sortOrder: i,
  }));
}

export function calculateHealthScore(checks: PulseScanCheckInput[]): number {
  const weightedCategories = new Set(["Infrastructure", "Security"]);
  let totalWeight = 0;
  let earned = 0;

  for (const check of checks) {
    if (check.status === "SKIPPED") continue;
    const weight = weightedCategories.has(check.category) ? 2 : 1;
    totalWeight += weight;
    if (check.status === "PASS") earned += weight;
    else if (check.status === "WARN") earned += weight * 0.5;
  }

  if (totalWeight === 0) return 0;
  let score = Math.round((earned / totalWeight) * 100);

  // Hard caps for production blockers — these are binary launch gates
  const hasNoSSL = checks.some((c) => c.checkKey === "ssl_valid" && c.status === "FAIL");
  const hasNoPrivacy = checks.some((c) => c.checkKey === "privacy_policy" && c.status === "FAIL");
  const hasNoTerms = checks.some((c) => c.checkKey === "terms_of_service" && c.status === "FAIL");

  if (hasNoSSL) score = Math.min(score, 50);
  if (hasNoPrivacy || hasNoTerms) score = Math.min(score, 65);

  return score;
}
