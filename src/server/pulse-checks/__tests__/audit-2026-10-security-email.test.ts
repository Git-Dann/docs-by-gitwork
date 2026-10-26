import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import { runEmailDeliverabilityChecks, transactionalSubdomainCheck } from "../email-deliverability";
import type { ExtendedCheckContext } from "../_types";

// ─────────────────────────────────────────────────────────────────────────────
// 2026-10 audit, email half. Records below are the live values read on
// 2026-10-26 (`dig TXT google.com`, `dig TXT _dmarc.google.com`,
// `dig MX email.github.com`).
// ─────────────────────────────────────────────────────────────────────────────

function context(hostname = "acme.test"): ExtendedCheckContext {
  const html = "<html><body>hi</body></html>";
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: `https://${hostname}` },
    httpsUrl: `https://${hostname}`,
    hostname,
    platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html,
    catchAll200: false,
  };
}

function doh(map: Record<string, string[]>, failing: string[] = []) {
  return vi.fn(async (url: string | URL) => {
    const q = new URL(String(url)).searchParams;
    const key = `${q.get("name")}:${q.get("type")}`;
    if (failing.includes(key)) return new Response(JSON.stringify({ Status: 2, Answer: [] }), { headers: { "content-type": "application/dns-json" } });
    return new Response(JSON.stringify({ Status: 0, Answer: (map[key] ?? []).map((data) => ({ data })) }), { headers: { "content-type": "application/dns-json" } });
  });
}

const find = (checks: { checkKey: string }[], key: string) => checks.find((c) => c.checkKey === key) as { status: string; detail?: string } | undefined;

afterEach(() => vi.unstubAllGlobals());

describe("spf_hardfail — ~all under enforcing DMARC is the recommended setup", () => {
  it("PASSes google.com's real pairing: ~all with DMARC p=reject", async () => {
    vi.stubGlobal("fetch", doh({
      "google.com:TXT": ['"v=spf1 include:_spf.google.com ~all"'],
      "_dmarc.google.com:TXT": ['"v=DMARC1; p=reject; rua=mailto:mailauth-reports@google.com"'],
    }));
    const check = find(await runEmailDeliverabilityChecks(context("google.com")), "spf_hardfail");
    expect(check?.status).toBe("PASS");
    expect(check?.detail).toContain("~all");
  });

  it("still WARNs ~all when DMARC is p=none", async () => {
    vi.stubGlobal("fetch", doh({
      "acme.test:TXT": ['"v=spf1 include:_spf.google.com ~all"'],
      "_dmarc.acme.test:TXT": ['"v=DMARC1; p=none; rua=mailto:d@acme.test"'],
    }));
    expect(find(await runEmailDeliverabilityChecks(context()), "spf_hardfail")?.status).toBe("WARN");
  });

  it("still WARNs ~all when the enforcing policy covers only part of the mail (pct<100)", async () => {
    vi.stubGlobal("fetch", doh({
      "acme.test:TXT": ['"v=spf1 ~all"'],
      "_dmarc.acme.test:TXT": ['"v=DMARC1; p=reject; pct=20"'],
    }));
    expect(find(await runEmailDeliverabilityChecks(context()), "spf_hardfail")?.status).toBe("WARN");
  });

  it("still WARNs ?all / +all even under p=reject", async () => {
    vi.stubGlobal("fetch", doh({
      "acme.test:TXT": ['"v=spf1 +all"'],
      "_dmarc.acme.test:TXT": ['"v=DMARC1; p=reject"'],
    }));
    expect(find(await runEmailDeliverabilityChecks(context()), "spf_hardfail")?.status).toBe("WARN");
  });
});

describe("transactional_subdomain — absence over a fixed list of names is not evidence", () => {
  it("PASSes github.com's real email.github.com MX (a name the old list never queried)", async () => {
    vi.stubGlobal("fetch", doh({ "email.github.com:MX": ["10 mktomail.com."] }));
    expect(find(await runEmailDeliverabilityChecks(context("github.com")), "transactional_subdomain")?.status).toBe("PASS");
  });

  it("PASSes a bounce subdomain CNAME'd to an ESP (Postmark return-path)", async () => {
    vi.stubGlobal("fetch", doh({ "pm-bounces.acme.test:CNAME": ["pm.mtasv.net."] }));
    expect(find(await runEmailDeliverabilityChecks(context()), "transactional_subdomain")?.status).toBe("PASS");
  });

  it("does not PASS on a CNAME to something that is not an email provider", () => {
    const check = transactionalSubdomainCheck("acme.test", [
      { name: "email.acme.test", kind: "CNAME", lookup: { ok: true, records: ["acme.netlify.app."] } },
    ]);
    expect(check.status).toBe("INCONCLUSIVE");
  });

  it("is INCONCLUSIVE, not WARN, when none of the common names is found", async () => {
    vi.stubGlobal("fetch", doh({}));
    const check = find(await runEmailDeliverabilityChecks(context()), "transactional_subdomain");
    expect(check?.status).toBe("INCONCLUSIVE");
    expect(check?.detail).toContain("does not show there is none");
  });
});

describe("bimi_record_present — optional", () => {
  it("absence is NOT_APPLICABLE, presence still PASSes", async () => {
    vi.stubGlobal("fetch", doh({}));
    expect(find(await runEmailDeliverabilityChecks(context()), "bimi_record_present")?.status).toBe("NOT_APPLICABLE");
    vi.stubGlobal("fetch", doh({ "default._bimi.acme.test:TXT": ['"v=BIMI1; l=https://acme.test/logo.svg"'] }));
    expect(find(await runEmailDeliverabilityChecks(context()), "bimi_record_present")?.status).toBe("PASS");
  });

  it("a failed BIMI lookup is still INCONCLUSIVE", async () => {
    vi.stubGlobal("fetch", doh({}, ["default._bimi.acme.test:TXT"]));
    expect(find(await runEmailDeliverabilityChecks(context()), "bimi_record_present")?.status).toBe("INCONCLUSIVE");
  });
});
