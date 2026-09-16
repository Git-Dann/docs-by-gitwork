import { afterEach, describe, expect, it, vi } from "vitest";

// Mock at the transport boundary rather than at `_types`, so the real
// `resolveDnsRecord` / `fetchWithTimeout` code paths under test actually run.
vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import { resolveDnsRecord, resolveAllDnsRecords, checkDnsRecord, probeInconclusive, type ExtendedCheckContext } from "../_types";
import { runSecurityExtended } from "../security-extended";
import { runInfrastructureExtended } from "../infrastructure-extended";
import { runEmailDeliverabilityChecks } from "../email-deliverability";
import { runAiAeoChecks } from "../ai-aeo";
import { computeScoreBreakdown } from "../score-breakdown";
import { CATEGORIES } from "../categories";
import type { PulseScanCheckInput } from "@/types/pulse";

// ─────────────────────────────────────────────────────────────────────────────
// A probe that could not be completed must never land on the reassuring answer.
//
// Every case here is a real shape that shipped: a DNS timeout reported as "no
// dangling CNAME", a GraphQL introspection query that failed reported as
// "introspection appears disabled", an unreachable robots.txt reported as
// "nothing blocks AI crawlers". In each, an outage on Pulse's side was rendered
// as a fact about the customer's product.
//
// The rule the tests encode: absence of evidence is INCONCLUSIVE, which is
// excluded from both sides of the health score and lowers assurance
// completeness. It is never PASS, and never a WARN invented from a failure.
// ─────────────────────────────────────────────────────────────────────────────

const DNS = "cloudflare-dns.com";

function context(overrides: Partial<ExtendedCheckContext> = {}): ExtendedCheckContext {
  const html = "<html><body>hello</body></html>";
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: "https://example.test" },
    httpsUrl: "https://example.test",
    hostname: "example.test",
    platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
    ...overrides,
  };
}

const statusOf = (checks: { checkKey: string; status: string }[], key: string) =>
  checks.find((check) => check.checkKey === key)?.status;
const detailOf = (checks: { checkKey: string; detail?: string }[], key: string) =>
  checks.find((check) => check.checkKey === key)?.detail ?? "";

/**
 * DoH answer for one name+type; every other request 404s.
 *
 * ⚠️ `servfail` / `refused` / `nxdomain` all return **HTTP 200** with an empty
 * Answer, because that is what a DoH resolver really does — the rcode lives in
 * the JSON `Status` field, not in the HTTP status. Only `Status` separates "the
 * resolver failed" from "there is no such record".
 */
type DnsBehaviour = "ok" | "throw" | "http500" | "servfail" | "refused" | "nxdomain" | "formerr";

const RCODE: Record<string, number> = { servfail: 2, refused: 5, nxdomain: 3, formerr: 1 };

function dnsResponder(answers: Record<string, string[]>, dnsBehaviour: DnsBehaviour = "ok") {
  return vi.fn(async (url: string | URL) => {
    const value = String(url);
    if (value.includes(DNS)) {
      if (dnsBehaviour === "throw") throw new Error("ECONNRESET");
      if (dnsBehaviour === "http500") return new Response("upstream error", { status: 500 });
      if (dnsBehaviour !== "ok") {
        return new Response(JSON.stringify({ Status: RCODE[dnsBehaviour], Answer: [] }), {
          headers: { "content-type": "application/dns-json" },
        });
      }
      const name = new URL(value).searchParams.get("name") ?? "";
      const type = new URL(value).searchParams.get("type") ?? "";
      const records = answers[`${name}:${type}`] ?? [];
      return new Response(JSON.stringify({ Answer: records.map((data) => ({ data })) }), {
        headers: { "content-type": "application/dns-json" },
      });
    }
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  });
}

/** A DoH responder that states its rcode explicitly, answers included. */
function dohResponder(status: number, records: string[] = []) {
  return vi.fn(async (url: string | URL) => {
    if (String(url).includes(DNS)) {
      return new Response(JSON.stringify({ Status: status, Answer: records.map((data) => ({ data })) }), {
        headers: { "content-type": "application/dns-json" },
      });
    }
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("resolveDnsRecord distinguishes 'no record' from 'could not ask'", () => {
  it("reports an empty answer as a successful lookup with no records", async () => {
    vi.stubGlobal("fetch", dnsResponder({}));
    expect(await resolveDnsRecord("example.test", "AAAA")).toEqual({ ok: true, records: [] });
  });

  it("reports a network error as a failed lookup, not an empty one", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "throw"));
    const result = await resolveDnsRecord("example.test", "AAAA");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("ECONNRESET");
  });

  it("reports a non-200 from the resolver as a failed lookup", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "http500"));
    const result = await resolveDnsRecord("example.test", "AAAA");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("500");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // The DoH `Status` rcode, which the HTTP status cannot stand in for.
  //
  // A resolver answers HTTP 200 for a failed lookup: SERVFAIL and REFUSED both
  // arrive as 200 with an empty Answer. Reading only the HTTP status makes them
  // indistinguishable from "there is no such record" — which silently defeats
  // every INCONCLUSIVE branch below, because those branches correctly test `ok`
  // and `ok` was lying to them.
  //
  // These sit alongside the NOERROR-empty and NXDOMAIN cases deliberately: those
  // two ARE answers and must keep reporting absence.
  // ───────────────────────────────────────────────────────────────────────────

  it("reports SERVFAIL as a failed lookup, not as 'there is no such record'", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "servfail"));
    const result = await resolveDnsRecord("example.test", "TXT");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("SERVFAIL");
      expect(result.status).toBe(2);
    }
  });

  it("reports REFUSED as a failed lookup", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "refused"));
    const result = await resolveDnsRecord("example.test", "TXT");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("REFUSED");
      expect(result.status).toBe(5);
    }
  });

  it("reports any other non-answering rcode as a failed lookup", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "formerr"));
    const result = await resolveDnsRecord("example.test", "TXT");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("FORMERR");
  });

  it("keeps NXDOMAIN an ANSWER — the name does not exist, which is a real finding", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "nxdomain"));
    const result = await resolveDnsRecord("www.www.gov.test", "CNAME");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.records).toEqual([]);
      expect(result.status).toBe(3);
    }
  });

  it("keeps NOERROR-with-an-empty-answer an ANSWER — the record genuinely is absent", async () => {
    vi.stubGlobal("fetch", dohResponder(0));
    const result = await resolveDnsRecord("example.test", "AAAA");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.records).toEqual([]);
  });

  it("still returns the records on an explicit NOERROR answer", async () => {
    vi.stubGlobal("fetch", dohResponder(0, ["2606:4700::1"]));
    const result = await resolveDnsRecord("example.test", "AAAA");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.records).toEqual(["2606:4700::1"]);
  });

  it("treats a response with no Status field as answered rather than inventing an outage", async () => {
    // Cloudflare always sends `Status`; a double or a non-conforming resolver
    // that omits it must not flip every DNS check to inconclusive.
    vi.stubGlobal("fetch", dnsResponder({ "example.test:AAAA": ["2606:4700::1"] }));
    expect(await resolveDnsRecord("example.test", "AAAA")).toEqual({ ok: true, records: ["2606:4700::1"] });
  });

  it("leaves checkDnsRecord's contract unchanged for its existing callers", async () => {
    vi.stubGlobal("fetch", dnsResponder({ "example.test:CAA": ["0 issue \"letsencrypt.org\""] }));
    expect(await checkDnsRecord("example.test", "CAA")).toEqual(["0 issue \"letsencrypt.org\""]);
    vi.stubGlobal("fetch", dnsResponder({}, "throw"));
    expect(await checkDnsRecord("example.test", "CAA")).toEqual([]);
  });
});

describe("subdomain takeover — a failed CNAME lookup is not a clean result", () => {
  it("does not PASS when the CNAME lookup fails", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "throw"));
    const checks = await runSecurityExtended(context());
    expect(statusOf(checks, "subdomain_takeover_risk")).toBe("INCONCLUSIVE");
    expect(detailOf(checks, "subdomain_takeover_risk")).toContain("could not complete");
  });

  it("still PASSes when the lookup genuinely succeeds with no dangling CNAME", async () => {
    vi.stubGlobal("fetch", dnsResponder({ "example.test:CNAME": ["example.test.cdn.example."] }));
    const checks = await runSecurityExtended(context());
    expect(statusOf(checks, "subdomain_takeover_risk")).toBe("PASS");
  });

  it("still FAILs on a real dangling CNAME", async () => {
    vi.stubGlobal("fetch", dnsResponder({ "example.test:CNAME": ["abandoned.herokuapp.com."] }));
    const checks = await runSecurityExtended(context());
    expect(statusOf(checks, "subdomain_takeover_risk")).toBe("FAIL");
  });
});

describe("GraphQL introspection — a failed probe is not proof it is disabled", () => {
  /** /graphql answers 200 so the endpoint is 'present'; the introspection POST then throws. */
  function graphqlPresentButProbeFails() {
    return vi.fn(async (url: string | URL, init?: RequestInit) => {
      const value = String(url);
      if (value.includes(DNS)) {
        return new Response(JSON.stringify({ Answer: [] }), { headers: { "content-type": "application/dns-json" } });
      }
      if (value.endsWith("/graphql")) {
        if (init?.method === "POST") throw new Error("ETIMEDOUT");
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
    });
  }

  it("does not PASS when the introspection query never completes", async () => {
    vi.stubGlobal("fetch", graphqlPresentButProbeFails());
    const checks = await runSecurityExtended(context());
    expect(statusOf(checks, "no_graphql_introspection_prod")).toBe("INCONCLUSIVE");
    expect(detailOf(checks, "no_graphql_introspection_prod")).toContain("ETIMEDOUT");
  });

  it("still PASSes when there is no GraphQL endpoint at all", async () => {
    vi.stubGlobal("fetch", dnsResponder({}));
    const checks = await runSecurityExtended(context());
    expect(statusOf(checks, "no_graphql_introspection_prod")).toBe("PASS");
  });
});

describe("IPv6 and www — a resolver outage is not a missing record", () => {
  it("does not WARN 'no AAAA record' when the AAAA lookup failed", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "throw"));
    const checks = await runInfrastructureExtended(context());
    expect(statusOf(checks, "ipv6_dns_record")).toBe("INCONCLUSIVE");
  });

  it("still WARNs when the lookup succeeds and there is genuinely no AAAA record", async () => {
    vi.stubGlobal("fetch", dnsResponder({}));
    const checks = await runInfrastructureExtended(context());
    expect(statusOf(checks, "ipv6_dns_record")).toBe("WARN");
  });

  it("still PASSes on a real AAAA record", async () => {
    vi.stubGlobal("fetch", dnsResponder({ "example.test:AAAA": ["2606:4700::1"] }));
    const checks = await runInfrastructureExtended(context());
    expect(statusOf(checks, "ipv6_dns_record")).toBe("PASS");
  });

  it("does not claim 'no www subdomain' when the www lookup failed", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "throw"));
    const checks = await runInfrastructureExtended(context());
    expect(statusOf(checks, "backup_domain_configured")).toBe("INCONCLUSIVE");
  });
});

describe("robots.txt — unreachable is not 'nothing blocks AI crawlers'", () => {
  it("does not PASS when the robots.txt request never completes", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/robots.txt")) throw new Error("ENOTFOUND");
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
    }));
    const checks = await runAiAeoChecks(context());
    expect(statusOf(checks, "aeo_ai_crawlers_allowed")).toBe("INCONCLUSIVE");
  });

  it("still PASSes on a real 404 — a site with no robots.txt genuinely blocks nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } })));
    const checks = await runAiAeoChecks(context());
    expect(statusOf(checks, "aeo_ai_crawlers_allowed")).toBe("PASS");
  });

  it("still WARNs when a readable robots.txt blocks every crawler", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      if (String(url).endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow: /", { headers: { "content-type": "text/plain" } });
      }
      return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
    }));
    const checks = await runAiAeoChecks(context());
    expect(statusOf(checks, "aeo_ai_crawlers_allowed")).toBe("WARN");
  });
});

describe("resolveAllDnsRecords fails the whole answer if any lookup fails", () => {
  // A combined "is there a record like this across these names" question is only
  // sound as an EMPTY answer if every lookup completed.
  it("merges records when all succeed", async () => {
    vi.stubGlobal("fetch", dnsResponder({ "a.test:MX": ["10 mx.a"], "b.test:MX": ["20 mx.b"] }));
    const result = await resolveAllDnsRecords([["a.test", "MX"], ["b.test", "MX"]]);
    expect(result).toEqual({ ok: true, records: ["10 mx.a", "20 mx.b"] });
  });

  it("reports failure rather than a partial merge", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "throw"));
    expect((await resolveAllDnsRecords([["a.test", "MX"], ["b.test", "MX"]])).ok).toBe(false);
  });
});

describe("email deliverability — a resolver blip is not a broken mail setup", () => {
  // 12 checks in this family conclude from an absent record. A DNS outage
  // previously reported every one of them as a finding: no SPF, no DKIM, no MX.
  const EMAIL_DNS_KEYS = [
    "dkim_record_present", "bimi_record_present", "mta_sts_policy", "tls_rpt_record",
    "spf_hardfail", "dmarc_quarantine_reject", "email_mx_present", "spf_single_record",
    "dmarc_aggregate_reporting", "dmarc_full_coverage", "tls_rpt_destination",
    "transactional_subdomain",
  ];

  it("reports every DNS-derived check as inconclusive when DNS is unreachable", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "throw"));
    const checks = await runEmailDeliverabilityChecks(context());
    for (const key of EMAIL_DNS_KEYS) {
      expect(statusOf(checks, key), key).toBe("INCONCLUSIVE");
    }
  });

  it("still WARNs on a genuinely absent record when the lookup succeeded", async () => {
    vi.stubGlobal("fetch", dnsResponder({}));
    const checks = await runEmailDeliverabilityChecks(context());
    for (const key of EMAIL_DNS_KEYS) {
      expect(statusOf(checks, key), key).toBe("WARN");
    }
  });

  it("still PASSes on real records", async () => {
    vi.stubGlobal("fetch", dnsResponder({
      "example.test:TXT": ['"v=spf1 -all"'],
      "example.test:MX": ["10 mx.example.test"],
      "_dmarc.example.test:TXT": ['"v=DMARC1; p=reject; pct=100; rua=mailto:d@example.test"'],
    }));
    const checks = await runEmailDeliverabilityChecks(context());
    expect(statusOf(checks, "spf_hardfail")).toBe("PASS");
    expect(statusOf(checks, "email_mx_present")).toBe("PASS");
    expect(statusOf(checks, "dmarc_quarantine_reject")).toBe("PASS");
  });
});

describe("CAA and DNSSEC — the same rule as their siblings", () => {
  it("does not claim a missing CAA or DS record when the lookup failed", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "throw"));
    const checks = await runSecurityExtended(context());
    expect(statusOf(checks, "caa_dns_record")).toBe("INCONCLUSIVE");
    expect(statusOf(checks, "dnssec_enabled")).toBe("INCONCLUSIVE");
  });

  it("still WARNs when the lookup succeeded and the records are genuinely absent", async () => {
    vi.stubGlobal("fetch", dnsResponder({}));
    const checks = await runSecurityExtended(context());
    expect(statusOf(checks, "caa_dns_record")).toBe("WARN");
    expect(statusOf(checks, "dnssec_enabled")).toBe("WARN");
  });
});

describe("a resolver rcode failure reaches the checks, and NXDOMAIN still doesn't", () => {
  // The end of the same thread: the checks below branch correctly on `ok`, so
  // they were only ever as honest as `resolveDnsRecord`. A SERVFAIL served as
  // HTTP 200 used to arrive as `{ok: true, records: []}` and every one of them
  // would state, at HIGH-visibility severity, that a record the customer
  // publishes is missing — or that a security gate is fine when it was never
  // measured.

  it("does not claim a missing CAA or DS record on SERVFAIL", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "servfail"));
    const checks = await runSecurityExtended(context());
    expect(statusOf(checks, "caa_dns_record")).toBe("INCONCLUSIVE");
    expect(statusOf(checks, "dnssec_enabled")).toBe("INCONCLUSIVE");
    expect(detailOf(checks, "caa_dns_record")).toContain("SERVFAIL");
  });

  it("does not claim a broken mail setup on REFUSED", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "refused"));
    const checks = await runEmailDeliverabilityChecks(context());
    for (const key of ["spf_hardfail", "dmarc_quarantine_reject", "email_mx_present", "dkim_record_present"]) {
      expect(statusOf(checks, key), key).toBe("INCONCLUSIVE");
    }
  });

  it("does not PASS the subdomain-takeover gate on SERVFAIL", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "servfail"));
    const checks = await runSecurityExtended(context());
    expect(statusOf(checks, "subdomain_takeover_risk")).toBe("INCONCLUSIVE");
  });

  it("does not claim 'no AAAA record' on SERVFAIL", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "servfail"));
    const checks = await runInfrastructureExtended(context());
    expect(statusOf(checks, "ipv6_dns_record")).toBe("INCONCLUSIVE");
  });

  // …and the other half of the rule: an rcode that IS an answer must keep
  // producing the finding. NXDOMAIN on the counterpart `www.` name is the exact
  // real-world case from the audit, and it is a genuine defect, not an outage.
  it("still WARNs on a real NXDOMAIN for the www counterpart", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "nxdomain"));
    const checks = await runInfrastructureExtended(context());
    expect(statusOf(checks, "backup_domain_configured")).toBe("WARN");
  });

  it("still reports genuinely absent mail records when the resolver answered NXDOMAIN", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "nxdomain"));
    const checks = await runEmailDeliverabilityChecks(context());
    for (const key of ["spf_hardfail", "dmarc_quarantine_reject", "email_mx_present"]) {
      expect(statusOf(checks, key), key).toBe("WARN");
    }
  });

  it("still FAILs on a dangling CNAME returned with an explicit NOERROR", async () => {
    vi.stubGlobal("fetch", dohResponder(0, ["abandoned.herokuapp.com."]));
    const checks = await runSecurityExtended(context());
    expect(statusOf(checks, "subdomain_takeover_risk")).toBe("FAIL");
  });
});

describe("resolveAllDnsRecords fails the combined answer on an rcode failure", () => {
  it("does not merge a SERVFAIL into an empty combined answer", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "servfail"));
    const result = await resolveAllDnsRecords([["a.test", "MX"], ["b.test", "MX"]]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("SERVFAIL");
  });

  it("still merges when every lookup answered NXDOMAIN", async () => {
    vi.stubGlobal("fetch", dnsResponder({}, "nxdomain"));
    expect(await resolveAllDnsRecords([["a.test", "MX"], ["b.test", "MX"]])).toEqual({ ok: true, records: [] });
  });
});

describe("an inconclusive probe costs assurance coverage, not health score", () => {
  const passing = (key: string): PulseScanCheckInput => ({
    category: CATEGORIES.SECURITY, checkKey: key, label: key, status: "PASS", confidence: "HIGH",
  });

  it("is excluded from both sides of the score and lowers completeness", () => {
    const clean = computeScoreBreakdown([passing("a"), passing("b")]);
    const withUnknown = computeScoreBreakdown([
      passing("a"),
      passing("b"),
      probeInconclusive(CATEGORIES.SECURITY, "c", "c", "resolver unreachable"),
    ]);

    // The unverified control neither earns credit nor is punished as a failure…
    expect(withUnknown.finalScore).toBe(clean.finalScore);
    // …but Pulse now says it knows less than it did.
    expect(withUnknown.completeness).toBeLessThan(clean.completeness);
  });

  it("is materially different from silently passing the same control", () => {
    const invented = computeScoreBreakdown([passing("a"), passing("b"), passing("c")]);
    const honest = computeScoreBreakdown([
      passing("a"),
      passing("b"),
      probeInconclusive(CATEGORIES.SECURITY, "c", "c", "resolver unreachable"),
    ]);
    expect(invented.completeness).toBe(100);
    expect(honest.completeness).toBeLessThan(100);
  });
});
