import { CATEGORIES } from "./categories";
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

const CATEGORY = CATEGORIES.SECURITY;

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

export type SupabaseProbeOutcome = "exposed" | "empty" | "protected" | "unestablished";
/**
 * What one PostgREST read with the public key says about RLS. Only an explicit
 * permission denial (Postgres 42501, "permission denied") is "protected". A 404 (wrong
 * or missing table), a 401 because the key itself was refused, a 5xx, or any other
 * answer is "unestablished". A 200 with rows is exposed; a 200 with no rows is
 * ambiguous — RLS filtering every row looks exactly like an empty table.
 */
export function classifySupabaseProbe(status: number, body: string): SupabaseProbeOutcome {
  if (status === 200) {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (Array.isArray(parsed)) return parsed.length > 0 ? "exposed" : "empty";
    } catch { /* not JSON */ }
    return "unestablished";
  }
  if ((status === 401 || status === 403) && /"code"\s*:\s*"42501"|permission denied/i.test(body)) return "protected";
  return "unestablished";
}

export type FirebaseProbeOutcome = "exposed" | "readable_empty" | "protected" | "unestablished";
/** One unauthenticated Firestore REST list. 403 PERMISSION_DENIED from the rules is "protected"; a disabled API is not. */
export function classifyFirestoreProbe(status: number, body: string): FirebaseProbeOutcome {
  if (status === 200) {
    try {
      const parsed = JSON.parse(body) as { documents?: unknown[] } | null;
      if (parsed && typeof parsed === "object") return Array.isArray(parsed.documents) && parsed.documents.length > 0 ? "exposed" : "readable_empty";
    } catch { /* not JSON */ }
    return "unestablished";
  }
  // Only the RULES' own denial. Firestore also answers 403 PERMISSION_DENIED for a project
  // that does not exist ("Permission denied on resource project …", CONSUMER_INVALID) and
  // for one with the API switched off (SERVICE_DISABLED) — verified live, Oct 2026.
  if (status === 403 && /Missing or insufficient permissions/i.test(body)
    && !/CONSUMER_INVALID|SERVICE_DISABLED|has not been used|is disabled/i.test(body)) return "protected";
  return "unestablished";
}

/** One unauthenticated Realtime Database root read (`/.json?shallow=true`). */
export function classifyRtdbProbe(status: number, body: string): FirebaseProbeOutcome {
  if (status === 200) {
    const trimmed = body.trim();
    if (trimmed === "null") return "readable_empty";
    try { JSON.parse(trimmed); return "exposed"; } catch { return "unestablished"; }
  }
  if ((status === 401 || status === 403) && /permission denied/i.test(body)) return "protected";
  return "unestablished";
}

const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

export async function runVibeSecurityChecks(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  // Only meaningful for live web apps with a backend.
  if (platformIs(ctx.platform, "API_BACKEND", "CLI_TOOL", "IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE", "DESKTOP_APP")) {
    return skip(CATEGORY, ALL_CHECKS, "Not applicable for this platform type.");
  }

  const html = ctx.pageResult.html;
  // ⚠️ USE, not MENTION. These were `htmlLower.includes("supabase"/"firebase")`, which
  // fire on any page that merely NAMES the product. Verified outside Pulse with curl:
  // stripe.com 307s to stripe.com/gb, whose HTML contains "supabase" 14 times because
  // Supabase is a Stripe CUSTOMER — a case-study carousel plus i18n keys such as
  // `mkt-ssr.homepage.startups.carousel.supabase.company`. Pulse consequently told
  // Stripe to go and verify their Supabase Row-Level Security.
  //
  // Note the trailing `(?![a-z])`: without it `\.supabase\.co` matches inside
  // `.supabase.company`, which is the literal string on that page. The project-URL
  // form mirrors the one this file already uses correctly for `supabaseUrl` below.
  const SUPABASE_USE = /https:\/\/[a-z0-9-]{8,}\.supabase\.(?:co|in)(?![a-z])|supabase-js/i;
  const FIREBASE_USE = /firebaseio\.com|firebaseapp\.com|firebase-app\.js|firebaseConfig\s*=|identitytoolkit\.googleapis\.com/i;
  const usesSupabase = SUPABASE_USE.test(html);
  const usesFirebase = FIREBASE_USE.test(html);
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
  // Each table probe is classified by what came back (classifySupabaseProbe). Only an
  // explicit permission denial counts as "protected": a 404 (a table name scraped
  // wrongly, or one that no longer exists), a 5xx, or a 401 because the key was
  // rotated all said nothing about RLS and used to read as protected.
  const supabaseUrl = bundle.match(/https:\/\/[a-z0-9-]{8,}\.supabase\.(?:co|in)(?![a-z])/i)?.[0] ?? null;
  const publishableKey = bundle.match(/\bsb_publishable_[A-Za-z0-9_-]{16,}/)?.[0] ?? null;
  const clientKey = anonKey ?? publishableKey;
  const RLS = { category: CATEGORY, checkKey: "supabase_rls_enforced", label: "Supabase Row-Level Security enforced" } as const;
  if (usesSupabase && supabaseUrl && clientKey) {
    const tables = Array.from(new Set(
      Array.from(bundle.matchAll(/\.from\(\s*["'`]([a-zA-Z_][a-zA-Z0-9_]*)["'`]\s*\)/g)).map((m) => m[1]),
    )).filter((t) => !/^(auth|storage)$/i.test(t)).slice(0, MAX_TABLES);

    const outcome: Record<SupabaseProbeOutcome, string[]> = { exposed: [], empty: [], protected: [], unestablished: [] };
    for (const table of tables) {
      try {
        const headers: Record<string, string> = { apikey: clientKey, "User-Agent": "Gitwork-Pulse/1.0" };
        if (anonKey) headers.Authorization = `Bearer ${anonKey}`;
        const res = await fetchWithTimeout(`${supabaseUrl}/rest/v1/${encodeURIComponent(table)}?select=*&limit=1`, { headers });
        const body = (await res.text().catch(() => "")).slice(0, 4096);
        outcome[classifySupabaseProbe(res.status, body)].push(table);
      } catch {
        outcome.unestablished.push(table);
      }
    }

    const summary = `Probed ${tables.length} table(s): ${outcome.exposed.length} readable, ${outcome.protected.length} denied, ${outcome.empty.length} returned no rows, ${outcome.unestablished.length} could not be established`;
    if (outcome.exposed.length > 0) {
      checks.push({ ...RLS, status: "FAIL",
        detail: `CRITICAL: ${outcome.exposed.length} table(s) are readable with the public key WITHOUT logging in — Row-Level Security is off or misconfigured (CVE-2025-48757). Anyone can read this data. Enable RLS policies on every table in Supabase immediately.`,
        evidence: `Readable unauthenticated: ${outcome.exposed.join(", ")} · key ${clientKey.slice(0, 12)}…` });
    } else if (outcome.protected.length > 0 && outcome.empty.length === 0 && outcome.unestablished.length === 0) {
      checks.push({ ...RLS, status: "PASS",
        detail: `Every table Pulse found referenced in the client bundle (${outcome.protected.join(", ")}) refused an unauthenticated read with the public key. Tables the bundle does not reference were not probed.`,
        evidence: summary });
    } else if (outcome.protected.length > 0 || outcome.empty.length > 0) {
      checks.push({ ...RLS, status: "WARN",
        detail: `No table returned data to the public key, but not every table could be confirmed as protected: ${outcome.empty.length > 0 ? `${outcome.empty.join(", ")} answered with no rows (RLS filtering every row looks the same as an empty table)` : ""}${outcome.empty.length > 0 && outcome.unestablished.length > 0 ? "; " : ""}${outcome.unestablished.length > 0 ? `${outcome.unestablished.join(", ")} could not be probed` : ""}. Confirm RLS policies exist on those tables.`,
        evidence: summary });
    } else {
      checks.push({ ...RLS, status: "INCONCLUSIVE",
        detail: tables.length === 0
          ? "Supabase is used, but no table references were found in the client bundle to probe — whether Row-Level Security is enforced could not be established."
          : `No table probe gave an answer about Row-Level Security (tables not found, the key was refused, or the request failed) — whether RLS is enforced could not be established.`,
        evidence: tables.length === 0 ? supabaseUrl : summary });
    }
  } else if (usesSupabase) {
    checks.push({ ...RLS, status: "INCONCLUSIVE",
      detail: "Supabase is used, but the project URL or public key could not be read from the client bundle, so no read could be attempted — whether Row-Level Security is enforced could not be established.",
      evidence: supabaseUrl ?? "no public key found" });
  } else {
    checks.push({ ...RLS, status: "SKIPPED", detail: "No Supabase backend detected." });
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
  // Firestore AND Realtime Database, each classified by what came back. A 200 is the
  // rules ALLOWING an unauthenticated read, whether or not anything is there yet — so an
  // empty 200 is not "locked down". Only an explicit permission denial is. A 404 (no
  // default database, a wrong project id) or an API-disabled answer says nothing.
  if (usesFirebase) {
    const FB = { category: CATEGORY, checkKey: "firebase_rules_locked", label: "Firebase security rules locked down" } as const;
    const projectId = bundle.match(/["']?projectId["']?\s*[:=]\s*["']([a-z0-9-]+)["']/i)?.[1] ?? null;
    const databaseUrl = bundle.match(/https:\/\/[a-z0-9-]+(?:-default-rtdb)?(?:\.[a-z0-9-]+)?\.(?:firebaseio\.com|firebasedatabase\.app)/i)?.[0] ?? null;
    const collections = Array.from(new Set(
      Array.from(bundle.matchAll(/collection\(\s*(?:[a-zA-Z_$][\w$]*\s*,\s*)?["'`]([a-zA-Z_][\w]*)["'`]/g)).map((m) => m[1]),
    )).slice(0, 3);
    const results: Array<{ where: string; outcome: FirebaseProbeOutcome }> = [];
    if (projectId) {
      for (const collection of collections) {
        const where = `Firestore /${collection}`;
        try {
          const res = await fetchWithTimeout(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}?pageSize=1`, {
            headers: { "User-Agent": "Gitwork-Pulse/1.0" },
          });
          results.push({ where, outcome: classifyFirestoreProbe(res.status, (await res.text().catch(() => "")).slice(0, 8192)) });
        } catch { results.push({ where, outcome: "unestablished" }); }
      }
    }
    if (databaseUrl) {
      const where = `Realtime Database ${new URL(databaseUrl).hostname}`;
      try {
        const res = await fetchWithTimeout(`${databaseUrl}/.json?shallow=true`, { headers: { "User-Agent": "Gitwork-Pulse/1.0" } });
        results.push({ where, outcome: classifyRtdbProbe(res.status, (await res.text().catch(() => "")).slice(0, 4096)) });
      } catch { results.push({ where, outcome: "unestablished" }); }
    }
    const of = (o: FirebaseProbeOutcome) => results.filter((r) => r.outcome === o).map((r) => r.where);
    const evidence = [projectId ? `project ${projectId}` : null, ...results.map((r) => `${r.where}: ${r.outcome.replace("_", " ")}`)].filter(Boolean).join(" · ") || undefined;
    if (of("exposed").length > 0) {
      checks.push({ ...FB, status: "FAIL",
        detail: `CRITICAL: ${of("exposed").join(", ")} returned data without authentication — Firebase security rules allow anyone to read it. Lock the rules down before launch (unless this data is meant to be public).`,
        evidence });
    } else if (of("readable_empty").length > 0) {
      checks.push({ ...FB, status: "WARN",
        detail: `${of("readable_empty").join(", ")} accepted an unauthenticated read (it is empty right now, so nothing leaked). The rules allow it, so whatever is written there next is public. Restrict the rules unless that is intended.`,
        evidence });
    } else if (of("protected").length > 0 && of("unestablished").length === 0) {
      checks.push({ ...FB, status: "PASS",
        detail: `${of("protected").join(", ")} refused an unauthenticated read. Only these paths were probed; rules elsewhere were not tested.`,
        evidence });
    } else if (of("protected").length > 0) {
      checks.push({ ...FB, status: "WARN",
        detail: `${of("protected").join(", ")} refused an unauthenticated read, but ${of("unestablished").join(", ")} could not be checked. Confirm the rules there too.`,
        evidence });
    } else {
      checks.push({ ...FB, status: "INCONCLUSIVE",
        detail: results.length === 0
          ? "Firebase is used, but no Firestore collection or Realtime Database URL could be read from the client bundle to probe — whether the security rules are locked down could not be established."
          : "No Firebase probe gave an answer about the security rules (no default database, a wrong project id, the API disabled, or the request failed) — whether the rules are locked down could not be established.",
        evidence });
    }
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
