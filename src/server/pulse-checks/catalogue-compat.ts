// ─────────────────────────────────────────────────────────────────────────────
// CATALOGUE COMPATIBILITY — a checkKey is a PUBLIC IDENTIFIER, not an internal name.
//
// Every key in CHECKS_REGISTRY is referenced by data outside this codebase:
//   • PulseScanCheck rows going back to the first scan, which the report renders
//   • PulseCheckConfig rows — a workspace's own enable/label/severity decisions,
//     keyed by checkKey (@@unique([workspaceId, checkKey]))
//   • PulseCheckStat rows the Curator reads to propose lifecycle transitions
//   • ForemanFindingAction-style external references, share links and API clients
//
// So deleting or renaming a key does not "clean up the catalogue" — it silently
// orphans a customer's configuration and makes their scan history unreadable.
// A key that has outlived its implementation is RETIRED, with a stated successor;
// it is not removed.
//
// `catalogue-baseline.json` records the keys that exist. `catalogue-compat.test.ts`
// fails if one disappears from it without a RETIRED_CHECKS entry, and fails if a
// newly added key is missing from it — run `npm run pulse:catalogue` to refresh.
// ─────────────────────────────────────────────────────────────────────────────

/** The catalogue's own version. Bump when the shape of the contract changes. */
export const CATALOGUE_VERSION = "pulse-controls-2026.10";

/**
 * How a retired key relates to what replaced it. Mirrors the vocabulary a reader
 * of an old scan needs: "this was replaced by a stronger verification method" is
 * a different fact from "this was split into three" or "this was withdrawn".
 */
export type CheckRelationship =
  | "SUPERSEDED_BY"
  | "MERGED_INTO"
  | "SPLIT_INTO"
  | "ALIAS_OF"
  | "WITHDRAWN";

export interface RetiredCheck {
  /** Why the key stopped being emitted. Written for someone reading an old scan. */
  reason: string;
  relationship: CheckRelationship;
  /**
   * The key(s) that now carry this assessment. Required for every relationship
   * except WITHDRAWN, where the assessment itself is gone rather than moved.
   */
  replacedBy?: string[];
  /** The catalogue version in which the key stopped being emitted. */
  retiredIn: string;
}

/**
 * Retired keys. Each stays a readable identifier for old scans and saved check
 * configuration; only its implementation is gone.
 */
export const RETIRED_CHECKS: Record<string, RetiredCheck> = {
  // October 2026: the checks that had been withheld from every report. Each either
  // duplicated a check that reads real evidence (SUPERSEDED_BY / ALIAS_OF) or asked
  // something no scan can see (WITHDRAWN).
  structured_logging: { relationship: "SUPERSEDED_BY", replacedBy: ["svc_structured_logging"], retiredIn: "pulse-controls-2026.10", reason: "It used to search the website's HTML for vendor names and keywords, which says nothing about the practice. Structured logging is read from the repository's own logger setup." },
  distributed_tracing: { relationship: "SUPERSEDED_BY", replacedBy: ["obs_x_tracing"], retiredIn: "pulse-controls-2026.10", reason: "It used to search the website's HTML for vendor names and keywords, which says nothing about the practice. Tracing is read from the repository's instrumentation and dependencies." },
  trace_correlation: { relationship: "SUPERSEDED_BY", replacedBy: ["api_request_correlation", "svc_request_id"], retiredIn: "pulse-controls-2026.10", reason: "It searched page HTML for the words 'request id'. The real question is answered by the response headers of the scanned API and by the service's own request-id middleware." },
  release_health: { relationship: "SUPERSEDED_BY", replacedBy: ["obs_depth_release_markers"], retiredIn: "pulse-controls-2026.10", reason: "It used to search the website's HTML for vendor names and keywords, which says nothing about the practice. Release tagging of telemetry is read from the repository's monitoring setup." },
  queue_depth_monitoring: { relationship: "SUPERSEDED_BY", replacedBy: ["obs_depth_queue_metrics"], retiredIn: "pulse-controls-2026.10", reason: "It used to search the website's HTML for vendor names and keywords, which says nothing about the practice. Queue metrics are read from the repository's queue and metrics code." },
  db_performance_monitoring: { relationship: "SUPERSEDED_BY", replacedBy: ["obs_depth_slow_query_visibility"], retiredIn: "pulse-controls-2026.10", reason: "It used to search the website's HTML for vendor names and keywords, which says nothing about the practice. Query timing and slow-query visibility are read from the repository." },
  error_budget_policy: { relationship: "SUPERSEDED_BY", replacedBy: ["obs_depth_slo_versioned"], retiredIn: "pulse-controls-2026.10", reason: "It used to search the website's HTML for vendor names and keywords, which says nothing about the practice. Service-level objectives are read from version-controlled SLO files." },
  incident_runbooks: { relationship: "SUPERSEDED_BY", replacedBy: ["business_depth_incident_runbook"], retiredIn: "pulse-controls-2026.10", reason: "It used to search the website's HTML for vendor names and keywords, which says nothing about the practice. Runbooks are read from the repository." },
  email_unsubscribe_signal: { relationship: "SUPERSEDED_BY", replacedBy: ["mail_x_unsubscribe_header", "email_depth_one_click_unsubscribe"], retiredIn: "pulse-controls-2026.10", reason: "It looked for the word 'unsubscribe' on the website. Whether the product's emails carry List-Unsubscribe and one-click unsubscribe is read from its email-sending code." },
  bounce_handling_signal: { relationship: "SUPERSEDED_BY", replacedBy: ["mail_x_bounce_handling"], retiredIn: "pulse-controls-2026.10", reason: "It looked for words like 'bounce' on the website. Bounce handling is read from the product's email webhook code." },
  email_mx_present: { relationship: "ALIAS_OF", replacedBy: ["mx_record"], retiredIn: "pulse-controls-2026.10", reason: "It repeated the mx_record check: the same MX lookup, answered twice." },
  gdpr_right_to_erasure_ui: { relationship: "SUPERSEDED_BY", replacedBy: ["data_deletion_right", "saas_depth_account_deletion_workflow", "pages_depth_account_deletion_route"], retiredIn: "pulse-controls-2026.10", reason: "A delete-account control lives behind sign-in, which a scan never reaches. Erasure is assessed from the privacy notice and from the repository's account-deletion route and workflow." },
  workspace_tenant_isolation: { relationship: "SUPERSEDED_BY", replacedBy: ["roles_depth_tenant_query_scope", "saas_depth_tenant_isolation_tests"], retiredIn: "pulse-controls-2026.10", reason: "A page that mentions workspaces says nothing about isolation. Tenant scoping is read from the repository's data queries and tests." },
  auth_logout_control: { relationship: "SUPERSEDED_BY", replacedBy: ["auth_x_logout_invalidates"], retiredIn: "pulse-controls-2026.10", reason: "A sign-out control only renders for a signed-in user, and Pulse never signs in. Whether sign-out ends the session is read from the repository." },
  github_branch_protection: { relationship: "MERGED_INTO", replacedBy: ["branch_protection"], retiredIn: "pulse-controls-2026.10", reason: "It searched a website's HTML for the words 'branch protection'. branch_protection reads the repository's actual protection rules from GitHub." },
  github_required_reviews: { relationship: "MERGED_INTO", replacedBy: ["branch_protection"], retiredIn: "pulse-controls-2026.10", reason: "It searched a website's HTML for review-related words. branch_protection reads the repository's actual required-review settings from GitHub." },
  deployment_frequency_tracking: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "Deployment history is recorded by every deployment platform and by GitHub itself, so the question had only one answer, and DORA metrics are an engineering-management choice rather than a readiness finding." },
  custom_business_metrics: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "Which business events a team charts is a product decision that leaves no reliable trace in a website or a repository." },
  casl_double_optin: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "Whether subscribers confirm by email can only be seen by subscribing, which a scan does not do." },
  email_warm_up_signals: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "Sending reputation and IP warm-up are managed inside the email provider and cannot be seen from a website or a repository." },
  mailing_list_segmentation: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "List segmentation lives inside the email marketing tool and cannot be seen from a website or a repository." },
  gdpr_breach_notification: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "GDPR Art. 33/34 require an internal breach procedure, not a published one, so no page can show it." },
  gdpr_records_processing: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "A record of processing (GDPR Art. 30) is an internal document that is never published." },
  gdpr_ropa_maintained: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "A record of processing (GDPR Art. 30) is an internal document that is never published. It also duplicated gdpr_records_processing." },
  gdpr_data_access_control: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "Whether staff access to personal data is restricted by role is an internal control behind sign-in." },
  bribery_act_policy: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "The UK Bribery Act requires adequate internal procedures, not a published policy, and it is not a product readiness question." },
  whistleblower_policy: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "An internal corporate policy that a product's pages do not show, and not a product readiness question." },
  supplier_due_diligence: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "Vendor due diligence is an internal process that a product's pages do not show." },
  insurance_mention: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "Insurance cover is a corporate matter that a product's pages do not show, and not a product readiness question." },
  esignature_support: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "How contracts are signed is a back-office practice that a public page cannot show." },
  chargeback_prevention: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "Dispute and chargeback tooling is back-office and leaves no trace in a page or a repository." },
  fraud_detection_tool: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "Fraud screening (Stripe Radar and similar) runs on the payment server and leaves no trace in a page." },
  otp_attempt_limiting: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "Attempt limits are enforced on the server and only show after failed guesses, which a scan never makes." },
  otp_resend_cooldown: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "A resend cooldown is enforced on the server and only shows after a code is sent, which a scan never does." },
  global_depth_residency_routing: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "Data residency is enforced in deployment and storage configuration outside the repository, and the words it matched also appear in marketing copy and ordinary cloud config." },
  roles_depth_default_deny: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "Deny-by-default is a property of how every authorisation path falls through, which a pattern over sampled files cannot establish." },
  roles_depth_server_authorization: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "Whether each privileged route is guarded needs routes tied to their handlers; a list of guard names found anywhere in the repository cannot show it." },
  stale_bot_configured: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "It searched a website's HTML for the words 'stale bot'. Whether to auto-close inactive issues is a maintainer's choice rather than a readiness finding, and many projects deliberately do not." },
  plain_text_email: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "Whether a plain-text part is sent depends on email provider settings outside the repository, and many providers generate one automatically." },
  can_spam_address: { relationship: "WITHDRAWN", retiredIn: "pulse-controls-2026.10", reason: "CAN-SPAM's postal address applies to commercial email only, and email marketing tools insert it themselves, so neither a website nor a template file can show whether it is present." },
};

/** True when a key is no longer emitted but is still a readable historical identifier. */
export function isRetiredCheck(key: string): boolean {
  return Object.hasOwn(RETIRED_CHECKS, key);
}
