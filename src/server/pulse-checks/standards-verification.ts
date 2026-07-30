import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";

/**
 * Pulse's evidence-required verification catalogue. These checks are deliberately
 * LOW confidence until an authenticated/device/release agent can verify them:
 * a public URL or repository listing must never fabricate a pass.
 *
 * Sources: OWASP ASVS 5.0, W3C WCAG 2.2, Chrome Lighthouse/Core Web Vitals,
 * GitHub secure-development guidance, SRE practice, and platform distribution
 * guidance. Labels are concise paraphrases, not copied standards text.
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
const source = (prefix: string, citation: string, instruction: string, labels: string[]) =>
  labels.map((label, index): Control => ({ id: `${prefix}_${String(index + 1).padStart(2, "0")}`, label, source: citation, instruction }));

export const STANDARDS_VALIDATION_CONTROLS: Control[] = [
  ...source("asvs", "OWASP ASVS 5.0", "Verify with authenticated test cases and implementation evidence.", [
    "Rotate sessions after login and privilege changes", "Protect account recovery against takeover", "Test multi-factor enrollment, reset, and recovery", "Rate-limit authentication and recovery attempts", "Use modern password hashing and upgrade paths", "Enforce object-level authorization on every request", "Prove tenant data cannot cross account boundaries", "Test least-privilege roles and service identities", "Exercise injection defenses at every input boundary", "Validate file upload type, size, storage, and retrieval controls", "Verify key custody, rotation, and revocation procedures", "Confirm sensitive stored data is encrypted where required", "Test retention expiry and complete deletion workflows", "Ensure logs omit credentials, tokens, and sensitive personal data", "Verify failures do not reveal implementation or security details", "Review dependency provenance, integrity, and vulnerability response", "Test server-side request controls and outbound allowlists", "Verify webhook signature, replay, and timestamp checks", "Audit high-risk administrative actions", "Exercise security incident detection, escalation, and recovery",
  ]),
  ...source("wcag", "W3C WCAG 2.2", "Verify with keyboard, screen reader, zoom, contrast, and assistive-technology testing.", [
    "Complete core tasks using keyboard-only navigation", "Prove focus never becomes trapped", "Check focus remains visible behind sticky UI and dialogs", "Verify focus indicators remain perceptible", "Measure actionable target size and spacing", "Offer a non-drag alternative for every drag interaction", "Allow authentication without cognitive-function tests", "Review, confirm, and correct consequential submissions", "Announce async status, errors, and updates accessibly", "Complete core flows at 400% zoom and narrow viewports", "Check text, icons, controls, and states for contrast", "Verify custom controls expose correct name, role, and value", "Test captions, transcripts, audio description, and controls", "Mark language changes for correct pronunciation", "Keep help entry points consistently located", "Warn and allow extension of time-limited interactions",
  ]),
  ...source("perf", "Chrome Lighthouse and Core Web Vitals", "Measure on representative devices, networks, and production data rather than local development.", [
    "Measure Largest Contentful Paint on representative routes", "Measure Interaction to Next Paint for real workflows", "Measure layout stability through loading and interaction", "Measure cold start and first meaningful action", "Test core tasks on constrained networks", "Test responsiveness on a low-end supported device", "Enforce image payload, dimensions, and decode budgets", "Enforce script payload and long-task budgets", "Verify font loading does not block readable content", "Test cache freshness, invalidation, and offline failure behavior", "Check for memory growth during long-lived sessions", "Verify background work yields to interaction and battery constraints", "Budget and failure-test every third-party dependency", "Gate releases on agreed performance regressions",
  ]),
  ...source("privacy", "Privacy and consumer-protection baseline", "Validate with counsel where jurisdiction, product model, or data category makes it applicable.", [
    "Maintain a data inventory with purpose, owner, and retention", "Document lawful basis or consent for each personal-data use", "Test consent withdrawal and preference propagation", "Exercise access, correction, export, and deletion requests", "Assess age assurance and child-data requirements", "Review vendor and sub-processor processing terms", "Document cross-border transfer safeguards and data location", "Test breach triage and notification workflow", "Verify price, tax, renewal, and cancellation disclosure", "Test refund, cancellation, and complaint paths", "Publish an accessibility contact and remediation path", "Retain consent, transaction, and policy-version evidence",
  ]),
  ...source("release", "GitHub secure-development guidance", "Verify from the protected release branch, CI evidence, and an independently reproducible build.", [
    "Require protected branches and reviewed release changes", "Require passing CI before merge and deployment", "Cover unit, integration, contract, and end-to-end critical paths", "Track and expire flaky-test quarantines", "Validate a release candidate before broad rollout", "Exercise a documented rollback", "Verify feature flags default safely and can be disabled quickly", "Test forward and rollback data migrations", "Prove backups restore within recovery objectives", "Produce and review a software bill of materials", "Sign and verify release artifacts where supported", "Exercise secret rotation without interruption", "Compare production configuration to approved baselines", "Publish release notes and known limitations", "Assign ownership for critical services and alerts", "Validate support runbooks and escalation before launch",
  ]),
  ...source("reliability", "SRE reliability practice", "Exercise failure modes safely in a production-like environment and retain the evidence.", [
    "Define user-centered service objectives and error budgets", "Test alerts for actionable signal, routing, and noise", "Verify liveness, readiness, and dependency health behavior", "Test graceful degradation when a critical dependency fails", "Load-test rate limits, queues, and overload behavior", "Verify bounded timeouts, retries, and idempotency", "Test expiry, ordering, and signatures under clock skew", "Exercise detection and recovery from corrupt or partial data", "Run a disaster-recovery exercise against recovery objectives", "Forecast capacity and test the next demand step", "Inject a controlled failure into each critical path", "Test status-page and customer communication procedures", "Use postmortems with owned follow-up actions", "Validate on-call coverage, runbooks, and escalation contacts",
  ]),
  ...source("distribution", "Platform distribution guidance", "Validate against the selected platform's current submission, packaging, and policy requirements.", [
    "Verify product identity, publisher information, and support contact", "Review every requested permission and its user-facing rationale", "Verify platform privacy declarations match actual behavior", "Validate platform payment and subscription rules", "Test deep links and fallback behavior", "Test update, downgrade, and incompatible-version handling", "Verify uninstall, account deletion, and local-data behavior", "Review listing assets, screenshots, copy, and localization", "Verify crash reports have symbols and an owner", "Test beta feedback, triage, and release-blocking process", "Test offline, reconnect, and interrupted-operation behavior", "Track policy changes and validate compliance before release",
  ]),
  ...source("api_ai", "OWASP API Security and AI production practice", "Use contract, abuse, and adversarial cases with non-production credentials and data.", [
    "Run consumer contracts and backward-compatibility tests", "Reject malformed request and response payloads safely", "Test idempotency for retried state-changing operations", "Test pagination, filtering, and resource-limit boundaries", "Exercise enumeration, mass assignment, and exhaustion cases", "Test version deprecation notices and migration paths", "Test prompt-injection and indirect-instruction resistance", "Evaluate unsafe and policy-sensitive model outputs", "Verify AI tools cannot exceed caller authorization", "Test retrieval and model outputs for cross-user data leakage", "Run versioned evaluations before model or prompt changes", "Test token, tool, and budget limits under adversarial load",
  ]),
];

export const STANDARDS_VALIDATION_CONTROL_COUNT = STANDARDS_VALIDATION_CONTROLS.length;
export const STANDARDS_VALIDATION_CATALOGUE_COUNT = STANDARDS_VALIDATION_CONTROL_COUNT * PLATFORM_VALIDATION_PROFILES.length;

function profileFor(platform?: string) {
  return PLATFORM_VALIDATION_PROFILES.find(([id]) => id === platform?.toUpperCase())
    ?? PLATFORM_VALIDATION_PROFILES.find(([id]) => id === "OTHER")!;
}

function keyFor(platform: PlatformId, control: Control) {
  return `standards_${platform.toLowerCase()}_${control.id}`;
}

/** The full cross-platform inventory used by the settings panel and framework count. */
export const STANDARDS_VALIDATION_REGISTRY = PLATFORM_VALIDATION_PROFILES.flatMap(([platform, label]) =>
  STANDARDS_VALIDATION_CONTROLS.map((control) => ({
    key: keyFor(platform, control),
    category: CATEGORIES.STANDARDS_VERIFICATION,
    label: `${label}: ${control.label}`,
  })),
);

/** 116 selected-surface checks. LOW confidence keeps manual work score-neutral. */
export function runStandardsVerificationCatalog(platform?: string): PulseScanCheckInput[] {
  const [id, label, environment] = profileFor(platform);
  return STANDARDS_VALIDATION_CONTROLS.map((control) => ({
    category: CATEGORIES.STANDARDS_VERIFICATION,
    checkKey: keyFor(id, control),
    label: `${label}: ${control.label}`,
    status: "WARN",
    confidence: "LOW",
    confidenceReason: "Requires authenticated, device, release, or human-review evidence; Pulse will not infer a pass from public signals.",
    detail: `Manual verification required in ${environment}. ${control.instruction} Source: ${control.source}.`,
    evidence: `${control.source} · ${label}`,
  }));
}
