// The Provenance Standard — the published, versioned document a Countermark asserts against.
//
// A certificate that does not name its standard is worthless: "certified" means nothing
// unless a reader can look up exactly what was tested and what the pass condition was.
// So this file IS the product's contract with a counterparty, and it is versioned. A
// countermark records `standardId` + `standardVersion`, and the certificate page renders the
// clause text from the frozen outcome, never from whatever this file says today.
//
// ── Rules for editing this file ──────────────────────────────────────────────────
//
// 1. NEVER change a clause's meaning in place. Marks already issued cite it. Add a clause
//    with a new id, or cut a new standard version.
// 2. Every `checkKeys` entry MUST exist in src/server/checks-registry.ts. A clause whose
//    keys never appear in a scan is silently UNPROVEN forever, which reads on the
//    certificate as "we could not check this" when the truth is "we asked the wrong
//    question". `assertClauseKeysRegistered` in the tests guards this.
// 3. `assertion` is the sentence a buyer relies on. It must not claim more than the
//    checks establish. "No secrets were found in the shipped bundle" — not "the app has
//    no secrets". The first is what we measured; the second is a promise we cannot keep.
// 4. `critical: true` is reserved for clauses where being wrong costs money or exposes
//    data. A critical clause that is UNPROVEN downgrades the whole mark to INCOMPLETE,
//    so marking something critical has real teeth — don't do it for tidiness.

import type { ProvenanceStandard } from "./types";

/**
 * SAS-1 — Software Attestation Standard, revision 1.
 *
 * Scoped deliberately at what a deterministic scan of a repository and a live URL can
 * actually establish. It is NOT a security audit and the certificate says so: it is the
 * floor a buyer is entitled to expect before accepting delivery of software, which is a
 * bar the market currently has no instrument for at all.
 *
 * The clause set is drawn from the failure modes that actually recur in AI-built
 * software (see docs/provenance.md for the evidence): credentials shipped to the browser,
 * databases with authorisation disabled, no tests, no CI, no way to know it broke.
 */
export const SAS_1: ProvenanceStandard = {
  id: "SAS-1",
  version: "1.1.0",
  label: "Software Attestation Standard, revision 1",
  summary:
    "The delivery floor for commissioned software: no shipped credentials, enforced data " +
    "authorisation, a working transport layer, a maintainable and inspectable codebase, and " +
    "a way to know when it breaks.",
  // A conditional mark expires sooner than a clean one: more outstanding risk means the
  // evidence goes stale faster, and the shorter window is what makes re-examination worth
  // buying rather than a formality.
  validityDays: { certified: 90, conditional: 30 },
  clauses: [
    // ── Credentials and data authorisation ────────────────────────────────────────
    {
      id: "C1",
      title: "No credentials shipped to the browser",
      assertion:
        "No API keys, access tokens or secret environment values were found in the code " +
        "this application serves to a visitor's browser.",
      whyItMatters:
        "A key in browser code is readable by anyone who opens developer tools. It can be " +
        "used to run up charges on your account or read your data, and rotating it means " +
        "redeploying. This is the single most common defect in AI-generated applications.",
      critical: true,
      checkKeys: [
        "no_api_keys_in_html",
        "no_public_secret_env",
        "vibe_hardcoded_creds_html",
        "repo_secret_keys",
        "no_exposed_source_maps",
      ],
    },
    {
      id: "C2",
      title: "Database authorisation is enforced",
      assertion:
        "Where a directly-addressable database backend was detected, its row-level " +
        "authorisation rules were observed to be switched on and enforcing.",
      whyItMatters:
        "Backends like Supabase and Firebase are reachable straight from the browser. If " +
        "their authorisation rules are off, any visitor can read or delete every record — " +
        "not just their own. The rules default to permissive during development and are " +
        "routinely left that way.",
      critical: true,
      checkKeys: ["supabase_rls_enforced", "no_service_role_key_exposed", "firebase_rules_locked"],
    },
    {
      id: "C3",
      title: "No internal error detail or backups exposed",
      assertion:
        "The application did not return database error text to an unauthenticated request, " +
        "and no backup or archive files were reachable at predictable paths.",
      whyItMatters:
        "Database errors leak your table and column names, which is the reconnaissance step " +
        "before an attack. An exposed backup file is your entire dataset, downloadable.",
      critical: true,
      checkKeys: ["sql_error_exposure", "no_exposed_backup", "api_verbose_errors"],
    },

    // ── Transport ─────────────────────────────────────────────────────────────────
    {
      id: "C4",
      title: "Traffic is encrypted and the certificate is current",
      assertion:
        "The application served valid HTTPS, redirected plain HTTP to it, and its " +
        "certificate was not near expiry at the time of examination.",
      whyItMatters:
        "Without this, everything your customers type — passwords, card details, personal " +
        "data — crosses the network readable. An expired certificate takes the site down " +
        "with a browser warning that reads as 'this business is not safe'.",
      critical: true,
      checkKeys: ["ssl_valid", "http_redirect", "certificate_expiry_30d"],
    },
    {
      id: "C5",
      title: "Baseline browser protections are set",
      assertion:
        "The application sent the response headers that instruct browsers to enforce HTTPS " +
        "and refuse to be embedded or have foreign scripts injected.",
      whyItMatters:
        "These are one-line settings that browsers act on for you. Their absence does not " +
        "mean you have been attacked; it means a whole class of attack is not being blocked.",
      critical: false,
      checkKeys: ["hsts_header", "csp_header", "x_frame_options", "referrer_policy"],
    },
    {
      id: "C6",
      title: "Session cookies are protected",
      assertion:
        "Cookies used to keep a user signed in were marked so that browser scripts cannot " +
        "read them and other sites cannot send them.",
      whyItMatters:
        "An unprotected session cookie can be stolen by injected script and used to sign in " +
        "as your customer, without needing their password.",
      critical: false,
      checkKeys: ["session_cookie_httponly", "session_cookie_samesite", "secure_cookie_attributes"],
    },

    // ── Is it maintainable by someone other than the person who built it? ─────────
    {
      id: "C7",
      title: "Automated tests exist",
      assertion:
        "The repository contains an automated test suite appropriate to its language and " +
        "toolchain.",
      whyItMatters:
        "Without tests, nobody — including the original developer — can change the software " +
        "without a real chance of silently breaking something already paid for. This is the " +
        "difference between an asset you can extend and one you can only replace.",
      critical: true,
      checkKeys: ["has_tests"],
    },
    {
      id: "C8",
      title: "Changes are built and checked automatically",
      assertion:
        "A continuous integration pipeline was configured to build and check the project on " +
        "each change.",
      whyItMatters:
        "This is what stops a broken change reaching your customers. Its absence means every " +
        "deployment is a manual act of faith.",
      critical: false,
      checkKeys: ["ci_cd_present"],
    },
    {
      id: "C9",
      title: "A new developer can pick it up",
      assertion:
        "The repository carries setup documentation, a dependency-hygiene configuration, " +
        "and does not commit build output or environment files into version control.",
      whyItMatters:
        "This is what you are actually buying: the ability to hire someone else next year. " +
        "A repository with no README and committed secrets costs weeks of a new developer's " +
        "time before they can safely change one line.",
      critical: false,
      checkKeys: [
        "has_readme",
        "documentation",
        "has_gitignore",
        "has_linter",
        "vibe_env_not_committed",
        "vibe_node_modules_not_committed",
      ],
    },
    {
      id: "C10",
      title: "Dependencies are accounted for",
      assertion:
        "No dependency with a known published vulnerability was reported against the project " +
        "at the time of examination.",
      whyItMatters:
        "Most of the code in a modern application was written by strangers. This clause is " +
        "about whether anyone is watching those parts for known holes.",
      critical: false,
      checkKeys: ["dependency_vulnerabilities", "dependency_audit_clean", "has_dependabot"],
    },

    // ── Do you own it, and will you know when it breaks? ──────────────────────────
    {
      id: "C11",
      title: "Ownership and licensing are unambiguous",
      assertion:
        "The repository declares a licence, and its access controls and secret-scanning " +
        "settings were readable, establishing that the examinationing party could see the real " +
        "artifact.",
      whyItMatters:
        "If nobody can say who owns the code, you cannot sell the business, raise against " +
        "it, or stop the person who wrote it reusing it for a competitor.",
      critical: false,
      checkKeys: [
        "has_license",
        "branch_protection",
        "secret_scanning_github",
        "github_secret_scanning",
        // Added in v1.1.0. The clause's assertion already claimed the examining party could
        // see the real artifact, but nothing measured it — so a repository the token could
        // not read scored this clause on the strength of its OTHER keys. `repo_accessible`
        // is the canonical "could we even look" signal (§35: a failed lookup must never
        // read as an absence), so its omission was the clause being under-evidenced.
        "repo_accessible",
      ],
    },
    {
      id: "C12",
      title: "Failure is observable",
      assertion:
        "Error reporting or uptime monitoring was detected, so a fault reaches the operator " +
        "rather than only the customer who hit it.",
      whyItMatters:
        "Without this the first you hear of an outage is a complaint, and you have no record " +
        "of how long it lasted — which also makes it impossible to hold a supplier to an " +
        "availability promise.",
      critical: false,
      checkKeys: ["error_monitoring", "uptime_monitoring", "health_endpoint"],
    },
    {
      id: "C13",
      title: "It is not a prototype dressed as a product",
      assertion:
        "No debug mode, placeholder content or unfinished scaffolding was found on the " +
        "live surface.",
      whyItMatters:
        "Debug mode exposes internal detail to visitors, and placeholder copy tells your " +
        "customers the product is unfinished. Both are routine leftovers from AI-assisted " +
        "builds that nobody was asked to remove.",
      critical: false,
      checkKeys: [
        "vibe_debug_mode",
        "vibe_placeholder_content",
        "vibe_default_title",
        "vibe_no_custom_404",
      ],
    },

    // ── Legally required before you can trade ─────────────────────────────────────
    {
      id: "C14",
      title: "Required public policies are published",
      assertion:
        "A privacy policy and terms of service were reachable from the live application, and " +
        "a cookie-consent mechanism was present where applicable.",
      whyItMatters:
        "These are legal preconditions for collecting data from customers in the UK and EU, " +
        "not best practice. Their absence is the fastest thing a regulator or a large " +
        "customer's procurement team will find.",
      critical: true,
      checkKeys: ["privacy_policy", "terms_of_service", "cookie_consent"],
    },
  ],
};

export const STANDARDS: Record<string, ProvenanceStandard> = { [SAS_1.id]: SAS_1 };

export const DEFAULT_STANDARD_ID = SAS_1.id;

export function getStandard(id: string): ProvenanceStandard | null {
  return STANDARDS[id] ?? null;
}
