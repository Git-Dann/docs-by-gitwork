import { afterEach, describe, expect, it, vi } from "vitest";

// Mock at the transport boundary, not at `_types`, so the real `resolveDnsRecord`
// / `fetchWithTimeout` code paths under test actually execute.
vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import type { ExtendedCheckContext } from "../_types";
import {
  type ApplicableDmarc,
  dmarcPolicyChecks,
  governingDmarcPolicy,
  resolveApplicableDmarc,
  runEmailDeliverabilityChecks,
} from "../email-deliverability";
import { organizationalDomainCandidates } from "@/server/pulse-lite/registrable-domain";

// ─────────────────────────────────────────────────────────────────────────────
// The email family's three DMARC checks made ONE `_dmarc.<hostname>` query and
// stopped — the defect repaired for `dmarc_record` in pulse-scan.ts, surviving in
// this sibling file. RFC 7489 §6.6.3 REQUIRES a receiver that finds no record at
// the DNS domain to retry at the organizational domain, so every subdomain of
// every DMARC-protected organisation was told it had no impersonation
// protection, no report destination and no enforcement coverage.
//
// The interesting part is that implementing discovery correctly does NOT simply
// turn those findings into passes. For a subdomain that EXISTS the governing
// policy is the parent's `sp=`; `p=` applies only when no `sp=` is published;
// `np=` (RFC 9091) covers names that do NOT exist and is irrelevant to a host we
// just fetched a page from. gov.uk publishes `p=reject; sp=none`, so reading
// `p=reject` and passing www.gov.uk would be a FALSE NEGATIVE on an
// email-spoofing check. mozilla.org publishes `p=reject` with no `sp=`, so there
// the reject genuinely does cascade.
//
// Records verified live over DoH on 2026-08-22, quoted verbatim below.
// ─────────────────────────────────────────────────────────────────────────────

const REAL = {
  govuk: "v=DMARC1;p=reject;sp=none;np=reject;adkim=s;aspf=s;fo=1;rua=mailto:dmarc-rua@dmarc.service.gov.uk",
  hmrc: "v=DMARC1; p=reject; fo=1; rua=mailto:dmarc-rua@dmarc.service.gov.uk",
  mozilla: "v=DMARC1; p=reject; pct=100; adkim=r; aspf=r; rua=mailto:dmarc_agg@vali.email,mailto:dmarc@mozilla.com",
  yc: "v=DMARC1; p=none; pct=100; sp=none; ruf=mailto:dmarc-reports+f@ycombinator.com; rua=mailto:dmarc-reports@ycombinator.com; aspf=r;",
} as const;

const DNS = "cloudflare-dns.com";

function context(hostname: string): ExtendedCheckContext {
  const html = "<html><body>hello</body></html>";
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: `https://${hostname}` },
    httpsUrl: `https://${hostname}`,
    hostname,
    platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

/**
 * DoH answers keyed `name:TYPE`; every unlisted name answers NOERROR-empty (a
 * real answer meaning "nothing there"), and every non-DNS request 404s.
 *
 * TXT RDATA is returned QUOTED, exactly as Cloudflare returns it, because the
 * quote handling is part of what is under test — `parseDmarcTags` anchors on
 * `^` or `;`, so a leading `"` makes it find nothing.
 */
function dnsResponder(answers: Record<string, string[]>) {
  return vi.fn(async (url: string | URL) => {
    const value = String(url);
    if (!value.includes(DNS)) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
    const parsed = new URL(value);
    const key = `${parsed.searchParams.get("name") ?? ""}:${parsed.searchParams.get("type") ?? ""}`;
    return new Response(JSON.stringify({ Answer: (answers[key] ?? []).map((data) => ({ data })) }), {
      headers: { "content-type": "application/dns-json" },
    });
  });
}

const quoted = (record: string) => `"${record}"`;

const statusOf = (checks: { checkKey: string; status: string }[], key: string) =>
  checks.find((check) => check.checkKey === key)?.status;
const detailOf = (checks: { checkKey: string; detail?: string }[], key: string) =>
  checks.find((check) => check.checkKey === key)?.detail ?? "";

afterEach(() => vi.unstubAllGlobals());

// ── The end-to-end probe, on the exact hosts the audit measured ──────────────

describe("developer.mozilla.org — mozilla.org publishes p=reject with no sp=, so it cascades", () => {
  const answers = { [`_dmarc.mozilla.org:TXT`]: [quoted(REAL.mozilla)] };

  it("passes the policy, reporting and coverage checks from the inherited record", async () => {
    vi.stubGlobal("fetch", dnsResponder(answers));
    const checks = await runEmailDeliverabilityChecks(context("developer.mozilla.org"));
    expect(statusOf(checks, "dmarc_quarantine_reject")).toBe("PASS");
    expect(statusOf(checks, "dmarc_aggregate_reporting")).toBe("PASS");
    expect(statusOf(checks, "dmarc_full_coverage")).toBe("PASS");
  });

  it("says the record was inherited, never that it is published on the scanned host", async () => {
    vi.stubGlobal("fetch", dnsResponder(answers));
    const checks = await runEmailDeliverabilityChecks(context("developer.mozilla.org"));
    const detail = detailOf(checks, "dmarc_quarantine_reject");
    expect(detail).toContain("_dmarc.mozilla.org");
    expect(detail).toContain("_dmarc.developer.mozilla.org");
    expect(detail).not.toMatch(/No DMARC record was found/i);
  });
});

describe("www.hmrc.gov.uk — the department runs its own zone, so the ladder must not stop at gov.uk", () => {
  it("reads hmrc.gov.uk's p=reject rather than gov.uk's sp=none", async () => {
    vi.stubGlobal("fetch", dnsResponder({
      "_dmarc.hmrc.gov.uk:TXT": [quoted(REAL.hmrc)],
      "_dmarc.gov.uk:TXT": [quoted(REAL.govuk)],
    }));
    const checks = await runEmailDeliverabilityChecks(context("www.hmrc.gov.uk"));
    expect(statusOf(checks, "dmarc_quarantine_reject")).toBe("PASS");
    expect(detailOf(checks, "dmarc_quarantine_reject")).toContain("_dmarc.hmrc.gov.uk");
  });
});

describe("www.gov.uk — the organisation publishes p=reject, but sp=none", () => {
  const answers = { "_dmarc.gov.uk:TXT": [quoted(REAL.govuk)] };

  it("does NOT pass the policy check: sp=none governs an existing subdomain", async () => {
    vi.stubGlobal("fetch", dnsResponder(answers));
    const checks = await runEmailDeliverabilityChecks(context("www.gov.uk"));
    expect(statusOf(checks, "dmarc_quarantine_reject")).toBe("WARN");
  });

  it("stops claiming there is no DMARC record, and names sp=none as the reason", async () => {
    vi.stubGlobal("fetch", dnsResponder(answers));
    const checks = await runEmailDeliverabilityChecks(context("www.gov.uk"));
    const detail = detailOf(checks, "dmarc_quarantine_reject");
    expect(detail).toContain("sp=none");
    expect(detail).toContain("_dmarc.gov.uk");
    expect(detail).not.toMatch(/No DMARC record/i);
  });

  it("credits the inherited record's rua= and default pct", async () => {
    vi.stubGlobal("fetch", dnsResponder(answers));
    const checks = await runEmailDeliverabilityChecks(context("www.gov.uk"));
    expect(statusOf(checks, "dmarc_aggregate_reporting")).toBe("PASS");
    expect(statusOf(checks, "dmarc_full_coverage")).toBe("PASS");
    expect(detailOf(checks, "dmarc_aggregate_reporting")).toContain("inherited from _dmarc.gov.uk");
  });

  it("never consults np=, which RFC 9091 scopes to names that do not exist", async () => {
    // gov.uk publishes np=reject. www.gov.uk exists — Pulse just fetched a page
    // from it — so np is irrelevant and must not be read as protection.
    const verdict = dmarcPolicyChecks("www.gov.uk", resolveApplicableDmarc({
      hostname: "www.gov.uk",
      atHost: { ok: true, records: [] },
      parents: [{ domain: "gov.uk", lookup: { ok: true, records: [REAL.govuk] } }],
      unresolvedReason: null,
    }));
    expect(verdict.policy.status).toBe("WARN");
    expect(verdict.policy.detail).not.toContain("np=");
  });
});

describe("news.ycombinator.com — ycombinator.com is p=none, sp=none", () => {
  const answers = { "_dmarc.ycombinator.com:TXT": [quoted(REAL.yc)] };

  it("warns on the policy, because monitor-only is not protection", async () => {
    vi.stubGlobal("fetch", dnsResponder(answers));
    const checks = await runEmailDeliverabilityChecks(context("news.ycombinator.com"));
    expect(statusOf(checks, "dmarc_quarantine_reject")).toBe("WARN");
  });

  it("does NOT inherit SPF: RFC 7208 §3.1 makes SPF non-inheriting", async () => {
    // The audit lists this as a VERIFIED-CORRECT finding. ycombinator.com's SPF
    // record must never rescue news.ycombinator.com, or a true email-spoofing
    // finding becomes a false negative.
    vi.stubGlobal("fetch", dnsResponder({
      ...answers,
      "ycombinator.com:TXT": [quoted("v=spf1 include:_spf.google.com -all")],
    }));
    const checks = await runEmailDeliverabilityChecks(context("news.ycombinator.com"));
    expect(statusOf(checks, "spf_hardfail")).toBe("WARN");
    expect(statusOf(checks, "spf_single_record")).toBe("WARN");
  });
});

describe("an apex with no record anywhere is still a complete answer", () => {
  it("warns rather than going inconclusive, and names the search path", async () => {
    vi.stubGlobal("fetch", dnsResponder({}));
    const checks = await runEmailDeliverabilityChecks(context("mozilla.org"));
    expect(statusOf(checks, "dmarc_quarantine_reject")).toBe("WARN");
    expect(statusOf(checks, "dmarc_aggregate_reporting")).toBe("WARN");
    expect(statusOf(checks, "dmarc_full_coverage")).toBe("WARN");
    expect(detailOf(checks, "dmarc_quarantine_reject")).toContain("_dmarc.mozilla.org");
  });

  it("still passes its own record when it publishes one", async () => {
    vi.stubGlobal("fetch", dnsResponder({ "_dmarc.mozilla.org:TXT": [quoted(REAL.mozilla)] }));
    const checks = await runEmailDeliverabilityChecks(context("mozilla.org"));
    expect(statusOf(checks, "dmarc_quarantine_reject")).toBe("PASS");
  });
});

describe("a subdomain of a domain with no DMARC at all", () => {
  it("warns, having queried both names, and says so", async () => {
    vi.stubGlobal("fetch", dnsResponder({}));
    const checks = await runEmailDeliverabilityChecks(context("app.example.com"));
    expect(statusOf(checks, "dmarc_quarantine_reject")).toBe("WARN");
    const detail = detailOf(checks, "dmarc_quarantine_reject");
    expect(detail).toContain("_dmarc.app.example.com");
    expect(detail).toContain("_dmarc.example.com");
  });
});

// ── `p=quarantine` was matched as a substring, so `sp=quarantine` passed ──────

describe("the governing policy is a parsed tag, not a substring match", () => {
  it("does not pass a host whose own record is p=none with sp=quarantine", async () => {
    // `"v=DMARC1; p=none; sp=quarantine".includes("p=quarantine")` is TRUE,
    // because `sp=quarantine` contains it. The apex's own mail was unprotected
    // and reported as protected.
    vi.stubGlobal("fetch", dnsResponder({
      "_dmarc.mozilla.org:TXT": [quoted("v=DMARC1; p=none; sp=quarantine; rua=mailto:d@mozilla.org")],
    }));
    const checks = await runEmailDeliverabilityChecks(context("mozilla.org"));
    expect(statusOf(checks, "dmarc_quarantine_reject")).toBe("WARN");
    expect(detailOf(checks, "dmarc_quarantine_reject")).toContain("p=none");
  });

  it("still passes a real p=reject on the scanned host itself", async () => {
    vi.stubGlobal("fetch", dnsResponder({ "_dmarc.mozilla.org:TXT": [quoted(REAL.mozilla)] }));
    const checks = await runEmailDeliverabilityChecks(context("mozilla.org"));
    expect(statusOf(checks, "dmarc_quarantine_reject")).toBe("PASS");
  });

  it("reads a record whose own sp= is stricter as governing its subdomain", async () => {
    // The mirror image: p=none, sp=reject. The apex is unprotected (above) but
    // the SUBDOMAIN is covered, and sp= is what says so.
    vi.stubGlobal("fetch", dnsResponder({
      "_dmarc.mozilla.org:TXT": [quoted("v=DMARC1; p=none; sp=reject; rua=mailto:d@mozilla.org")],
    }));
    const checks = await runEmailDeliverabilityChecks(context("developer.mozilla.org"));
    expect(statusOf(checks, "dmarc_quarantine_reject")).toBe("PASS");
    expect(detailOf(checks, "dmarc_quarantine_reject")).toContain("sp=reject");
  });
});

// ── "Could not look" must never render as either answer ──────────────────────

describe("an incomplete discovery path is unknown, not absent and not fine", () => {
  const parentsFor = (hostname: string, byDomain: Record<string, { ok: true; records: string[] } | { ok: false; reason: string }>) =>
    organizationalDomainCandidates(hostname).map((domain) => ({
      domain,
      lookup: byDomain[domain] ?? ({ ok: true, records: [] } as const),
    }));

  it("is inconclusive when the host lookup failed", () => {
    const applicable = resolveApplicableDmarc({
      hostname: "www.gov.uk",
      atHost: { ok: false, reason: "DNS resolver returned HTTP 500" },
      parents: parentsFor("www.gov.uk", { "gov.uk": { ok: true, records: [REAL.govuk] } }),
      unresolvedReason: null,
    });
    expect(applicable.kind).toBe("unavailable");
    const built = dmarcPolicyChecks("www.gov.uk", applicable);
    expect([built.policy.status, built.reporting.status, built.coverage.status]).toEqual(["INCONCLUSIVE", "INCONCLUSIVE", "INCONCLUSIVE"]);
  });

  it("is inconclusive when the organizational-domain retry itself failed", () => {
    const applicable = resolveApplicableDmarc({
      hostname: "www.gov.uk",
      atHost: { ok: true, records: [] },
      parents: [{ domain: "gov.uk", lookup: { ok: false, reason: "ECONNRESET" } }],
      unresolvedReason: null,
    });
    expect(applicable.kind).toBe("unavailable");
    // The old code never made this query at all, so this whole state was
    // reported as "No DMARC record".
    expect(dmarcPolicyChecks("www.gov.uk", applicable).policy.status).toBe("INCONCLUSIVE");
  });

  it("is inconclusive for a multi-label host whose organizational domain is unknown", async () => {
    vi.stubGlobal("fetch", dnsResponder({}));
    const checks = await runEmailDeliverabilityChecks(context("www.example.invalidtld"));
    expect(statusOf(checks, "dmarc_quarantine_reject")).toBe("INCONCLUSIVE");
  });

  it("but a TWO-label host has no organizational domain above it, so absence is complete", async () => {
    // `example.test` is not a known suffix, so the registrable domain cannot be
    // established — yet its only ancestor is a TLD, which cannot hold the
    // organizational record. Discovery is finished, so this stays a WARN rather
    // than becoming a new false INCONCLUSIVE for every unknown-TLD host.
    vi.stubGlobal("fetch", dnsResponder({}));
    const checks = await runEmailDeliverabilityChecks(context("example.test"));
    expect(statusOf(checks, "dmarc_quarantine_reject")).toBe("WARN");
    expect(statusOf(checks, "dmarc_aggregate_reporting")).toBe("WARN");
    expect(statusOf(checks, "dmarc_full_coverage")).toBe("WARN");
  });

  it("and a three-label APEX is still a complete answer, not an unknown", async () => {
    // `example.co.uk` has three labels but IS its own registrable domain, so the
    // label-count guard above must not misread it as a subdomain of unknown
    // parentage and hedge a real finding into INCONCLUSIVE.
    vi.stubGlobal("fetch", dnsResponder({}));
    const checks = await runEmailDeliverabilityChecks(context("example.co.uk"));
    expect(statusOf(checks, "dmarc_quarantine_reject")).toBe("WARN");
  });

  it("and an IP literal has no organizational domain either", async () => {
    vi.stubGlobal("fetch", dnsResponder({}));
    const checks = await runEmailDeliverabilityChecks(context("203.0.113.10"));
    expect(statusOf(checks, "dmarc_quarantine_reject")).toBe("WARN");
  });
});

describe("governingDmarcPolicy", () => {
  const tags = (raw: string, p: string | null, sp: string | null, np: string | null = null) => ({ p, sp, np, raw });

  it("reads p= for the host's own record, ignoring its sp=", () => {
    const own: ApplicableDmarc = { kind: "own", queried: "_dmarc.a.test", tags: tags("v=DMARC1;p=none;sp=reject", "none", "reject") };
    expect(governingDmarcPolicy(own)).toBe("none");
  });

  it("reads sp= for an inherited record, falling back to p= when absent", () => {
    const withSp: ApplicableDmarc = { kind: "inherited", from: "gov.uk", queried: "_dmarc.www.gov.uk", tags: tags(REAL.govuk, "reject", "none", "reject") };
    const withoutSp: ApplicableDmarc = { kind: "inherited", from: "mozilla.org", queried: "_dmarc.developer.mozilla.org", tags: tags(REAL.mozilla, "reject", null) };
    expect(governingDmarcPolicy(withSp)).toBe("none");
    expect(governingDmarcPolicy(withoutSp)).toBe("reject");
  });

  it("answers null when nothing was established", () => {
    expect(governingDmarcPolicy({ kind: "absent", searched: ["_dmarc.a.test"] })).toBeNull();
    expect(governingDmarcPolicy({ kind: "unavailable", reason: "x" })).toBeNull();
  });
});
