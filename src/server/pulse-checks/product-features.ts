// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT FEATURES — what the product demonstrably has, computed once per scan.
//
// The relevance gate (check-relevance.ts) shows a feature-dependent check only when the
// product has the feature: no payments checks for a site that takes no payments, no
// account-security checks for a product with no accounts. That makes these detectors the
// thing standing between a scan and a wall of irrelevant findings, so they follow one
// rule: USE, not MENTION.
//
// The previous detector (detectProjectContext in pulse-scan.ts) read `includes("stripe")`
// — any page that MENTIONS Stripe took payments — and treated `rel="apple-touch-icon"`,
// which almost every website carries, as proof of a mobile app. Each signal below is a
// thing a product only has when it actually uses the feature: a script it loads, a link
// it routes to, a dependency it installs.
//
// Deliberately biased toward "not detected". A missed feature hides that family and the
// coverage note says so ("Payments: not detected — not assessed"); a false one fills the
// report with checks about something the product does not do, which is the defect.
// ─────────────────────────────────────────────────────────────────────────────

import type { ProductFeature } from "./check-relevance";

function hrefTo(lowerHtml: string, paths: readonly string[]): boolean {
  return paths.some((path) => new RegExp(`href=["'](?:https?://[^"']*)?${path.replace(/\//g, "\\/")}(?:[/?#"']|$)`, "i").test(lowerHtml));
}

/** Features of a live website, from its HTML, response headers and detected stack. */
export function featuresFromPage(html: string, techStack: readonly string[] = []): Set<ProductFeature> {
  const lower = html.toLowerCase();
  const features = new Set<ProductFeature>();
  const stack = new Set(techStack.map((s) => s.toLowerCase()));

  // Payments — a payment SDK the page loads, or a route to buy / subscribe.
  if (
    /<script[^>]+src=["'][^"']*(js\.stripe\.com|checkout\.stripe\.com|cdn\.paddle\.com|app\.lemonsqueezy\.com|assets\.lemonsqueezy\.com|paypal\.com\/sdk|js\.braintreegateway\.com|checkout\.razorpay\.com|js\.chargebee\.com)/i.test(html)
    || /href=["'][^"']*(checkout\.stripe\.com|buy\.stripe\.com|billing\.stripe\.com|[a-z0-9-]+\.lemonsqueezy\.com\/checkout|gumroad\.com\/l\/)/i.test(html)
    || hrefTo(lower, ["/pricing", "/plans", "/checkout", "/billing", "/subscribe", "/upgrade"])
  ) features.add("payments");

  // E-commerce — a store platform, a cart, or product structured data.
  if (
    /cdn\.shopify\.com|shopify\.theme|woocommerce|bigcommerce\.com\/s-|static\.wixstatic\.com\/.*store|squarespace-commerce/i.test(html)
    || hrefTo(lower, ["/cart", "/basket", "/shop", "/products"])
    || /"@type"\s*:\s*"product"/i.test(html)
  ) {
    features.add("ecommerce");
    features.add("payments");
  }

  // Accounts — a sign-in route, a password field, or an auth provider's SDK in use.
  const authLinks = hrefTo(lower, ["/login", "/log-in", "/signin", "/sign-in", "/signup", "/sign-up", "/register", "/account", "/auth"]);
  const authProvider = /clerk\.[a-z0-9-]+\.(?:dev|com)|@clerk\/|next-auth\.session-token|\/api\/auth\/(?:session|providers|csrf)|[a-z0-9-]{8,}\.supabase\.(?:co|in)(?![a-z])|supabase-js|[a-z0-9-]+\.auth0\.com|lucia-auth|[a-z0-9-]+\.kinde\.com|identitytoolkit\.googleapis\.com|cognito-idp\./i.test(html);
  if (authLinks || authProvider || /type=["']password["']/i.test(html)) features.add("accounts");

  // Multi-tenant SaaS — accounts plus either a paid plan or an app area behind sign-in.
  if (features.has("accounts") && (features.has("payments") || hrefTo(lower, ["/app", "/dashboard", "/workspace", "/console"]))) {
    features.add("saas_multitenant");
  }

  // AI — a product calling a model from the page, or an AI chat surface it ships.
  if (/api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|\/api\/(chat|completion|completions|ai|assistant)(?:[/?"'])/i.test(html)) {
    features.add("ai_features");
  }

  // Public API — the site documents an API for others to call.
  if (hrefTo(lower, ["/api-docs", "/docs/api", "/developers", "/developer", "/api/docs", "/reference/api", "/openapi.json", "/swagger"]) || /swagger-ui|redoc|"openapi"\s*:/i.test(html)) {
    features.add("public_api");
  }

  // Marketing content — a public website is, by definition, content someone reads.
  features.add("marketing_content");

  // Internationalisation — alternate-language versions are declared.
  if (/<link[^>]+hreflang=/i.test(html)) features.add("i18n");

  // User-generated content — a comment / review / upload surface.
  if (/<textarea[^>]+name=["'](comment|message|review|body)["']|type=["']file["']/i.test(html)) features.add("user_content");

  // A companion app — the page links to the product's OWN store listing (an app id), or
  // declares a smart app banner. A generic "available on the App Store" badge image alone
  // is not enough; it must point at a listing.
  if (/href=["']https?:\/\/(?:apps\.apple\.com\/[^"']*\/id\d+|itunes\.apple\.com\/[^"']*\/id\d+|play\.google\.com\/store\/apps\/details\?id=)/i.test(html)
    || /<meta[^>]+name=["'](apple-itunes-app|google-play-app)["']/i.test(html)) {
    features.add("mobile_app");
  }

  if (stack.has("supabase") || /[a-z0-9-]{8,}\.supabase\.(?:co|in)(?![a-z])|supabase-js/i.test(html)) features.add("supabase");
  if (stack.has("firebase") || /firebaseio\.com|firebaseapp\.com|firebase-app\.js|identitytoolkit\.googleapis\.com/i.test(html)) features.add("firebase");

  return features;
}

const DEP_FEATURES: Array<[ProductFeature, readonly string[]]> = [
  ["payments", ["stripe", "@stripe/stripe-js", "@stripe/react-stripe-js", "@paddle/paddle-js", "@lemonsqueezy/lemonsqueezy.js", "braintree", "@paypal/paypal-js", "@paypal/react-paypal-js", "razorpay", "chargebee"]],
  ["ecommerce", ["@shopify/hydrogen", "@shopify/hydrogen-react", "@medusajs/medusa", "@vendure/core", "saleor", "@shopify/shopify-api", "@bigcommerce/catalyst-core"]],
  ["accounts", ["next-auth", "@auth/core", "@clerk/nextjs", "@clerk/clerk-react", "@clerk/express", "@supabase/auth-helpers-nextjs", "@supabase/ssr", "@auth0/nextjs-auth0", "auth0", "passport", "lucia", "@kinde-oss/kinde-auth-nextjs", "firebase", "@firebase/auth", "better-auth", "jsonwebtoken", "bcrypt", "bcryptjs", "argon2"]],
  ["ai_features", ["openai", "@anthropic-ai/sdk", "@google/generative-ai", "@google/genai", "ai", "@ai-sdk/openai", "@ai-sdk/anthropic", "langchain", "@langchain/core", "llamaindex", "cohere-ai", "@mistralai/mistralai", "replicate", "ollama"]],
  ["sends_email", ["nodemailer", "resend", "@sendgrid/mail", "postmark", "mailgun.js", "@aws-sdk/client-ses", "@react-email/components", "react-email"]],
  ["supabase", ["@supabase/supabase-js", "@supabase/ssr", "@supabase/auth-helpers-nextjs"]],
  ["firebase", ["firebase", "firebase-admin"]],
  ["i18n", ["next-intl", "i18next", "react-i18next", "next-i18next", "@formatjs/intl", "vue-i18n", "@lingui/core"]],
];

/** Features of a repository, from its manifest(s). */
export function featuresFromRepo(paths: readonly string[], files: ReadonlyMap<string, string>): Set<ProductFeature> {
  const features = new Set<ProductFeature>();
  const deps = new Set<string>();
  for (const [path, content] of files) {
    if (!/(^|\/)package\.json$/.test(path)) continue;
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      for (const field of ["dependencies", "devDependencies"]) {
        const block = parsed[field];
        if (block && typeof block === "object") for (const name of Object.keys(block)) deps.add(name);
      }
    } catch { /* unreadable manifest — no evidence */ }
  }
  for (const [feature, names] of DEP_FEATURES) if (names.some((name) => deps.has(name))) features.add(feature);
  if (features.has("ecommerce")) features.add("payments");
  if (features.has("accounts") && features.has("payments")) features.add("saas_multitenant");
  if (paths.some((path) => /(^|\/)(openapi|swagger)\.(json|ya?ml)$/i.test(path))) features.add("public_api");
  if (paths.some((path) => /(^|\/)supabase\/(migrations|config\.toml)/.test(path))) features.add("supabase");
  if (paths.some((path) => /(^|\/)(firebase\.json|\.firebaserc)$/.test(path))) features.add("firebase");
  return features;
}
