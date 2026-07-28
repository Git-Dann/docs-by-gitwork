// ─────────────────────────────────────────────────────────────────────────────
// BUILDER-PLATFORM CHECKS — per-platform knowledge for AI/no-code builders.
//
// WHY THIS EXISTS. detectAiBuilder (vibe-code-hygiene.ts) already identifies 12
// platforms, but until now NOTHING acted on the result beyond one informational
// check and a "still on a preview host" warning. Every other check ran identically
// whether the app came out of Lovable, Webflow or a hand-written repo — so Pulse
// held no platform-specific knowledge at all.
//
// WHAT IS DELIBERATELY *NOT* HERE. The highest-value vibe-coded-app checks already
// exist in vibe-security.ts and must not be duplicated:
//   • supabase_rls_enforced       — actively probes each table with the anon key
//                                   (the CVE-2025-48757 class), with a genuine
//                                   inconclusive state for empty tables
//   • no_service_role_key_exposed — service_role JWT / sk- / AKIA / PEM in bundle
//   • firebase_rules_locked       — probes Firestore rules
//   • no_public_secret_env        — secret-looking NEXT_PUBLIC_* values
// This module covers what those cannot see: platform-specific defaults, dev tooling
// that shipped, and hosting shapes that mean "prototype" rather than "production".
//
// EVIDENCE DISCIPLINE. Every check here is PRESENCE-based — it fires because we
// found something in the served HTML or the client bundle. None asserts absence
// from a sample, so none needs the LOW-confidence downgrade the mobile families
// use. Where a platform's real risk is only provable server-side (v0's unprotected
// Server Actions, Lovable's edge-function verify_jwt setting), the check says so
// and stays a WARN rather than inventing a verdict it cannot support.
//
// Sources for the platform behaviour encoded below are recorded in
// docs/builder-platform-checks.md so a future reader can re-verify the claims.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";

/** Builders whose apps are a client-rendered SPA the user prompted into existence. */
const AI_PROMPT_BUILDERS = new Set(["Lovable", "Bolt (StackBlitz)", "v0 (Vercel)", "Replit"]);

/**
 * Each platform's default "we generated this address for you" host.
 *
 * Kept as one table so the finding is one check with per-platform wording, rather
 * than twelve near-duplicate registry entries saying the same thing.
 */
const DEFAULT_SUBDOMAINS: Array<[string, RegExp]> = [
  ["Lovable", /\.lovable\.app$|\.lovableproject\.com$/i],
  ["Bolt (StackBlitz)", /\.netlify\.app$|\.bolt\.host$/i],
  ["v0 (Vercel)", /\.vercel\.app$/i],
  ["Replit", /\.replit\.app$/i],
  ["Framer", /\.framer\.app$|\.framer\.website$/i],
  ["Webflow", /\.webflow\.io$/i],
  ["Wix", /\.wixsite\.com$/i],
  ["Bubble", /\.bubbleapps\.io$/i],
  ["Softr", /\.softr\.app$/i],
  ["Carrd", /\.carrd\.co$/i],
  ["Glide", /\.glide\.page$/i],
  ["Squarespace", /\.squarespace\.com$/i],
];

/**
 * Platforms where the default-host finding is already covered by a more specific,
 * higher-severity check above — a Replit workspace URL and a v0 preview mean
 * "this is not a deployment at all", which is a stronger statement than "this is
 * unbranded". Excluded here so one URL never yields two findings about itself.
 */
const STRONGER_HOST_FINDING = new Set(["Replit", "v0 (Vercel)", "Lovable", "Bolt (StackBlitz)"]);

export interface BuilderCheckInput {
  /** Name from detectAiBuilder — the single source of platform identity. */
  builder: string | null;
  hostname: string;
  html: string;
  /** HTML + same-origin JS, already fetched by the caller (fetchBundleText). */
  bundle: string;
}

/**
 * Platform-specific checks. Returns [] when no builder was detected, so this is a
 * no-op for every hand-coded project — the caller does not need to branch.
 *
 * Pure apart from the bundle text it is handed, so it is unit-testable without a
 * network: that is what let the sampling bugs in §34 be caught by tests at all.
 */
export function evaluateBuilderChecks(input: BuilderCheckInput): PulseScanCheckInput[] {
  const { builder, hostname, bundle } = input;
  if (!builder) return [];

  const checks: PulseScanCheckInput[] = [];
  const host = hostname.toLowerCase();
  const lower = bundle.toLowerCase();

  // ── Paid provider called straight from the browser ──────────────────────────
  // The single most expensive mistake these platforms produce. Distinct from
  // no_service_role_key_exposed: that finds a key that MATCHES a known pattern.
  // This finds the CALL, which proves a key must be reachable client-side even
  // when the key format is one we do not recognise — and scrapers find deployed
  // keys within hours. Provider endpoints are unambiguous: a browser has no
  // legitimate reason to hold the credentials for any of them.
  const PROVIDER_ENDPOINTS: Array<[string, RegExp]> = [
    ["OpenAI", /api\.openai\.com/i],
    ["Anthropic", /api\.anthropic\.com/i],
    ["Google Gemini", /generativelanguage\.googleapis\.com/i],
    ["Stripe (secret API)", /api\.stripe\.com\/v1\//i],
    ["Resend", /api\.resend\.com/i],
    ["Twilio", /api\.twilio\.com/i],
  ];
  const calledFromBrowser = PROVIDER_ENDPOINTS.filter(([, re]) => re.test(bundle)).map(([name]) => name);
  if (calledFromBrowser.length > 0) {
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "builder_paid_provider_from_browser",
      label: "Paid APIs are not called from the browser",
      status: "FAIL",
      confidence: "HIGH",
      detail:
        `CRITICAL: the client bundle calls ${calledFromBrowser.join(", ")} directly from the browser. ` +
        `A browser cannot hold a secret, so whichever key authorises those calls is readable by anyone who opens ` +
        `DevTools — and billing is charged to you, not to them. This is the most common way a ${builder} project ` +
        `leaks a paid credential, because the generated code calls the provider SDK from a component as if it were ` +
        `server code. Move every one of these behind a server route or edge function and rotate the key now: assume ` +
        `it is already compromised if the site has been public.`,
      evidence: calledFromBrowser.join(", "),
    });
  }

  // ── Dev tooling shipped to production ───────────────────────────────────────
  // Each of these is injected by the builder's own dev pipeline and is supposed to
  // be stripped by the production build. Present in a served page, it means the
  // deployed artefact is a development build: bigger, slower, and (for source maps)
  // shipping readable original source including comments.
  const DEV_ARTEFACTS: Array<[string, RegExp]> = [
    ["lovable-tagger (Lovable's component tagger)", /lovable-tagger/i],
    ["gptengineer.js (Lovable's editor bridge)", /gpteng\.co|gptengineer\.js/i],
    ["Vite React Refresh (HMR runtime)", /@react-refresh|__vite_plugin_react_preamble/i],
    ["Vite dev client", /\/@vite\/client/i],
    ["React DevTools hook wiring", /__REACT_DEVTOOLS_GLOBAL_HOOK__\s*=/i],
  ];
  const devArtefacts = DEV_ARTEFACTS.filter(([, re]) => re.test(bundle)).map(([name]) => name);
  if (devArtefacts.length > 0) {
    checks.push({
      category: CATEGORIES.VIBE_HYGIENE,
      checkKey: "builder_dev_tooling_in_prod",
      label: "No development tooling in the production build",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `Development-only tooling is present in the served build: ${devArtefacts.join("; ")}. ` +
        `${builder} strips these in a production build, so this page is serving a dev artefact — larger and slower ` +
        `than it needs to be, and in the case of the editor bridge it keeps a link back to the builder. Publish a ` +
        `production build (not a preview) and confirm these strings are gone from the deployed bundle.`,
      evidence: devArtefacts.join(", "),
    });
  }

  // ── Source maps served publicly ─────────────────────────────────────────────
  const sourceMapRef = /\/\/[#@]\s*sourceMappingURL=([^\s"']+\.map)/i.exec(bundle);
  if (sourceMapRef) {
    checks.push({
      category: CATEGORIES.VIBE_HYGIENE,
      checkKey: "builder_sourcemaps_public",
      label: "Source maps not published alongside the bundle",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `The bundle references a public source map (${sourceMapRef[1]}), so the original source — variable names, ` +
        `comments, unused branches, and any commented-out endpoint or key — is downloadable. That is fine on a ` +
        `prototype and a real disclosure on a product: it turns "read the minified bundle" into "read the codebase". ` +
        `Disable source-map upload for the production build, or restrict them to your error tracker.`,
      evidence: sourceMapRef[1],
    });
  }

  // ── Authorization decided in the browser ────────────────────────────────────
  // Deliberately a WARN, not a FAIL. Finding an admin flag in client code proves
  // the UI gates on it; it does NOT prove the server fails to re-check. Only a
  // server-side probe could show that, and probing an app's admin routes without
  // permission is not something a scanner should do. So this reports the pattern
  // and names the exact thing to verify by hand.
  //
  // Scoped to the four prompt-to-app builders on purpose. A hosted site builder
  // (Webflow/Wix/Squarespace) ships its own vendor runtime, where a string like
  // `userRole` is far more likely to belong to the platform's own code than to the
  // author's authorization logic — so the same pattern there is noise, not a finding.
  const CLIENT_AUTHZ = /\b(isAdmin|is_admin|userRole|user_role)\b|role\s*===\s*["'`](admin|owner|superadmin)["'`]/i;
  if (isPromptBuilder(builder) && CLIENT_AUTHZ.test(bundle)) {
    checks.push({
      category: CATEGORIES.ROLES,
      checkKey: "builder_client_side_authorization",
      label: "Authorization is enforced server-side, not in the client",
      status: "WARN",
      confidence: "MEDIUM",
      detail:
        `The client bundle decides what an admin can see (an admin/role flag is evaluated in browser code). That is ` +
        `normal for hiding UI, and unsafe if it is the ONLY check: anyone can flip a variable in DevTools or call the ` +
        `underlying endpoint directly. ${builder} generates the UI gate reliably and the matching server-side check ` +
        `rarely. Verify by hand that every privileged route re-checks the caller's role on the server — this scan ` +
        `cannot prove that from outside, which is why this is a warning and not a failure.`,
      evidence: "admin/role decision found in client-side code",
    });
  }

  // ── Per-platform hosting shape ──────────────────────────────────────────────
  checks.push(...hostingShapeChecks(builder, host));

  // ── Default platform subdomain instead of a custom domain ───────────────────
  // One check across all 12 platforms rather than a near-duplicate key each: the
  // finding is identical, only the host pattern and the wording differ. Note the
  // hosts that mean something STRONGER than "unbranded" (a Replit workspace, a v0
  // preview) are handled above as their own checks and excluded here, so a single
  // deployment never produces two findings about the same URL.
  const defaultHost = DEFAULT_SUBDOMAINS.find(([name, re]) => name === builder && re.test(host));
  if (defaultHost && !STRONGER_HOST_FINDING.has(builder)) {
    checks.push({
      category: CATEGORIES.TRUST_BRAND,
      checkKey: "builder_default_deploy_domain",
      label: "Custom domain in use, not the default deploy subdomain",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `Served from ${builder}'s default subdomain (${host}) rather than a custom domain. It works, but it is not a ` +
        `product address: it cannot be branded, it costs trust on anything client-facing, it hands the platform your ` +
        `domain authority for SEO purposes, and it signals the deployment was never finished. Attach a custom domain.`,
      evidence: host,
    });
  }

  // ── Data filtered in the client rather than the server ──────────────────────
  // Glide's own permissions model is thin, and row/column visibility configured as
  // a display rule means the data still reaches the device before being hidden.
  // Softr has real server-side user groups, so this is Glide-specific.
  if (builder === "Glide") {
    checks.push({
      category: CATEGORIES.ROLES,
      checkKey: "glide_client_side_visibility",
      label: "Row visibility enforced server-side",
      status: "WARN",
      confidence: "MEDIUM",
      detail:
        `Glide apps commonly control who sees what with visibility conditions, which hide rows in the UI after the data ` +
        `has already been sent to the device — so anyone inspecting the app's network traffic can read rows they were ` +
        `never meant to see. If this app holds anything private, confirm it uses Glide's row owners (which filter ` +
        `server-side) and not just visibility conditions. This scan cannot see your configuration, so verify it directly.`,
      evidence: "Glide app — verify row owners vs visibility conditions",
    });
  }

  // ── Webflow staging left indexable ──────────────────────────────────────────
  if (builder === "Webflow" && /\.webflow\.io$/i.test(host)) {
    const noindexed = /<meta[^>]+name=["']robots["'][^>]*noindex/i.test(input.html);
    checks.push({
      category: CATEGORIES.SEO,
      checkKey: "webflow_staging_indexable",
      label: "Webflow staging subdomain is not indexable",
      status: noindexed ? "PASS" : "WARN",
      confidence: "HIGH",
      detail: noindexed
        ? `This is the webflow.io staging host and it correctly sends noindex, so it will not compete with the live site.`
        : `This is Webflow's staging host (${host}) and it does NOT send noindex, so search engines can index it as a ` +
          `duplicate of the production site — splitting ranking signals between two identical hosts. Webflow has a ` +
          `"Disable Webflow subdomain indexing" setting in site settings; turn it on, then publish.`,
      evidence: host,
    });
  }

  // ── Lovable asset pipeline ──────────────────────────────────────────────────
  if (builder === "Lovable" && /\/lovable-uploads\//i.test(bundle)) {
    checks.push({
      category: CATEGORIES.PERFORMANCE,
      checkKey: "lovable_uploads_unoptimised",
      label: "Images served through an optimising pipeline",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `Images are served from /lovable-uploads/, which returns the file exactly as uploaded — no resizing, no WebP/AVIF ` +
        `conversion, no per-device variants. A single unresized phone photo here is routinely several megabytes, and it is ` +
        `the usual reason a Lovable site scores badly on mobile Largest Contentful Paint. Re-export the assets at the size ` +
        `they render, or put them behind an image CDN.`,
      evidence: "/lovable-uploads/",
    });
  }

  // ── Builder badge left on a production site ─────────────────────────────────
  const BADGE = /edit with lovable|built with (lovable|bolt|v0)|lovable\.dev\/projects|bolt\.new\/~\//i;
  if (BADGE.test(lower)) {
    checks.push({
      category: CATEGORIES.TRUST_BRAND,
      checkKey: "builder_badge_visible",
      label: "No builder badge on the production site",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `The page still carries a ${builder} badge or a link back to the project. On a client-facing site this advertises ` +
        `the tool rather than the product, and a project link can expose the build to anyone who follows it. Remove the ` +
        `badge in the project settings before launch.`,
      evidence: "builder badge / project link in page",
    });
  }

  return checks;
}

/**
 * Whether the app is served from somewhere intended for production.
 *
 * Split per platform because each one's "this is still a preview" signal is
 * different, and getting it wrong in either direction is bad: a false alarm on a
 * real production domain destroys trust in the scan, and missing a live preview
 * host misses the single most important thing about the deployment.
 *
 * Note this is NARROWER than vibe_ai_builder's preview-host warning, which fires
 * on the builder's own host generally. These identify the *specific* host classes
 * that behave differently from a production deployment.
 */
function hostingShapeChecks(builder: string, host: string): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // Replit: the dev URL and the deployment are different products. A *.replit.dev
  // workspace URL is tied to a running workspace — it sleeps, and its content
  // changes as the author edits. Only a Deployment (*.replit.app or a custom
  // domain) is a durable host. Replit Deployments also use a SEPARATE secrets
  // store from the workspace, which is why an app can work in the editor and 500
  // in production.
  if (builder === "Replit") {
    const onWorkspaceUrl = /\.replit\.dev$|\.repl\.co$/i.test(host);
    checks.push({
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "replit_production_deployment",
      label: "Served from a Replit Deployment, not a workspace URL",
      status: onWorkspaceUrl ? "FAIL" : "PASS",
      confidence: "HIGH",
      detail: onWorkspaceUrl
        ? `This is a Replit WORKSPACE url (${host}), not a Deployment. A workspace URL is bound to the editor session: ` +
          `it sleeps when idle, so visitors hit a cold start or nothing at all, and whatever the author last typed is ` +
          `what the world sees. Promote it to a Deployment (*.replit.app or a custom domain). Remember Deployments ` +
          `have their OWN secrets store — an app that works in the editor and 500s once deployed almost always has an ` +
          `empty Deployment secrets pane.`
        : `Served from ${host} — not a Replit workspace URL, so this is a real deployment rather than an editor session.`,
      evidence: host,
    });
  }

  // Bolt deploys to Netlify by default and leaves the generated subdomain in place.
  // Bolt is in STRONGER_HOST_FINDING so the generalised default-subdomain check
  // skips it; this one carries the Bolt-specific wording instead.
  if (builder === "Bolt (StackBlitz)" && /\.netlify\.app$|\.bolt\.host$/i.test(host)) {
    checks.push({
      category: CATEGORIES.TRUST_BRAND,
      checkKey: "builder_default_deploy_domain",
      label: "Custom domain in use, not the default deploy subdomain",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `Served from the default subdomain Bolt generates (${host}). It works, but it is not a product address: ` +
        `it cannot be branded, it hurts trust on anything client-facing, and it signals that the deployment was never ` +
        `finished. Attach a custom domain.`,
      evidence: host,
    });
  }

  // v0 previews are per-generation URLs. A *.v0.dev or per-branch preview host is
  // not a deployment — the content is pinned to one generation of the design.
  if (builder === "v0 (Vercel)" && /\.v0\.dev$/i.test(host)) {
    checks.push({
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "v0_preview_host_production",
      label: "Not served from a v0 preview host",
      status: "FAIL",
      confidence: "HIGH",
      detail:
        `This is a v0 preview URL (${host}). A preview is pinned to one generation of the design and is not a hosting ` +
        `product — it carries no uptime expectation and can change or disappear as the project is regenerated. Deploy the ` +
        `project properly (Vercel or elsewhere) and point a real domain at it before sharing with anyone.`,
      evidence: host,
    });
  }

  // Lovable's staging host, same reasoning.
  if (builder === "Lovable" && /\.lovableproject\.com$|\.lovable\.app$/i.test(host)) {
    checks.push({
      category: CATEGORIES.INFRASTRUCTURE,
      checkKey: "lovable_preview_host_production",
      label: "Not served from a Lovable preview host",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `Served from Lovable's own preview host (${host}). Fine while building; not a production address — it ties the ` +
        `live site to the editing project, and every visitor sees whatever state the project is currently in. Publish to ` +
        `a custom domain.`,
      evidence: host,
    });
  }

  return checks;
}

/** True when the platform is one of the four prompt-to-app builders. */
export function isPromptBuilder(builder: string | null): boolean {
  return builder !== null && AI_PROMPT_BUILDERS.has(builder);
}

// ─────────────────────────────────────────────────────────────────────────────
// BUBBLE — the one platform whose central risk needs a live probe.
//
// Bubble's Data API exposes every "thing" in the database at
// /api/1.1/obj/<type>, and privacy rules are EMPTY BY DEFAULT — you have to
// actively add a rule per data type. So the failure mode is identical to the
// Supabase RLS case (§ vibe-security): a database that answers unauthenticated
// reads because nobody wrote the policy. It is worth a probe for exactly the
// reason the Supabase one is: it PROVES the exposure with a real read instead of
// inferring it from configuration we cannot see.
//
// Two things this deliberately does NOT do:
//   • It never writes. Read-only GETs only.
//   • It only asks for ONE row (limit=1) per type, from a small fixed list of
//     type names, and stops at the first exposure. This is a readiness scan, not
//     an exfiltration tool; the finding is "this is open", and one row proves it.
// ─────────────────────────────────────────────────────────────────────────────

/** Bubble type names common enough to be worth trying, cheapest signal first. */
const BUBBLE_COMMON_TYPES = ["user", "users", "order", "orders", "customer", "booking", "message", "post"];

export interface BubbleProbeDeps {
  /** Injected so the probe is testable without a network. */
  fetchJson: (url: string) => Promise<{ status: number; body: unknown }>;
}

/**
 * Probe a Bubble app's Data API. Returns [] for any non-Bubble app.
 *
 * `version-test` is checked separately: Bubble serves the development version of
 * every app at /version-test/ on the same host, and it is publicly reachable
 * unless privacy rules cover it. A dev version usually holds test data, weaker
 * rules, and half-built workflows — and it is the copy people forget exists.
 */
export async function probeBubbleDataApi(
  input: { builder: string | null; origin: string },
  deps: BubbleProbeDeps,
): Promise<PulseScanCheckInput[]> {
  if (input.builder !== "Bubble") return [];

  const exposed: string[] = [];
  let reachable = false;

  for (const type of BUBBLE_COMMON_TYPES) {
    try {
      const res = await deps.fetchJson(`${input.origin}/api/1.1/obj/${type}?limit=1`);
      // 401/403 ⇒ privacy rules are doing their job. 404 ⇒ no such type.
      if (res.status === 401 || res.status === 403) reachable = true;
      if (res.status !== 200) continue;
      reachable = true;
      const rows = (res.body as { response?: { results?: unknown[] } })?.response?.results;
      if (Array.isArray(rows) && rows.length > 0) {
        exposed.push(type);
        break; // One proven exposure is the finding — do not enumerate further.
      }
    } catch { /* network error — try the next type */ }
  }

  const checks: PulseScanCheckInput[] = [];

  if (exposed.length > 0) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "bubble_data_api_open",
      label: "Bubble Data API is protected by privacy rules",
      status: "FAIL",
      confidence: "HIGH",
      detail:
        `CRITICAL: the Bubble Data API returned live records for "${exposed[0]}" WITHOUT any authentication. Bubble ships ` +
        `with privacy rules EMPTY by default and the Data API able to serve every field of every thing, so this data is ` +
        `readable by anyone who guesses the type name — and "user" is not a hard guess. Add a privacy rule for every data ` +
        `type in Data → Privacy, and disable the Data API for any type that does not need it. Treat anything already ` +
        `exposed as public.`,
      evidence: `GET /api/1.1/obj/${exposed[0]}?limit=1 returned records unauthenticated`,
    });
  } else if (reachable) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "bubble_data_api_open",
      label: "Bubble Data API is protected by privacy rules",
      status: "PASS",
      confidence: "MEDIUM",
      detail:
        `The Bubble Data API refused unauthenticated reads on the types probed, so privacy rules appear to be in place. ` +
        `Note this probed a short list of common type names — confirm in Data → Privacy that EVERY type has a rule, ` +
        `since a type this scan did not guess could still be open.`,
      evidence: "Data API rejected unauthenticated reads on the probed types",
    });
  } else {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "bubble_data_api_open",
      label: "Bubble Data API is protected by privacy rules",
      status: "SKIPPED",
      confidence: "LOW",
      detail:
        `Could not reach the Bubble Data API on this host, so nothing was assessed — this is not a statement that the ` +
        `app is secure. Verify manually that privacy rules exist for every data type.`,
    });
  }

  return checks;
}

/**
 * Is Bubble's development copy of the app publicly reachable?
 *
 * Separate from the Data API check because it is a different exposure with a
 * different fix: the dev version typically holds test data and half-finished
 * workflows, and it is the copy people forget is public.
 */
export async function probeBubbleVersionTest(
  input: { builder: string | null; origin: string },
  deps: { fetchStatus: (url: string) => Promise<number> },
): Promise<PulseScanCheckInput[]> {
  if (input.builder !== "Bubble") return [];

  let status: number;
  try {
    status = await deps.fetchStatus(`${input.origin}/version-test`);
  } catch {
    return [];
  }

  const open = status === 200;
  return [{
    category: CATEGORIES.SECURITY,
    checkKey: "bubble_version_test_exposed",
    label: "Bubble development version is not publicly reachable",
    status: open ? "WARN" : "PASS",
    confidence: "HIGH",
    detail: open
      ? `Bubble's development copy of this app is publicly reachable at /version-test. That version usually carries test ` +
        `data, weaker or absent privacy rules and half-built workflows, and it is the copy people forget is public. ` +
        `Restrict it in the app's settings, and check its privacy rules separately from live — they are not shared.`
      : `The /version-test development copy is not publicly reachable.`,
    evidence: `GET /version-test → ${status}`,
  }];
}
