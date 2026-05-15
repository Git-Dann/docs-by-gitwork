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

export async function runUrlChecks(url: string): Promise<PulseScanCheckInput[]> {
  const checks: PulseScanCheckInput[] = [];
  let sortOrder = 0;
  const nextOrder = () => sortOrder++;

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
    ];
    for (const [category, checkKey, label] of failedChecks) {
      checks.push({ category, checkKey, label, status: "FAIL", detail: "Could not reach the site." });
    }
  }

  return checks.map((check, i) => ({ ...check, sortOrder: i }));
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
  return Math.round((earned / totalWeight) * 100);
}
