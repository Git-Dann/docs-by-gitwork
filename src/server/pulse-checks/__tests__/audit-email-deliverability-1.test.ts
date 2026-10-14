import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import type { ExtendedCheckContext } from "../_types";
import { dmarcDiscoveryCandidates, runEmailDeliverabilityChecks } from "../email-deliverability";

// Records observed live over DoH on 2026-10-14.
const REAL = {
  squarespaceDmarc: "v=DMARC1; p=reject; aspf=r; fo=1; pct=100; rua=mailto:squarespace@rua.agari.com; ruf=mailto:squarespace@ruf.agari.com",
  vercelAppDmarc: "v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s;",
  gmailSpf: "v=spf1 redirect=_spf.google.com",
  exampleSpf: "v=spf1 -all",
  stripeSpf: "v=spf1 ip4:198.2.180.60/32 ip4:13.111.2.227/32 include:spf1.stripe.com include:greenhouse-outbound-mail.stripe.com include:_spf.qualtrics.com ~all",
  posthogMtaSts: "v=STSv1;id=1755284077088;",
} as const;

const quoted = (record: string) => `"${record}"`;

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

function dnsResponder(answers: Record<string, string[]>) {
  return vi.fn(async (url: string | URL) => {
    const value = String(url);
    if (!value.includes("cloudflare-dns.com")) return new Response("Not found", { status: 404 });
    const parsed = new URL(value);
    const key = `${parsed.searchParams.get("name") ?? ""}:${parsed.searchParams.get("type") ?? ""}`;
    return new Response(JSON.stringify({ Status: 0, Answer: (answers[key] ?? []).map((data) => ({ data })) }), {
      headers: { "content-type": "application/dns-json" },
    });
  });
}

const find = (checks: { checkKey: string; status: string; detail?: string; evidence?: string }[], key: string) =>
  checks.find((check) => check.checkKey === key);

afterEach(() => vi.unstubAllGlobals());

describe("DMARC discovery across non-PSL platform namespaces", () => {
  it("retries at squarespace.com, which is not on the Public Suffix List", () => {
    expect(dmarcDiscoveryCandidates("www.squarespace.com")).toEqual(["squarespace.com"]);
  });

  it("does NOT retry across a real PSL entry (vercel.app) and keeps ordinary ladders", () => {
    expect(dmarcDiscoveryCandidates("nextjs-boilerplate-five-plum-29.vercel.app")).toEqual([]);
    expect(dmarcDiscoveryCandidates("news.ycombinator.com")).toEqual(["ycombinator.com"]);
  });

  it("www.squarespace.com inherits squarespace.com's p=reject + rua instead of 'No DMARC record'", async () => {
    vi.stubGlobal("fetch", dnsResponder({ "_dmarc.squarespace.com:TXT": [quoted(REAL.squarespaceDmarc)] }));
    const checks = await runEmailDeliverabilityChecks(context("www.squarespace.com"));
    expect(find(checks, "dmarc_aggregate_reporting")?.status).toBe("PASS");
    expect(find(checks, "dmarc_quarantine_reject")?.status).toBe("PASS");
    expect(find(checks, "dmarc_full_coverage")?.status).toBe("PASS");
    expect(find(checks, "dmarc_aggregate_reporting")?.evidence).toContain("Inherited from _dmarc.squarespace.com");
  });

  it("a vercel.app deployment with no record of its own still WARNs (vercel.app is a real public suffix)", async () => {
    vi.stubGlobal("fetch", dnsResponder({ "_dmarc.vercel.app:TXT": [quoted(REAL.vercelAppDmarc)] }));
    const checks = await runEmailDeliverabilityChecks(context("nextjs-boilerplate-five-plum-29.vercel.app"));
    expect(find(checks, "dmarc_aggregate_reporting")?.status).toBe("WARN");
    expect(find(checks, "dmarc_quarantine_reject")?.status).toBe("WARN");
  });
});

describe("spf_hardfail tells the truth about what was published", () => {
  it("gmail.com's redirect= record is not reported as 'No SPF record found'", async () => {
    vi.stubGlobal("fetch", dnsResponder({ "gmail.com:TXT": [quoted("globalsign-smime-dv=CDYX+XFHUw2wml6"), quoted(REAL.gmailSpf)] }));
    const check = find(await runEmailDeliverabilityChecks(context("gmail.com")), "spf_hardfail");
    expect(check?.status).toBe("INCONCLUSIVE");
    expect(check?.detail).not.toMatch(/No SPF record/);
    expect(check?.detail).toContain("_spf.google.com");
  });

  it("a ?all record is a WARN that names the qualifier, not 'No SPF record'", async () => {
    vi.stubGlobal("fetch", dnsResponder({ "example.test:TXT": [quoted("v=spf1 include:_spf.google.com ?all")] }));
    const check = find(await runEmailDeliverabilityChecks(context("example.test")), "spf_hardfail");
    expect(check?.status).toBe("WARN");
    expect(check?.detail).toContain("?all");
    expect(check?.detail).not.toMatch(/No SPF record/);
  });

  it("does not read include:spf-all.* as a -all hardfail", async () => {
    vi.stubGlobal("fetch", dnsResponder({ "example.test:TXT": [quoted("v=spf1 include:spf-all.example.net ~all")] }));
    expect(find(await runEmailDeliverabilityChecks(context("example.test")), "spf_hardfail")?.status).toBe("WARN");
  });

  it("names the exact host when nothing is published there (www.target.com)", async () => {
    vi.stubGlobal("fetch", dnsResponder({ "target.com:TXT": [quoted("v=spf1 include:aspmx.pardot.com ~all")] }));
    const checks = await runEmailDeliverabilityChecks(context("www.target.com"));
    expect(find(checks, "spf_hardfail")?.status).toBe("WARN");
    expect(find(checks, "spf_hardfail")?.detail).toContain("www.target.com");
    expect(find(checks, "spf_single_record")?.status).toBe("WARN");
    expect(find(checks, "spf_single_record")?.detail).toContain("www.target.com");
  });

  it("still PASSes example.com -all, a multi-chunk -all record, and WARNs stripe's ~all", async () => {
    vi.stubGlobal("fetch", dnsResponder({ "example.com:TXT": [quoted(REAL.exampleSpf)] }));
    expect(find(await runEmailDeliverabilityChecks(context("example.com")), "spf_hardfail")?.status).toBe("PASS");

    vi.stubGlobal("fetch", dnsResponder({ "theguardian.com:TXT": ['"v=spf1 include:_spf.google.com ip4:76.223.176.0" "/20 ip4:54.240.64.0/18 -all"'] }));
    expect(find(await runEmailDeliverabilityChecks(context("theguardian.com")), "spf_hardfail")?.status).toBe("PASS");

    vi.stubGlobal("fetch", dnsResponder({ "stripe.com:TXT": [quoted(REAL.stripeSpf)] }));
    const checks = await runEmailDeliverabilityChecks(context("stripe.com"));
    expect(find(checks, "spf_hardfail")?.status).toBe("WARN");
    expect(find(checks, "spf_hardfail")?.detail).toContain("~all");
    expect(find(checks, "spf_single_record")?.status).toBe("PASS");
  });
});

describe("mta_sts_policy", () => {
  it("is NOT_APPLICABLE for a null-MX domain (example.com publishes '0 .')", async () => {
    vi.stubGlobal("fetch", dnsResponder({ "example.com:MX": ["0 ."], "example.com:TXT": [quoted(REAL.exampleSpf)] }));
    expect(find(await runEmailDeliverabilityChecks(context("example.com")), "mta_sts_policy")?.status).toBe("NOT_APPLICABLE");
  });

  it("still WARNs a mail-receiving domain without MTA-STS (linear.app) and a domain with no MX at all", async () => {
    vi.stubGlobal("fetch", dnsResponder({ "linear.app:MX": ["1 aspmx.l.google.com.", "5 alt1.aspmx.l.google.com."] }));
    expect(find(await runEmailDeliverabilityChecks(context("linear.app")), "mta_sts_policy")?.status).toBe("WARN");
    vi.stubGlobal("fetch", dnsResponder({}));
    expect(find(await runEmailDeliverabilityChecks(context("xn--mnchen-3ya.de")), "mta_sts_policy")?.status).toBe("WARN");
  });

  it("still PASSes posthog.com's v=STSv1 record without claiming the mode it did not read", async () => {
    vi.stubGlobal("fetch", dnsResponder({ "_mta-sts.posthog.com:TXT": [quoted(REAL.posthogMtaSts)], "posthog.com:MX": ["1 aspmx.l.google.com."] }));
    const check = find(await runEmailDeliverabilityChecks(context("posthog.com")), "mta_sts_policy");
    expect(check?.status).toBe("PASS");
    expect(check?.detail).toContain("mta-sts.posthog.com");
  });
});
