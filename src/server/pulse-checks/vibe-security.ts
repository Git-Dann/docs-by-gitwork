import { type ExtendedCheckContext, type PulseScanCheckInput, fetchWithTimeout, skip, platformIs } from "./_types";

// Live security probes for AI-built ("vibe-coded") apps — the differentiator.
//
// AI builders (Lovable/Bolt/v0/Replit + Supabase/Firebase) routinely ship apps
// whose data is readable through the front door: the public anon key is in the
// client bundle and Row-Level Security is off (CVE-2025-48757 — ~10% of Lovable
// apps; 44/50 in an independent audit). Crucially, the platforms' own scanners
// only check that RLS *exists*, not whether it *works*. We do the real check:
// detect the backend + the public key the app already ships, then run a SAFE,
// read-only query proving whether the data is actually protected.
//
// Safety: we only ever use the site's OWN public key, read-only, limit=1, a small
// cap of tables, short timeouts. Evidence records the table name + a row-count +
// a redacted key prefix — NEVER row contents. This is exactly what an authorised
// audit does (and what an attacker does trivially). AI-free; deterministic core.

const CATEGORY = "Security";

const ALL_CHECKS: Array<[string, string]> = [
  ["supabase_rls_enforced", "Supabase Row-Level Security enforced"],
  ["no_service_role_key_exposed", "No service-role / secret key in client bundle"],
  ["firebase_rules_locked", "Firebase security rules locked down"],
  ["no_public_secret_env", "No secret-looking NEXT_PUBLIC_* variables"],
];

const MAX_BUNDLES = 4;
const MAX_BUNDLE_BYTES = 600_000;
const MAX_TABLES = 6;

/** Fetch up to MAX_BUNDLES same-origin <script src> bundles and return their text
 *  (size-capped). The engine only fetches HTML, so this is how we see client JS.
 *  Exported so other probe modules (e.g. ai-app-safety) can scan the bundle too. */
export async function fetchBundleText(html: string, baseUrl: string): Promise<string> {
  let origin: string;
  try { origin = new URL(baseUrl).origin; } catch { return ""; }
  const srcs = Array.from(html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)).map((m) => m[1]);
  const abs: string[] = [];
  for (const s of srcs) {
    try {
      const u = new URL(s, baseUrl);
      if (u.origin === origin && /\.js(\?|$)/i.test(u.pathname)) abs.push(u.href);
    } catch { /* skip */ }
    if (abs.length >= MAX_BUNDLES) break;
  }
  const parts = await Promise.all(abs.map(async (u) => {
    try {
      const res = await fetchWithTimeout(u, { headers: { "User-Agent": "Gitwork-Pulse/1.0" } });
      if (!res.ok) return "";
      return (await res.text()).slice(0, MAX_BUNDLE_BYTES);
    } catch { return ""; }
  }));
  return parts.join("\n");
}

/** Decode a JWT payload's `role` claim (Supabase keys are JWTs). */
function jwtRole(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as { role?: string };
    return typeof json.role === "string" ? json.role : null;
  } catch { return null; }
}

const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

export async function runVibeSecurityChecks(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  // Only meaningful for live web apps with a backend.
  if (platformIs(ctx.platform, "API_BACKEND", "CLI_TOOL", "IOS_APP", "ANDROID_APP", "DESKTOP_APP")) {
    return skip(CATEGORY, ALL_CHECKS, "Not applicable for this platform type.");
  }

  const html = ctx.pageResult.html;
  const usesSupabase = ctx.htmlLower.includes("supabase");
  const usesFirebase = ctx.htmlLower.includes("firebase") || ctx.htmlLower.includes("firestore");
  if (!usesSupabase && !usesFirebase) {
    return skip(CATEGORY, ALL_CHECKS, "No Supabase or Firebase backend detected — vibe-coded backend probes not applicable.");
  }

  // Pull the client JS so we can see the backend URL + keys + table references.
  const bundle = html + "\n" + (await fetchBundleText(html, ctx.httpsUrl));
  const checks: PulseScanCheckInput[] = [];

  const jwts = Array.from(new Set(bundle.match(JWT_RE) ?? []));
  const anonKey = jwts.find((t) => jwtRole(t) === "anon") ?? null;
  const serviceKey = jwts.find((t) => jwtRole(t) === "service_role") ?? null;

  // ── Supabase RLS — the live, read-only proof ────────────────────────────────
  const supabaseUrl = bundle.match(/https:\/\/[a-z0-9]{8,}\.supabase\.co/i)?.[0] ?? null;
  if (usesSupabase && supabaseUrl && anonKey) {
    const tables = Array.from(new Set(
      Array.from(bundle.matchAll(/\.from\(\s*["'`]([a-zA-Z_][a-zA-Z0-9_]*)["'`]\s*\)/g)).map((m) => m[1]),
    )).filter((t) => !/^(auth|storage)$/i.test(t)).slice(0, MAX_TABLES);

    const exposed: string[] = [];
    let probed = 0;
    let inconclusive = 0;
    for (const table of tables.length > 0 ? tables : []) {
      try {
        const res = await fetchWithTimeout(`${supabaseUrl}/rest/v1/${encodeURIComponent(table)}?select=*&limit=1`, {
          headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "User-Agent": "Gitwork-Pulse/1.0" },
        });
        probed++;
        if (res.status === 200) {
          const body = (await res.json().catch(() => null)) as unknown;
          if (Array.isArray(body) && body.length > 0) exposed.push(table);
          else inconclusive++; // empty table OR RLS returning [] — can't be sure
        }
        // 401/403/4xx ⇒ protected (RLS enforced) — no action.
      } catch { /* network error — skip this table */ }
    }

    if (exposed.length > 0) {
      checks.push({ category: CATEGORY, checkKey: "supabase_rls_enforced", label: "Supabase Row-Level Security enforced", status: "FAIL",
        detail: `CRITICAL: ${exposed.length} table(s) are readable with the public anon key WITHOUT logging in — Row-Level Security is off or misconfigured (CVE-2025-48757). Anyone can read this data. Enable RLS policies on every table in Supabase immediately.`,
        evidence: `Readable unauthenticated: ${exposed.join(", ")} · anon key ${anonKey.slice(0, 12)}…` });
    } else if (probed > 0 && inconclusive === probed) {
      checks.push({ category: CATEGORY, checkKey: "supabase_rls_enforced", label: "Supabase Row-Level Security enforced", status: "WARN",
        detail: "Supabase tables returned no rows to the public anon key — likely RLS-protected (or simply empty). Verify RLS policies exist on every table.",
        evidence: `Probed ${probed} table(s); none returned data` });
    } else if (probed > 0) {
      checks.push({ category: CATEGORY, checkKey: "supabase_rls_enforced", label: "Supabase Row-Level Security enforced", status: "PASS",
        detail: "Supabase tables rejected unauthenticated reads with the public anon key — Row-Level Security appears enforced.",
        evidence: `Probed ${probed} table(s); all protected` });
    } else {
      checks.push({ category: CATEGORY, checkKey: "supabase_rls_enforced", label: "Supabase Row-Level Security enforced", status: "WARN",
        detail: "Supabase detected but no table references were found in the client bundle to probe — manually confirm RLS is enabled on all tables.",
        evidence: supabaseUrl });
    }
  } else if (usesSupabase) {
    checks.push({ category: CATEGORY, checkKey: "supabase_rls_enforced", label: "Supabase Row-Level Security enforced", status: "WARN",
      detail: "Supabase detected but the project URL or anon key couldn't be read from the bundle — manually verify Row-Level Security is enabled on all tables.",
      evidence: supabaseUrl ?? "no anon key found" });
  } else {
    checks.push({ category: CATEGORY, checkKey: "supabase_rls_enforced", label: "Supabase Row-Level Security enforced", status: "SKIPPED", detail: "No Supabase backend detected." });
  }

  // ── Service-role / secret key exposed in the client bundle ──────────────────
  const secretPatterns = /\b(sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)\b/;
  const hasSecret = Boolean(serviceKey) || secretPatterns.test(bundle);
  checks.push({ category: CATEGORY, checkKey: "no_service_role_key_exposed", label: "No service-role / secret key in client bundle", status: hasSecret ? "FAIL" : "PASS",
    detail: hasSecret
      ? `CRITICAL: a secret key was found in the client-side code — ${serviceKey ? "a Supabase service_role key (bypasses ALL Row-Level Security)" : "an API secret / private key"}. Rotate it immediately and move it server-side. Public/anon/publishable keys are fine; this is not one.`
      : "No service-role or secret API keys detected in the client bundle (public/anon keys are expected and fine).",
    evidence: hasSecret ? (serviceKey ? `service_role JWT ${serviceKey.slice(0, 12)}…` : "secret key pattern in bundle") : undefined });

  // ── Firebase rules ──────────────────────────────────────────────────────────
  if (usesFirebase) {
    const projectId = bundle.match(/["']?projectId["']?\s*[:=]\s*["']([a-z0-9-]+)["']/i)?.[1] ?? null;
    const collection = Array.from(bundle.matchAll(/collection\(\s*(?:[a-zA-Z_$][\w$]*\s*,\s*)?["'`]([a-zA-Z_][\w]*)["'`]/g)).map((m) => m[1])[0] ?? null;
    let open = false;
    let probedFb = false;
    if (projectId && collection) {
      try {
        const res = await fetchWithTimeout(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}?pageSize=1`, {
          headers: { "User-Agent": "Gitwork-Pulse/1.0" },
        });
        probedFb = true;
        if (res.status === 200) {
          const body = (await res.json().catch(() => null)) as { documents?: unknown[] } | null;
          if (body && Array.isArray(body.documents) && body.documents.length > 0) open = true;
        }
      } catch { /* skip */ }
    }
    checks.push({ category: CATEGORY, checkKey: "firebase_rules_locked", label: "Firebase security rules locked down", status: open ? "FAIL" : probedFb ? "PASS" : "WARN",
      detail: open
        ? `CRITICAL: the Firestore collection "${collection}" is world-readable without authentication — Firebase security rules are in test/open mode. Lock down your rules before launch.`
        : probedFb
          ? "Firestore rejected an unauthenticated read — security rules appear locked down."
          : "Firebase detected but couldn't determine a collection to probe — manually verify Firestore/RTDB security rules are not in test mode.",
      evidence: projectId ? `project ${projectId}${collection ? ` · /${collection}` : ""}` : undefined });
  } else {
    checks.push({ category: CATEGORY, checkKey: "firebase_rules_locked", label: "Firebase security rules locked down", status: "SKIPPED", detail: "No Firebase backend detected." });
  }

  // ── Secret-looking NEXT_PUBLIC_* variables ──────────────────────────────────
  const publicSecretRe = /NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PRIVATE|TOKEN|PASSWORD|SERVICE_ROLE)[A-Z0-9_]*/g;
  const flagged = Array.from(new Set((bundle.match(publicSecretRe) ?? []).filter((v) => !/PUBLISHABLE|ANON/i.test(v))));
  checks.push({ category: CATEGORY, checkKey: "no_public_secret_env", label: "No secret-looking NEXT_PUBLIC_* variables", status: flagged.length > 0 ? "WARN" : "PASS",
    detail: flagged.length > 0
      ? `NEXT_PUBLIC_* variable name(s) imply a secret but are bundled into client JS (anything NEXT_PUBLIC_ is public): ${flagged.slice(0, 5).join(", ")}. Move secrets to server-only env vars.`
      : "No secret-looking NEXT_PUBLIC_* variables detected in the client bundle.",
    evidence: flagged.length > 0 ? flagged.slice(0, 5).join(", ") : undefined });

  return checks;
}
