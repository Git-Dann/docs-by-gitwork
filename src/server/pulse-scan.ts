import { safeGithubRequest, parseGithubRepo } from "@/lib/github";
import type { PulseScanCheckInput, PulseScanInputType } from "@/types/pulse";

export const SCAN_VERSION = "pulse-v1";

const FETCH_TIMEOUT_MS = 10_000;

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

export async function runUrlChecks(url: string): Promise<{ checks: PulseScanCheckInput[]; techStack: string[] }> {
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

    // Parallel batch: favicon, PWA manifest, Stripe webhook
    const [faviconStatus, manifestStatus, stripeWebhookStatus] = await Promise.all([
      headRequest(`${baseUrl}/favicon.ico`),
      headRequest(`${baseUrl}/manifest.json`),
      headRequest(`${baseUrl}/api/webhooks/stripe`),
    ]);

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

    // Non-zero and non-5xx = endpoint exists (even 401/405 confirms a handler is registered)
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

    // App Store & Mobile Distribution — batch deep-link file checks
    const [aasaStatus, assetLinksStatus] = await Promise.all([
      headRequest(`${baseUrl}/.well-known/apple-app-site-association`),
      headRequest(`${baseUrl}/.well-known/assetlinks.json`),
    ]);

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

    const hasAppleSmartBanner = /name=["']apple-itunes-app["']/i.test(pageResult.html);
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
