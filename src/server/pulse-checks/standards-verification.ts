import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";

/**
 * Pulse's evidence-required verification catalogue. These checks are deliberately
 * LOW confidence until an authenticated/device/release agent can verify them:
 * a public URL or repository listing must never fabricate a pass.
 *
 * Public secure-development research and implementation patterns informed the
 * catalogue. Labels are independently written Pulse controls, not imported
 * standard text or another product's terminology.
 */
export const PLATFORM_VALIDATION_PROFILES = [
  ["WEB_APP", "Web app", "a production browser with keyboard, touch, and responsive viewport coverage"],
  ["SAAS", "SaaS", "a production-like tenant with member, admin, billing, and lifecycle accounts"],
  ["MARKETING_SITE", "Marketing site", "public desktop and mobile browsers with consent and conversion paths enabled"],
  ["IOS_APP", "iOS app", "a signed build on supported devices, TestFlight, and App Store Connect"],
  ["ANDROID_APP", "Android app", "a signed build on representative devices, emulators, and Play pre-launch testing"],
  ["CROSS_PLATFORM_MOBILE", "Cross-platform mobile", "the shipped iOS and Android builds, including native integrations"],
  ["DESKTOP_APP", "Desktop app", "a signed production installer on every supported operating system"],
  ["CHROME_EXTENSION", "Chrome extension", "an isolated Chrome profile, permissions review, and Web Store package"],
  ["API_BACKEND", "API / backend", "a versioned staging API with least-privilege credentials and load tests"],
  ["CLI_TOOL", "CLI tool", "a clean supported shell and OS installed through every documented channel"],
  ["OTHER", "Other surface", "a production-equivalent environment with representative users and failures"],
] as const;

type PlatformId = (typeof PLATFORM_VALIDATION_PROFILES)[number][0];
type Control = { id: string; label: string; source: string; instruction: string };
const source = (prefix: string, _citation: string, instruction: string, labels: string[]) =>
  labels.map((label, index): Control => ({ id: `${prefix}_${String(index + 1).padStart(2, "0")}`, label, source: "Pulse verification baseline", instruction }));

export const STANDARDS_VALIDATION_CONTROLS: Control[] = [
  ...source("security_core", "Pulse verification baseline", "Verify with authenticated test cases and implementation evidence.", [
    "Rotate sessions after login and privilege changes", "Protect account recovery against takeover", "Test multi-factor enrollment, reset, and recovery", "Rate-limit authentication and recovery attempts", "Use modern password hashing and upgrade paths", "Enforce object-level authorization on every request", "Prove tenant data cannot cross account boundaries", "Test least-privilege roles and service identities", "Exercise injection defenses at every input boundary", "Validate file upload type, size, storage, and retrieval controls", "Verify key custody, rotation, and revocation procedures", "Confirm sensitive stored data is encrypted where required", "Test retention expiry and complete deletion workflows", "Ensure logs omit credentials, tokens, and sensitive personal data", "Verify failures do not reveal implementation or security details", "Review dependency provenance, integrity, and vulnerability response", "Test server-side request controls and outbound allowlists", "Verify webhook signature, replay, and timestamp checks", "Audit high-risk administrative actions", "Exercise security incident detection, escalation, and recovery",
  ]),
  ...source("inclusive_access", "Pulse verification baseline", "Verify with keyboard, screen reader, zoom, contrast, and assistive-technology testing.", [
    "Complete core tasks using keyboard-only navigation", "Prove focus never becomes trapped", "Check focus remains visible behind sticky UI and dialogs", "Verify focus indicators remain perceptible", "Measure actionable target size and spacing", "Offer a non-drag alternative for every drag interaction", "Allow authentication without cognitive-function tests", "Review, confirm, and correct consequential submissions", "Announce async status, errors, and updates accessibly", "Complete core flows at 400% zoom and narrow viewports", "Check text, icons, controls, and states for contrast", "Verify custom controls expose correct name, role, and value", "Test captions, transcripts, audio description, and controls", "Mark language changes for correct pronunciation", "Keep help entry points consistently located", "Warn and allow extension of time-limited interactions",
  ]),
  ...source("performance_core", "Pulse verification baseline", "Measure on representative devices, networks, and production data rather than local development.", [
    "Measure Largest Contentful Paint on representative routes", "Measure Interaction to Next Paint for real workflows", "Measure layout stability through loading and interaction", "Measure cold start and first meaningful action", "Test core tasks on constrained networks", "Test responsiveness on a low-end supported device", "Enforce image payload, dimensions, and decode budgets", "Enforce script payload and long-task budgets", "Verify font loading does not block readable content", "Test cache freshness, invalidation, and offline failure behavior", "Check for memory growth during long-lived sessions", "Verify background work yields to interaction and battery constraints", "Budget and failure-test every third-party dependency", "Gate releases on agreed performance regressions",
  ]),
  ...source("privacy_core", "Pulse verification baseline", "Validate with counsel where jurisdiction, product model, or data category makes it applicable.", [
    "Maintain a data inventory with purpose, owner, and retention", "Document lawful basis or consent for each personal-data use", "Test consent withdrawal and preference propagation", "Exercise access, correction, export, and deletion requests", "Assess age assurance and child-data requirements", "Review vendor and sub-processor processing terms", "Document cross-border transfer safeguards and data location", "Test breach triage and notification workflow", "Verify price, tax, renewal, and cancellation disclosure", "Test refund, cancellation, and complaint paths", "Publish an accessibility contact and remediation path", "Retain consent, transaction, and policy-version evidence",
  ]),
  ...source("release_core", "Pulse verification baseline", "Verify from the protected release branch, CI evidence, and an independently reproducible build.", [
    "Require protected branches and reviewed release changes", "Require passing CI before merge and deployment", "Cover unit, integration, contract, and end-to-end critical paths", "Track and expire flaky-test quarantines", "Validate a release candidate before broad rollout", "Exercise a documented rollback", "Verify feature flags default safely and can be disabled quickly", "Test forward and rollback data migrations", "Prove backups restore within recovery objectives", "Produce and review a software bill of materials", "Sign and verify release artifacts where supported", "Exercise secret rotation without interruption", "Compare production configuration to approved baselines", "Publish release notes and known limitations", "Assign ownership for critical services and alerts", "Validate support runbooks and escalation before launch",
  ]),
  ...source("reliability_core", "Pulse verification baseline", "Exercise failure modes safely in a production-like environment and retain the evidence.", [
    "Define user-centered service objectives and error budgets", "Test alerts for actionable signal, routing, and noise", "Verify liveness, readiness, and dependency health behavior", "Test graceful degradation when a critical dependency fails", "Load-test rate limits, queues, and overload behavior", "Verify bounded timeouts, retries, and idempotency", "Test expiry, ordering, and signatures under clock skew", "Exercise detection and recovery from corrupt or partial data", "Run a disaster-recovery exercise against recovery objectives", "Forecast capacity and test the next demand step", "Inject a controlled failure into each critical path", "Test status-page and customer communication procedures", "Use postmortems with owned follow-up actions", "Validate on-call coverage, runbooks, and escalation contacts",
  ]),
  ...source("distribution_core", "Pulse verification baseline", "Validate against the selected platform's current submission, packaging, and policy requirements.", [
    "Verify product identity, publisher information, and support contact", "Review every requested permission and its user-facing rationale", "Verify platform privacy declarations match actual behavior", "Validate platform payment and subscription rules", "Test deep links and fallback behavior", "Test update, downgrade, and incompatible-version handling", "Verify uninstall, account deletion, and local-data behavior", "Review listing assets, screenshots, copy, and localization", "Verify crash reports have symbols and an owner", "Test beta feedback, triage, and release-blocking process", "Test offline, reconnect, and interrupted-operation behavior", "Track policy changes and validate compliance before release",
  ]),
  ...source("api_ai_core", "Pulse verification baseline", "Use contract, abuse, and adversarial cases with non-production credentials and data.", [
    "Run consumer contracts and backward-compatibility tests", "Reject malformed request and response payloads safely", "Test idempotency for retried state-changing operations", "Test pagination, filtering, and resource-limit boundaries", "Exercise enumeration, mass assignment, and exhaustion cases", "Test version deprecation notices and migration paths", "Test prompt-injection and indirect-instruction resistance", "Evaluate unsafe and policy-sensitive model outputs", "Verify AI tools cannot exceed caller authorization", "Test retrieval and model outputs for cross-user data leakage", "Run versioned evaluations before model or prompt changes", "Test token, tool, and budget limits under adversarial load",
  ]),
];

/**
 * Pulse Deep Audit is an outcome-based control catalogue, independently
 * worded for Pulse. Every item is evidence-required: it never upgrades a
 * project from a public URL, a filename, or a claimed process alone.
 */
const deep = (area: string, instruction: string, labels: string[]) =>
  labels.map((label, index): Control => ({
    id: `deep_${area}_${String(index + 1).padStart(2, "0")}`,
    label,
    source: "Pulse Deep Audit",
    instruction,
  }));

export const PULSE_DEEP_AUDIT_CONTROLS: Control[] = [
  ...deep("identity", "Use separate low-privilege and high-privilege test accounts; retain the request, state transition, and expected result.", [
    "Identity: test enrollment and sign-in from a new device", "Identity: test sign-out invalidates every active session", "Identity: test password reset cannot disclose account existence", "Identity: test recovery cannot bypass stronger authentication", "Identity: test account linking requires fresh proof of control", "Identity: test an expired credential is rejected consistently", "Identity: test compromised credentials trigger a safe response", "Identity: test concurrent sessions obey the documented policy", "Identity: test remembered-device removal takes effect immediately", "Identity: test authentication event records are complete and privacy-safe", "Identity: test privileged reauthentication before a sensitive action",
  ]),
  ...deep("authorization", "Use at least two tenants, multiple roles, direct object references, and altered client-side state.", [
    "Authorization: test every create action against another tenant", "Authorization: test every read action against another tenant", "Authorization: test every update action against another tenant", "Authorization: test every delete action against another tenant", "Authorization: test bulk actions enforce per-object permission", "Authorization: test role changes take effect without a stale grant", "Authorization: test support and impersonation access is time-bounded", "Authorization: test export respects field-level permissions", "Authorization: test hidden routes reject direct navigation", "Authorization: test policy failures fail closed during dependency errors", "Authorization: test administrative actions require separation of duties",
  ]),
  ...deep("input", "Exercise every public and authenticated input boundary with malformed, oversized, encoded, and adversarial values.", [
    "Input: test type, range, format, and length validation", "Input: test canonicalisation before validation and authorization", "Input: test duplicate fields and conflicting parameters", "Input: test structured payload depth and collection limits", "Input: test parser errors do not expose internals", "Input: test server-side template and expression injection defenses", "Input: test command arguments never cross a shell boundary", "Input: test document parsers reject unsafe external resolution", "Input: test regular expressions resist pathological input", "Input: test redirects accept only intended destinations", "Input: test user-controlled URLs cannot reach protected networks",
  ]),
  ...deep("data", "Verify with representative sensitive, deleted, archived, and cross-tenant data in a non-production environment.", [
    "Data: test sensitive fields are minimised in responses", "Data: test masked views cannot be reversed by exports", "Data: test encrypted records are unreadable without authorised keys", "Data: test deleted data disappears from search and caches", "Data: test retention jobs remove data on schedule", "Data: test archive access obeys current permissions", "Data: test backups protect sensitive records", "Data: test restore does not resurrect deleted accounts incorrectly", "Data: test data classification changes propagate to downstream systems", "Data: test aggregate reporting cannot expose an individual", "Data: test production-like datasets used in testing are protected",
  ]),
  ...deep("secrets", "Review the full credential lifecycle using non-production values; do not place live secrets in test evidence.", [
    "Secrets: test new credentials are issued with least privilege", "Secrets: test rotation completes without service interruption", "Secrets: test revoked credentials fail promptly", "Secrets: test short-lived credentials cannot be replayed after expiry", "Secrets: test emergency access is logged and reviewed", "Secrets: test secrets never appear in application logs", "Secrets: test secrets never appear in error reports", "Secrets: test deployment variables are scoped to the target environment", "Secrets: test build artifacts contain no embedded credentials", "Secrets: test credential owners and expiry dates are known", "Secrets: test recovery works when the secrets service is unavailable",
  ]),
  ...deep("network", "Run these checks over supported networks, proxies, and failure modes with production-equivalent transport settings.", [
    "Network: test transport encryption is required end to end", "Network: test certificate failures stop sensitive connections", "Network: test outbound destinations are allow-listed where appropriate", "Network: test request forwarding preserves trustworthy client identity", "Network: test security headers apply to error responses", "Network: test cache directives protect private responses", "Network: test cross-origin access is limited to intended callers", "Network: test websocket origin and session validation", "Network: test rate limits distinguish users, tenants, and abuse sources", "Network: test denial-of-service protections preserve essential operations", "Network: test network retries do not duplicate state changes",
  ]),
  ...deep("api", "Run generated and hand-crafted contract cases against a versioned non-production API with real authorization boundaries.", [
    "API: test every operation rejects unknown fields safely", "API: test response schemas never leak internal attributes", "API: test pagination cannot skip authorization checks", "API: test filters and sort fields use an allow-list", "API: test idempotency keys survive retry and timeout cases", "API: test asynchronous operations expose a safe status lifecycle", "API: test version negotiation and deprecation notices", "API: test quotas return actionable machine-readable feedback", "API: test webhooks require origin, signature, and replay protection", "API: test API documentation examples cannot expose credentials", "API: test error identifiers support supportability without data leakage",
  ]),
  ...deep("content", "Use harmless test files and URLs to verify validation, storage, preview, download, and deletion paths.", [
    "Content: test file type is determined from content not filename", "Content: test file size and decompression limits", "Content: test uploaded content is isolated from executable paths", "Content: test previews cannot run active content", "Content: test downloads receive safe content-disposition handling", "Content: test image and document transforms strip unsafe metadata", "Content: test malware review and quarantine flow", "Content: test public links are unguessable and revocable", "Content: test attachment authorization survives copied links", "Content: test content deletion covers derived previews", "Content: test import jobs validate every record and report partial failure",
  ]),
  ...deep("commerce", "Use a non-production payment environment and adversarial timing, duplicate, refund, and entitlement cases.", [
    "Commerce: test price, currency, tax, and discount calculation", "Commerce: test a payment cannot be captured twice", "Commerce: test webhook delivery cannot grant an entitlement twice", "Commerce: test refund revokes or adjusts entitlement correctly", "Commerce: test cancellation ends renewal at the promised time", "Commerce: test upgrade and downgrade proration", "Commerce: test trials cannot be extended through simple account changes", "Commerce: test invoice and receipt access is properly authorised", "Commerce: test entitlement changes are fully auditable", "Commerce: test payment failure recovery does not surprise the customer", "Commerce: test regional purchase restrictions and disclosures",
  ]),
  ...deep("ai_behavior", "Use a versioned adversarial evaluation set and retain only safe, redacted evidence of prompts and outputs.", [
    "AI behavior: test instructions cannot override higher-priority policy", "AI behavior: test retrieved content cannot alter tool policy", "AI behavior: test outputs respect prohibited-content boundaries", "AI behavior: test output claims are appropriately qualified", "AI behavior: test model refusal remains helpful and safe", "AI behavior: test sensitive output is detected before delivery", "AI behavior: test long context does not displace safety instructions", "AI behavior: test multilingual prompts preserve policy behavior", "AI behavior: test repeated attempts do not weaken safeguards", "AI behavior: test model changes meet a fixed quality baseline", "AI behavior: test human escalation for high-impact outcomes",
  ]),
  ...deep("ai_tools", "Exercise tool calls with minimal credentials, malicious inputs, untrusted data, and denied authorizations.", [
    "AI tools: test every action is authorised as the requesting user", "AI tools: test tools receive only the fields they need", "AI tools: test high-impact actions require explicit confirmation", "AI tools: test tool arguments are validated independently", "AI tools: test tool outputs cannot trigger unintended follow-on actions", "AI tools: test agents cannot approve their own generated changes", "AI tools: test agents cannot promote their own artifacts", "AI tools: test agent identity is short-lived and scoped", "AI tools: test agent action logs are attributable and tamper-evident", "AI tools: test external tool outages fail safely", "AI tools: test action budgets prevent runaway orchestration",
  ]),
  ...deep("ai_data", "Verify with known corpus, embedding, memory, and deletion fixtures across user and tenant boundaries.", [
    "AI data: test training and evaluation data provenance", "AI data: test retrieval respects current user and tenant access", "AI data: test embeddings are deleted with their source data", "AI data: test memory expires according to user choice", "AI data: test retrieval citations point to permitted sources", "AI data: test ranking cannot surface restricted records", "AI data: test poisoned content is detected or contained", "AI data: test ingestion rejects unexpected active content", "AI data: test context redaction removes sensitive material", "AI data: test model-provider retention settings match the product promise", "AI data: test evaluation datasets exclude live customer secrets",
  ]),
  ...deep("privacy", "Trace one representative data subject through collection, use, sharing, retention, and rights fulfillment.", [
    "Privacy: test collection notices appear before optional collection", "Privacy: test consent choices propagate to every processing path", "Privacy: test withdrawal stops future optional processing", "Privacy: test preference changes reach service providers", "Privacy: test export is complete, portable, and properly authorised", "Privacy: test correction reaches derived and indexed data", "Privacy: test deletion requests are tracked to completion", "Privacy: test analytics honours declared consent", "Privacy: test location and device data have clear purpose limits", "Privacy: test children and vulnerable-user safeguards where relevant", "Privacy: test policy changes preserve historical consent evidence",
  ]),
  ...deep("accessibility", "Test core journeys with keyboard-only input, screen reader output, zoom, contrast, touch, and reduced-motion settings.", [
    "Accessibility: test every modal has predictable focus entry and exit", "Accessibility: test errors identify the field and recovery action", "Accessibility: test asynchronous status is announced without focus theft", "Accessibility: test forms preserve entries after a correctable error", "Accessibility: test custom gestures have simple alternatives", "Accessibility: test motion can be reduced or stopped", "Accessibility: test text resizing preserves content and controls", "Accessibility: test controls expose meaningful names and state", "Accessibility: test tables and charts have equivalent summaries", "Accessibility: test media controls work without a pointer", "Accessibility: test support can receive and track accessibility feedback",
  ]),
  ...deep("ux_recovery", "Interrupt core journeys with reloads, back navigation, connection loss, duplicate submits, and invalid state.", [
    "UX recovery: test unsaved work warning and recovery", "UX recovery: test refresh does not repeat a consequential action", "UX recovery: test back navigation preserves user intent", "UX recovery: test cancel paths leave no partial privileged state", "UX recovery: test confirmation language matches the actual outcome", "UX recovery: test destructive actions have proportionate safeguards", "UX recovery: test empty states explain the next useful action", "UX recovery: test error pages provide a route back to safety", "UX recovery: test long tasks expose progress and cancellation", "UX recovery: test interrupted onboarding can resume safely", "UX recovery: test user-visible history explains meaningful changes",
  ]),
  ...deep("performance", "Measure representative cold and warm paths on supported devices, constrained networks, large accounts, and extended sessions.", [
    "Performance: test startup remains within the product budget", "Performance: test primary interaction latency remains within budget", "Performance: test list and search performance at realistic scale", "Performance: test memory remains bounded over a long session", "Performance: test battery and background work remain proportionate", "Performance: test offline cache size and eviction", "Performance: test slow network feedback and cancellation", "Performance: test image, media, and document load budgets", "Performance: test peak concurrency does not collapse core paths", "Performance: test performance regression gates on representative hardware", "Performance: test third-party degradation does not block rendering",
  ]),
  ...deep("resilience", "Induce controlled dependency, storage, network, queue, and clock failures in a production-like environment.", [
    "Resilience: test dependency timeout has a bounded fallback", "Resilience: test retry policies stop before amplifying failure", "Resilience: test circuit breaking protects degraded dependencies", "Resilience: test queues remain ordered where ordering matters", "Resilience: test duplicate messages are harmless", "Resilience: test partial writes recover without corruption", "Resilience: test clock skew does not invalidate normal operation", "Resilience: test quota exhaustion preserves critical user access", "Resilience: test regional or zone failure has a documented response", "Resilience: test restore procedures meet recovery objectives", "Resilience: test customer communication starts during a major incident",
  ]),
  ...deep("observability", "Create a controlled failure for each critical path and verify signal, ownership, triage, and privacy-safe evidence.", [
    "Observability: test each critical journey has a success signal", "Observability: test each critical failure has an actionable alert", "Observability: test alerts identify the owning team or person", "Observability: test traces join client, service, and dependency work", "Observability: test logs include correlation without sensitive values", "Observability: test dashboards distinguish symptom from cause", "Observability: test synthetic probes cover external availability", "Observability: test alert suppression expires and is reviewed", "Observability: test on-call documentation works for a new responder", "Observability: test incident records preserve decisions and timeline", "Observability: test post-incident actions have owners and due dates",
  ]),
  ...deep("integrity", "Use forward, backward, partial, concurrent, and interrupted migration cases against representative data volume.", [
    "Integrity: test schema migrations are reversible or safely forward-only", "Integrity: test concurrent writes preserve invariants", "Integrity: test transaction boundaries match the user promise", "Integrity: test uniqueness survives race conditions", "Integrity: test references cannot become orphaned", "Integrity: test numeric rounding and precision at boundaries", "Integrity: test time-zone and daylight-transition rules", "Integrity: test import and export preserve required fidelity", "Integrity: test reconciliation detects missing or duplicate records", "Integrity: test audit history cannot be altered through normal paths", "Integrity: test data repair tools require review and produce evidence",
  ]),
  ...deep("release", "Review the protected release path with an independently reproducible candidate and documented rollback authority.", [
    "Release: test change review matches risk and blast radius", "Release: test required checks cannot be bypassed casually", "Release: test release artifacts are reproducible from source", "Release: test artifact identity is bound to the reviewed revision", "Release: test staged rollout detects harm before broad exposure", "Release: test rollback restores service and data compatibility", "Release: test feature switches default to the safer state", "Release: test configuration changes receive the same control as code", "Release: test emergency changes are retrospectively reviewed", "Release: test release notes name behavior and compatibility changes", "Release: test ownership and support readiness before deployment",
  ]),
  ...deep("supply", "Review the build graph, dependencies, artifacts, and promotion path using a clean reproducible build environment.", [
    "Supply chain: test dependency versions are resolved deterministically", "Supply chain: test unapproved dependencies cannot enter a release", "Supply chain: test dependency updates receive risk review", "Supply chain: test build scripts run with least privilege", "Supply chain: test build inputs are pinned and traceable", "Supply chain: test artifact integrity is verified at promotion", "Supply chain: test vulnerability findings have ownership and deadlines", "Supply chain: test removed dependencies leave no shipped residue", "Supply chain: test container and runtime base updates are maintained", "Supply chain: test release inventory matches the shipped artifact", "Supply chain: test a compromised dependency can be isolated quickly",
  ]),
  ...deep("device", "Test signed production builds on supported devices, locked and unlocked states, and altered runtime environments where safe.", [
    "Device: test sensitive screens are protected in task previews", "Device: test local sensitive data uses platform-protected storage", "Device: test clipboard use does not leak credentials", "Device: test notifications avoid sensitive content by default", "Device: test deep links validate origin and parameters", "Device: test background execution respects authentication state", "Device: test permissions are requested just in time", "Device: test denied permissions retain a usable fallback", "Device: test device integrity signals trigger proportionate controls", "Device: test release builds disable debugging and verbose logging", "Device: test update failure cannot leave the application unusable",
  ]),
  ...deep("host", "Use isolated profiles and hostile content to test extensions, desktop shells, local integrations, and plug-in boundaries.", [
    "Host: test remote content cannot obtain native capabilities", "Host: test local file access is restricted to the user intent", "Host: test inter-process messages validate sender and schema", "Host: test plug-ins run with explicit minimal permissions", "Host: test clipboard and drag-drop validate untrusted content", "Host: test external protocol handlers reject dangerous targets", "Host: test window creation preserves isolation settings", "Host: test auto-update authenticity is verified", "Host: test crash recovery does not expose prior sensitive state", "Host: test extension permissions match visible user benefit", "Host: test local integrations are disabled or scoped by default",
  ]),
  ...deep("distribution", "Install, update, downgrade, remove, and seek support through every supported channel and locale.", [
    "Distribution: test product identity and publisher contact are correct", "Distribution: test required permission explanations match behavior", "Distribution: test privacy declarations match observed data flow", "Distribution: test supported versions receive a clear upgrade path", "Distribution: test uninstall and account deletion outcomes are explained", "Distribution: test support contact is reachable from the product", "Distribution: test release channels cannot cross-promote accidentally", "Distribution: test localization handles truncation and right-to-left text", "Distribution: test legal and safety disclosures remain available offline where needed", "Distribution: test beta feedback is triaged before broad release", "Distribution: test known limitations are visible to affected users",
  ]),
  ...deep("business", "Use adversarial sequencing, duplicate requests, colluding accounts, and altered client data to test product rules.", [
    "Business rules: test limits cannot be bypassed by concurrency", "Business rules: test incentives cannot be claimed repeatedly", "Business rules: test referrals resist self-dealing and circular abuse", "Business rules: test approval workflows reject conflicted roles", "Business rules: test inventory and capacity cannot be oversold", "Business rules: test ranking and recommendation resist simple gaming", "Business rules: test coupons and promotions enforce intended eligibility", "Business rules: test account merging cannot transfer value improperly", "Business rules: test time-limited offers use an authoritative clock", "Business rules: test fraud signals cause proportionate reversible action", "Business rules: test disputed actions can be investigated from evidence",
  ]),
];

export const STANDARDS_VALIDATION_CONTROL_COUNT = STANDARDS_VALIDATION_CONTROLS.length;
export const PULSE_DEEP_AUDIT_CONTROL_COUNT = PULSE_DEEP_AUDIT_CONTROLS.length;
export const PULSE_VERIFICATION_CONTROLS = [...STANDARDS_VALIDATION_CONTROLS, ...PULSE_DEEP_AUDIT_CONTROLS];
/**
 * The catalogue is 391 CONTROLS. It used to also export controls × platforms as a
 * "catalogue count", which is what put 4,301 rows in the registry and made the
 * framework panel read as though Pulse had four thousand additional checks. It
 * never did: the same control was registered once per platform profile, differing
 * only in a label prefix. Counting inventory as coverage is precisely the claim
 * this product exists to refuse, so the multiplication is gone.
 */
export const STANDARDS_VALIDATION_CATALOGUE_COUNT = PULSE_VERIFICATION_CONTROLS.length;

function profileFor(platform?: string) {
  return PLATFORM_VALIDATION_PROFILES.find(([id]) => id === platform?.toUpperCase())
    ?? PLATFORM_VALIDATION_PROFILES.find(([id]) => id === "OTHER")!;
}

/**
 * A control's key is platform-independent. "Rotate sessions after login" is one
 * control whether the surface is a web app or an iOS build; the PLATFORM belongs
 * in the label and the instruction, which is where a reader needs it, not in the
 * identity — which is where it multiplied the catalogue elevenfold.
 */
function keyFor(control: Control) {
  return `standards_${control.id}`;
}

/** One row per control — the settings panel and framework count show 391, not 4,301. */
export const STANDARDS_VALIDATION_REGISTRY = PULSE_VERIFICATION_CONTROLS.map((control) => ({
  key: keyFor(control),
  category: CATEGORIES.STANDARDS_VERIFICATION,
  label: control.label,
}));

type EvidenceBinding = {
  controlId: string;
  sourceKey: string;
  /** A source check may safely prove only the negative case. */
  outcomes: readonly ("PASS" | "FAIL")[];
};

/**
 * Deterministic observations already collected in a Pulse URL/repository scan
 * can settle a small, exact subset of the evidence-required catalogue. We bind
 * only controls where the source observation directly proves the stated
 * outcome; broad controls remain manual until a dedicated authenticated or
 * release collector exists.
 */
const EVIDENCE_BINDINGS: readonly EvidenceBinding[] = [
  { controlId: "deep_network_01", sourceKey: "ssl_valid", outcomes: ["PASS", "FAIL"] },
  { controlId: "deep_network_02", sourceKey: "web_tls_verification_disabled", outcomes: ["FAIL"] },
  { controlId: "deep_network_07", sourceKey: "api_cors_credentials", outcomes: ["FAIL"] },
  { controlId: "deep_network_07", sourceKey: "api_cors_origin_reflection", outcomes: ["FAIL"] },
  { controlId: "security_core_09", sourceKey: "web_raw_html_injection", outcomes: ["FAIL"] },
  { controlId: "security_core_09", sourceKey: "web_sql_string_building", outcomes: ["FAIL"] },
  { controlId: "security_core_09", sourceKey: "web_dynamic_code_execution", outcomes: ["FAIL"] },
  { controlId: "deep_input_07", sourceKey: "web_shell_injection", outcomes: ["FAIL"] },
  { controlId: "deep_input_06", sourceKey: "web_unsafe_deserialization", outcomes: ["FAIL"] },
  { controlId: "deep_supply_01", sourceKey: "web_dependency_pinning", outcomes: ["PASS"] },
  { controlId: "deep_supply_01", sourceKey: "cli_lockfile_committed", outcomes: ["PASS"] },
  { controlId: "deep_secrets_09", sourceKey: "web_hardcoded_password", outcomes: ["FAIL"] },
  { controlId: "deep_secrets_09", sourceKey: "desktop_embedded_secret", outcomes: ["FAIL"] },
  { controlId: "deep_secrets_09", sourceKey: "rn_bundled_secret", outcomes: ["FAIL"] },
  { controlId: "deep_secrets_09", sourceKey: "cli_embedded_secret", outcomes: ["FAIL"] },
  { controlId: "security_core_15", sourceKey: "api_verbose_errors", outcomes: ["FAIL"] },
  { controlId: "deep_host_03", sourceKey: "tauri_remote_ipc_access", outcomes: ["FAIL"] },
  { controlId: "deep_host_07", sourceKey: "electron_context_isolation", outcomes: ["FAIL"] },
];

function evidenceIsDecisive(check: PulseScanCheckInput): check is PulseScanCheckInput & { status: "PASS" | "FAIL" } {
  return (check.status === "PASS" || check.status === "FAIL") && check.confidence !== "LOW";
}

/**
 * Replaces a manual evidence requirement only when this scan has a direct,
 * decisive observation for it. This function is pure so every collector
 * (public URL, repository source, authenticated browser, mobile build, or CI
 * artifact) shares exactly the same promotion rules.
 */
export function resolveEvidenceBackedControls(platform: string | undefined, observations: PulseScanCheckInput[]): PulseScanCheckInput[] {
  const bySourceKey = new Map(observations.filter(evidenceIsDecisive).map((check) => [check.checkKey, check]));
  const resolved = new Map<string, PulseScanCheckInput>();
  const keyPrefix = "standards_";

  for (const binding of EVIDENCE_BINDINGS) {
    const observation = bySourceKey.get(binding.sourceKey);
    if (!observation || !binding.outcomes.includes(observation.status)) continue;
    const current = resolved.get(binding.controlId);
    // A confirmed failure is always more important than a prior pass from a
    // different source. Otherwise preserve the first exact observation.
    if (!current || observation.status === "FAIL") resolved.set(binding.controlId, observation);
  }

  return runStandardsVerificationCatalog(platform).map((control) => {
    const controlId = control.checkKey.slice(keyPrefix.length);
    const observation = resolved.get(controlId);
    if (!observation) return control;

    const sourceEvidence = [observation.checkKey, observation.evidence].filter(Boolean).join(" · ");
    return {
      ...control,
      status: observation.status,
      confidence: observation.confidence ?? "MEDIUM",
      confidenceReason: `Verified from Pulse runtime evidence: ${observation.checkKey}.`,
      detail: `Pulse runtime evidence resolved this control: ${observation.detail}`,
      evidence: sourceEvidence || `Pulse runtime evidence · ${observation.checkKey}`,
    };
  });
}

/** Evidence-required selected-surface checks. LOW confidence keeps manual work score-neutral. */
export function runStandardsVerificationCatalog(platform?: string): PulseScanCheckInput[] {
  const [id, label, environment] = profileFor(platform);
  return PULSE_VERIFICATION_CONTROLS.map((control) => ({
    category: CATEGORIES.STANDARDS_VERIFICATION,
    checkKey: keyFor(control),
    label: `${label}: ${control.label}`,
    status: "WARN",
    confidence: "LOW",
    confidenceReason: "Requires authenticated, device, release, or human-review evidence; Pulse will not infer a pass from public signals.",
    detail: `Manual verification required in ${environment}. ${control.instruction} Source: ${control.source}.`,
    evidence: `${control.source} · ${label}`,
  }));
}
