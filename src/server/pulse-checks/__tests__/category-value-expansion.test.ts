import { beforeEach, describe, expect, it, vi } from "vitest";

const dnsRecords = vi.hoisted(() => new Map<string, string[]>());
vi.mock("../_types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../_types")>();
  return { ...actual, checkDnsRecord: vi.fn(async (name: string, type: string) => dnsRecords.get(`${name}:${type}`) ?? dnsRecords.get(name) ?? []) };
});

import { runAuthExtended } from "../auth-extended";
import { runRolesPermissionsChecks } from "../roles-permissions";
import { runObservabilityExtended } from "../observability-extended";
import { runEmailDeliverabilityChecks } from "../email-deliverability";
import type { ExtendedCheckContext } from "../_types";

function context(html: string): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 1, finalUrl: "https://example.test" },
    httpsUrl: "https://example.test", hostname: "example.test", platform: "SAAS",
    ctx: { isPaymentEnabled: false, isAuthEnabled: true, isSaas: true, isMobileApp: false, hasBackend: true, authMethod: "password" },
    htmlLower: html.toLowerCase(), catchAll200: false,
  };
}

const statusOf = (checks: { checkKey: string; status: string }[], key: string) => checks.find((check) => check.checkKey === key)?.status;

describe("authentication value controls", () => {
  it("recognises concrete account-security UI evidence", async () => {
    const checks = await runAuthExtended(context(`
      <input type="password" autocomplete="current-password">
      <input type="password" autocomplete="new-password">
      <a href="/forgot-password">Reset password</a><button>Sign out</button>
      <p>We send a security alert when a new device signs in or your password changes.</p>
    `));
    for (const key of ["auth_login_autocomplete", "auth_signup_autocomplete", "auth_password_reset", "auth_logout_control", "auth_security_notifications"]) expect(statusOf(checks, key)).toBe("PASS");
  });

  it("does not award account-security controls without evidence", async () => {
    const checks = await runAuthExtended(context("<main>Account</main>"));
    for (const key of ["auth_login_autocomplete", "auth_signup_autocomplete", "auth_password_reset", "auth_logout_control", "auth_security_notifications"]) expect(statusOf(checks, key)).toBe("WARN");
  });
});

describe("role lifecycle controls", () => {
  it("recognises evidence for safe membership and ownership changes", async () => {
    const checks = await runRolesPermissionsChecks(context(`
      <p>Invitations expire after 7 days. Revoke pending invitation.</p>
      <button>Transfer workspace ownership</button>
      <p>You cannot remove the last administrator.</p><button>Create custom role</button>
    `));
    for (const key of ["invite_expiry", "invite_revocation", "ownership_transfer", "last_admin_protection", "custom_roles"]) expect(statusOf(checks, key)).toBe("PASS");
  });

  it("keeps unsupported role lifecycle controls visible as warnings", async () => {
    const checks = await runRolesPermissionsChecks(context("<main>Team members</main>"));
    for (const key of ["invite_expiry", "invite_revocation", "ownership_transfer", "last_admin_protection", "custom_roles"]) expect(statusOf(checks, key)).toBe("WARN");
  });
});

describe("operational visibility controls", () => {
  it("recognises incident communication and telemetry evidence", async () => {
    const checks = await runObservabilityExtended(context(`
      <a href="https://status.example.test">System status</a><button>Subscribe to incident updates</button>
      <p>Trace ID and correlation ID are attached to every request. Release health tracks errors by deploy version.</p>
      <p>Pager escalation policy notifies the secondary on-call engineer.</p>
    `));
    for (const key of ["public_status_page", "incident_subscriptions", "trace_correlation", "release_health", "alert_escalation"]) expect(statusOf(checks, key)).toBe("PASS");
  });

  it("does not infer operational controls from an ordinary product page", async () => {
    const checks = await runObservabilityExtended(context("<main>Product dashboard</main>"));
    for (const key of ["public_status_page", "incident_subscriptions", "trace_correlation", "release_health", "alert_escalation"]) expect(statusOf(checks, key)).toBe("WARN");
  });
});

describe("email DNS enforcement controls", () => {
  beforeEach(() => {
    dnsRecords.clear();
    dnsRecords.set("example.test:TXT", ['"v=spf1 include:_spf.example.net -all"']);
    dnsRecords.set("_dmarc.example.test", ['"v=DMARC1; p=reject; pct=100; rua=mailto:dmarc@example.test"']);
    dnsRecords.set("_smtp._tls.example.test", ['"v=TLSRPTv1; rua=mailto:tls@example.test"']);
    dnsRecords.set("example.test:MX", ["10 mx.example.test"]);
  });

  it("recognises complete sender-authentication reporting", async () => {
    const checks = await runEmailDeliverabilityChecks(context(""));
    for (const key of ["email_mx_present", "spf_single_record", "dmarc_aggregate_reporting", "dmarc_full_coverage", "tls_rpt_destination"]) expect(statusOf(checks, key)).toBe("PASS");
  });

  it("warns on ambiguous SPF and incomplete reporting enforcement", async () => {
    dnsRecords.set("example.test:TXT", ["v=spf1 include:a.example -all", "v=spf1 include:b.example -all"]);
    dnsRecords.set("_dmarc.example.test", ["v=DMARC1; p=quarantine; pct=25"]);
    dnsRecords.set("_smtp._tls.example.test", ["v=TLSRPTv1"]);
    dnsRecords.set("example.test:MX", []);
    const checks = await runEmailDeliverabilityChecks(context(""));
    for (const key of ["email_mx_present", "spf_single_record", "dmarc_aggregate_reporting", "dmarc_full_coverage", "tls_rpt_destination"]) expect(statusOf(checks, key)).toBe("WARN");
  });
});
