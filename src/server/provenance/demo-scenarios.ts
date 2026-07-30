// Provenance demo fixtures — the scenario set behind /api/dev/seed-provenance-demo.
//
// Extracted from the route so `__tests__/demo-scenarios.test.ts` can assert that each
// scenario really does produce the grade it claims, using the REAL engine and no database.
// That matters because the seed route cannot be exercised locally (no local DB, and no
// staging environment — see docs/build-checklist.md §4), so without this the demo data
// would be unverified until someone ran it against production and eyeballed the result.
//
// The rule these fixtures exist to demonstrate: a scenario describes itself by its
// EXCEPTIONS to a clean baseline, and `omit` models a check that never ran at all — which
// is what produces UNPROVEN, and is not the same thing as SKIPPED.

import { SAS_1 } from "./standard";
import { CATEGORIES } from "@/server/pulse-checks/categories";

export type SeededCheck = {
  category: string;
  checkKey: string;
  label: string;
  status: "PASS" | "WARN" | "FAIL" | "SKIPPED";
  detail: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
};

const pass = (checkKey: string, label: string, detail: string, category: string, confidence: SeededCheck["confidence"] = "HIGH"): SeededCheck =>
  ({ category, checkKey, label, status: "PASS", detail, confidence });
const fail = (checkKey: string, label: string, detail: string, category: string, confidence: SeededCheck["confidence"] = "HIGH"): SeededCheck =>
  ({ category, checkKey, label, status: "FAIL", detail, confidence });
const warn = (checkKey: string, label: string, detail: string, category: string, confidence: SeededCheck["confidence"] = "MEDIUM"): SeededCheck =>
  ({ category, checkKey, label, status: "WARN", detail, confidence });
const skip = (checkKey: string, label: string, detail: string, category: string): SeededCheck =>
  ({ category, checkKey, label, status: "SKIPPED", detail, confidence: "HIGH" });

/** Every key SAS-1 relies on, so a scan can be described by its exceptions. */
const ALL_CLAUSE_KEYS = SAS_1.clauses.flatMap((c) => c.checkKeys);

/**
 * A "clean" baseline: every SAS-1 key passing. Individual scenarios then override the
 * handful of keys that make their story, which keeps each scenario readable and means a
 * new clause in the standard is automatically covered rather than silently unmeasured.
 */
function baseline(): Map<string, SeededCheck> {
  const m = new Map<string, SeededCheck>();
  for (const key of ALL_CLAUSE_KEYS) {
    m.set(key, pass(key, humanise(key), "Observed directly during the scan.", CATEGORIES.INFRASTRUCTURE));
  }
  return m;
}

function humanise(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function withOverrides(overrides: SeededCheck[], omit: string[] = []): SeededCheck[] {
  const m = baseline();
  for (const o of overrides) m.set(o.checkKey, o);
  // `omit` models a check that never ran at all — which is what produces UNPROVEN, and is
  // the state the whole product exists to report honestly. Not the same as SKIPPED.
  for (const key of omit) m.delete(key);
  return [...m.values()];
}

export interface Scenario {
  projectName: string;
  repo: string | null;
  url: string | null;
  /** Asserted against the engine's actual output — a mismatch fails the seed loudly. */
  expectGrade: "CERTIFIED" | "CONDITIONAL" | "NOT_CERTIFIED" | "INCOMPLETE";
  checks: SeededCheck[];
  /** Withdraw the mark after issuing, so the register shows a REVOKED row. */
  revokeReason?: string;
  /** Issue twice, so the first mark shows as SUPERSEDED. */
  issueTwice?: boolean;
}

export const SCENARIOS: Scenario[] = [
  // ── CERTIFIED — the happy path. Deliberately a mature project. ──────────────
  {
    projectName: "Northwind Ledger",
    repo: "northwind/ledger-web",
    url: "https://ledger.northwind.example",
    expectGrade: "CERTIFIED",
    checks: withOverrides([
      skip("supabase_rls_enforced", "Supabase RLS Enforced", "No directly-addressable Supabase backend detected — clause does not apply.", CATEGORIES.SECURITY),
      skip("firebase_rules_locked", "Firebase Rules Locked", "No Firebase backend detected.", CATEGORIES.SECURITY),
      skip("no_service_role_key_exposed", "No Service Role Key Exposed", "No Supabase project detected.", CATEGORIES.SECRETS_KEYS),
    ]),
  },

  // ── NOT_CERTIFIED — the case that sells the product. ───────────────────────
  // Modelled on the published vibe-coded-app findings: keys in client JS, RLS off.
  {
    projectName: "Fernway Bookings",
    repo: "fernway/booking-app",
    url: "https://book.fernway.example",
    expectGrade: "NOT_CERTIFIED",
    checks: withOverrides([
      fail("no_api_keys_in_html", "No API Keys In HTML", "A Stripe publishable key and an OpenAI key were found in the shipped JavaScript bundle (main-4f2c.js).", CATEGORIES.SECRETS_KEYS),
      fail("supabase_rls_enforced", "Supabase RLS Enforced", "Row-level security is disabled on 4 of 6 tables — an unauthenticated read of `bookings` returned 1,182 rows including customer email and phone.", CATEGORIES.SECURITY),
      fail("no_public_secret_env", "No Public Secret Env", "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY is exposed to the browser.", CATEGORIES.SECRETS_KEYS),
      fail("has_tests", "Has Tests", "No test suite of any kind was found in the repository.", CATEGORIES.CODE_QUALITY),
      warn("hsts_header", "HSTS Header", "No Strict-Transport-Security header on the primary response.", CATEGORIES.SECURITY),
      warn("vibe_debug_mode", "Debug Mode Off", "A verbose Next.js error overlay is reachable in production.", CATEGORIES.VIBE_HYGIENE),
    ]),
  },

  // ── INCOMPLETE — the grade that is the product's whole argument. ───────────
  // A private repo the token could not read: critical clauses are UNPROVEN, and the mark
  // must NOT come out certified or failed. This is the §35 scenario made visible.
  {
    projectName: "Halcyon Care Portal",
    repo: "halcyon-health/care-portal",
    url: null,
    expectGrade: "INCOMPLETE",
    checks: withOverrides(
      [
        fail("repo_accessible", "Repo Accessible", "The configured GITHUB_TOKEN cannot see this repository — source-based checks could not run.", CATEGORIES.CODE_QUALITY),
      ],
      // Nothing source-based ran. These clauses are therefore NOT ESTABLISHED — not passed,
      // not failed. Every critical clause below is what forces INCOMPLETE.
      [
        "no_api_keys_in_html", "no_public_secret_env", "vibe_hardcoded_creds_html",
        "repo_secret_keys", "no_exposed_source_maps",
        "supabase_rls_enforced", "no_service_role_key_exposed", "firebase_rules_locked",
        "has_tests",
        "privacy_policy", "terms_of_service", "cookie_consent",
        "sql_error_exposure", "no_exposed_backup", "api_verbose_errors",
        "ssl_valid", "http_redirect", "certificate_expiry_30d",
      ],
    ),
  },

  // ── CONDITIONAL — critical clauses met, tidiness outstanding. ──────────────
  {
    projectName: "Talbot & Vine Storefront",
    repo: "talbot-vine/storefront",
    url: "https://shop.talbotvine.example",
    expectGrade: "CONDITIONAL",
    checks: withOverrides([
      warn("ci_cd_present", "CI/CD Present", "No continuous-integration workflow was found; deployments appear to be manual.", CATEGORIES.CODE_QUALITY),
      fail("error_monitoring", "Error Monitoring", "No error-reporting SDK detected.", CATEGORIES.OBSERVABILITY),
      fail("uptime_monitoring", "Uptime Monitoring", "No uptime monitor detected for the primary host.", CATEGORIES.OBSERVABILITY),
      warn("has_readme", "Has README", "README is the framework default and documents no setup steps.", CATEGORIES.CODE_QUALITY),
      skip("supabase_rls_enforced", "Supabase RLS Enforced", "No Supabase backend detected.", CATEGORIES.SECURITY),
      skip("firebase_rules_locked", "Firebase Rules Locked", "No Firebase backend detected.", CATEGORIES.SECURITY),
      skip("no_service_role_key_exposed", "No Service Role Key Exposed", "No Supabase project detected.", CATEGORIES.SECRETS_KEYS),
    ]),
  },

  // ── REVOKED — shows that withdrawal is visible, not a dead link. ───────────
  {
    projectName: "Marrow Logistics API",
    repo: "marrow/logistics-api",
    url: "https://api.marrow.example",
    expectGrade: "CONDITIONAL",
    checks: withOverrides([
      warn("ci_cd_present", "CI/CD Present", "CI runs tests but does not gate merges.", CATEGORIES.CODE_QUALITY),
      skip("supabase_rls_enforced", "Supabase RLS Enforced", "No Supabase backend detected.", CATEGORIES.SECURITY),
      skip("firebase_rules_locked", "Firebase Rules Locked", "No Firebase backend detected.", CATEGORIES.SECURITY),
      skip("no_service_role_key_exposed", "No Service Role Key Exposed", "No Supabase project detected.", CATEGORIES.SECRETS_KEYS),
    ]),
    revokeReason:
      "A live credential was found in the shipped bundle nine days after issue, during a routine re-examination. This mark no longer reflects the software and must not be relied on.",
  },

  // ── SUPERSEDED — two marks for one subject; the older points forward. ──────
  {
    projectName: "Ravensworth Intranet",
    repo: "ravensworth/intranet",
    url: "https://intranet.ravensworth.example",
    expectGrade: "CERTIFIED",
    issueTwice: true,
    checks: withOverrides([
      skip("supabase_rls_enforced", "Supabase RLS Enforced", "No Supabase backend detected.", CATEGORIES.SECURITY),
      skip("firebase_rules_locked", "Firebase Rules Locked", "No Firebase backend detected.", CATEGORIES.SECURITY),
      skip("no_service_role_key_exposed", "No Service Role Key Exposed", "No Supabase project detected.", CATEGORIES.SECRETS_KEYS),
    ]),
  },
];

export const DEMO_NAMES = SCENARIOS.map((s) => s.projectName);
