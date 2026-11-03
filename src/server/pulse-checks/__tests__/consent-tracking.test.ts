import { describe, expect, it } from "vitest";
import {
  ACCEPT_TEXT,
  classifyCookie,
  classifyRequest,
  CONSENT_TRACKING_KEYS,
  evaluateConsentTracking,
  REJECT_TEXT,
  type ConsentObservation,
} from "../consent-tracking";

const GA_HIT = "https://region1.google-analytics.com/g/collect?v=2&tid=G-ABC123&cid=1.2&en=page_view";
const GA_DENIED = "https://region1.google-analytics.com/g/collect?v=2&tid=G-ABC123&gcs=G100&en=page_view";
const GTAG_SCRIPT = "https://www.googletagmanager.com/gtag/js?id=G-ABC123";
const META_HIT = "https://www.facebook.com/tr/?id=123&ev=PageView";
const META_SCRIPT = "https://connect.facebook.net/en_US/fbevents.js";
const HOTJAR_SCRIPT = "https://static.hotjar.com/c/hotjar-123.js?sv=6";
const PLAUSIBLE = "https://plausible.io/api/event";

function obs(over: Partial<ConsentObservation> = {}): ConsentObservation {
  return {
    url: "https://example.co.uk/",
    renderedWords: 300,
    windowMs: 6000,
    before: { requests: ["https://example.co.uk/app.js"], cookies: [] },
    rejectControl: null,
    acceptControl: null,
    afterReject: null,
    stepErrors: {},
    ...over,
  };
}
const byKey = (rows: ReturnType<typeof evaluateConsentTracking>) => Object.fromEntries(rows.map((r) => [r.checkKey, r]));

describe("classifyRequest", () => {
  it("counts the beacon, not the script that would send it", () => {
    expect(classifyRequest(GA_HIT)?.vendor).toBe("Google Analytics");
    expect(classifyRequest(META_HIT)?.vendor).toBe("Meta Pixel");
    expect(classifyRequest(GTAG_SCRIPT)).toBeNull();
    expect(classifyRequest(META_SCRIPT)).toBeNull();
    expect(classifyRequest(HOTJAR_SCRIPT)).toBeNull();
  });
  it("does not call cookieless analytics a tracker", () => {
    expect(classifyRequest(PLAUSIBLE)).toBeNull();
    expect(classifyRequest("https://cdn.usefathom.com/script.js")).toBeNull();
  });
  it("matches hosts exactly, not by substring", () => {
    expect(classifyRequest("https://google-analytics.com.evil.example/g/collect")).toBeNull();
    expect(classifyRequest("https://notfacebook.com/tr/")).toBeNull();
  });
  it("counts Google ad beacons but not ad-serving set-up", () => {
    expect(classifyRequest("https://securepubads.g.doubleclick.net/pagead/purl_config?url=x")).toBeNull();
    expect(classifyRequest("https://securepubads.g.doubleclick.net/tag/js/gpt.js")).toBeNull();
    expect(classifyRequest("https://stats.g.doubleclick.net/g/collect?v=2")?.vendor).toBe("Google Ads");
    expect(classifyRequest("https://googleads.g.doubleclick.net/pagead/viewthroughconversion/123/?x=1")?.vendor).toBe("Google Ads");
    expect(classifyRequest("https://pagead2.googlesyndication.com/pagead/conversion/973097869/?gcs=G100")?.consentModeDenied).toBe(true);
  });

  it("only treats gcs=G100 as a Consent Mode cookieless ping", () => {
    expect(classifyRequest(GA_DENIED)?.consentModeDenied).toBe(true);
    expect(classifyRequest(GA_HIT.replace("en=", "gcs=G101&en="))?.consentModeDenied).toBe(false);
    expect(classifyRequest(GA_HIT.replace("en=", "gcs=G1--&en="))?.consentModeDenied).toBe(false);
  });
});

describe("classifyCookie", () => {
  it("recognises tracking cookie names and leaves the rest alone", () => {
    expect(classifyCookie({ name: "_ga", domain: ".example.co.uk" })).toBe("Google Analytics");
    expect(classifyCookie({ name: "_ga_ABC123", domain: ".example.co.uk" })).toBe("Google Analytics");
    expect(classifyCookie({ name: "_fbp", domain: ".example.co.uk" })).toBe("Meta Pixel");
    expect(classifyCookie({ name: "session", domain: "example.co.uk" })).toBeNull();
    expect(classifyCookie({ name: "CookieConsent", domain: "example.co.uk" })).toBeNull();
    expect(classifyCookie({ name: "__Host-next-auth.csrf-token", domain: "example.co.uk" })).toBeNull();
  });
});

describe("control wording", () => {
  it("finds first-layer reject buttons, and never mistakes accept for reject", () => {
    for (const t of ["Reject all", "Reject", "Decline", "Necessary cookies only", "Only essential cookies", "Reject additional cookies", "Alle ablehnen", "Tout refuser", "Continue without accepting"]) {
      expect(REJECT_TEXT.test(t), t).toBe(true);
    }
    for (const t of ["Accept all", "Accept", "Manage preferences", "Cookie settings", "Reject your application"]) {
      expect(REJECT_TEXT.test(t), t).toBe(false);
    }
    expect(ACCEPT_TEXT.test("Accept all cookies")).toBe(true);
    expect(ACCEPT_TEXT.test("Accept and close the newsletter")).toBe(false);
  });
});

describe("evaluateConsentTracking", () => {
  it("fails when an advertising tracker fires before any choice, whatever the market", () => {
    for (const markets of [["UK"], ["EU"], []]) {
      const r = byKey(evaluateConsentTracking(obs({ markets, before: { requests: [GTAG_SCRIPT, GA_HIT, META_HIT], cookies: [{ name: "_fbp", domain: ".x" }] } })));
      expect(r.consent_no_tracking_before_choice.status).toBe("FAIL");
      expect(r.consent_no_tracking_before_choice.detail).toContain("Meta Pixel received advertising data");
      expect(r.consent_no_tracking_cookies_before_choice.status).toBe("FAIL");
    }
  });

  it("analytics before a choice fails where the EU applies, and warns for a UK-only site (PECR Sch. A1 para 5)", () => {
    const before = { requests: [GA_HIT], cookies: [{ name: "_ga", domain: ".example.co.uk" }] };
    for (const markets of [["EU"], ["UK", "EU"], [], undefined]) {
      const r = byKey(evaluateConsentTracking(obs({ markets, before })));
      expect(r.consent_no_tracking_before_choice.status, String(markets)).toBe("FAIL");
      expect(r.consent_no_tracking_cookies_before_choice.status, String(markets)).toBe("FAIL");
    }
    const uk = byKey(evaluateConsentTracking(obs({ markets: ["UK"], before })));
    expect(uk.consent_no_tracking_before_choice.status).toBe("WARN");
    expect(uk.consent_no_tracking_before_choice.detail).toContain("simple way to object");
    expect(uk.consent_no_tracking_cookies_before_choice.status).toBe("WARN");
  });

  it("passes when only scripts load and the beacons wait", () => {
    const r = byKey(evaluateConsentTracking(obs({ before: { requests: [GTAG_SCRIPT, META_SCRIPT], cookies: [{ name: "session", domain: "example.co.uk" }] } })));
    expect(r.consent_no_tracking_before_choice.status).toBe("PASS");
    expect(r.consent_no_tracking_cookies_before_choice.status).toBe("PASS");
  });

  it("warns, not fails, on Consent Mode cookieless pings", () => {
    const r = byKey(evaluateConsentTracking(obs({ before: { requests: [GA_DENIED], cookies: [] } })));
    expect(r.consent_no_tracking_before_choice.status).toBe("WARN");
  });

  it("a vendor with a real hit is a tracker even if it also sent a denied ping", () => {
    const r = byKey(evaluateConsentTracking(obs({ before: { requests: [GA_DENIED, GA_HIT], cookies: [] } })));
    expect(r.consent_no_tracking_before_choice.status).toBe("FAIL");
  });

  it("fails when tracking cookies are set before any choice", () => {
    const r = byKey(evaluateConsentTracking(obs({ before: { requests: [], cookies: [{ name: "_ga", domain: ".example.co.uk" }, { name: "_gcl_au", domain: ".example.co.uk" }] } })));
    expect(r.consent_no_tracking_cookies_before_choice.status).toBe("FAIL");
    expect(r.consent_no_tracking_cookies_before_choice.detail).toContain("_ga");
  });

  it("fails reject when tracking continues after pressing Reject", () => {
    const r = byKey(evaluateConsentTracking(obs({
      rejectControl: { text: "Reject all", selector: "#r", inFrame: false },
      afterReject: { requests: [GA_HIT], cookies: [] },
    })));
    expect(r.consent_reject_honoured.status).toBe("FAIL");
  });

  it("analytics after Reject fails where the EU applies, warns for a UK-only site; advertising always fails", () => {
    const base = { rejectControl: { text: "Reject additional cookies", selector: "#r", inFrame: false } };
    const chartbeat = "https://ping.chartbeat.net/ping?h=bbc.co.uk&p=%2F";
    expect(byKey(evaluateConsentTracking(obs({ ...base, afterReject: { requests: [chartbeat], cookies: [] } }))).consent_reject_honoured.status).toBe("FAIL");
    expect(byKey(evaluateConsentTracking(obs({ ...base, markets: ["UK"], afterReject: { requests: [chartbeat], cookies: [] } }))).consent_reject_honoured.status).toBe("WARN");
    expect(byKey(evaluateConsentTracking(obs({ ...base, markets: ["UK"], afterReject: { requests: [META_HIT], cookies: [] } }))).consent_reject_honoured.status).toBe("FAIL");
  });

  it("does not blame Reject for a cookie that was already there before the choice", () => {
    const ga = { name: "_ga", domain: ".example.co.uk" };
    const r = byKey(evaluateConsentTracking(obs({
      before: { requests: [], cookies: [ga] },
      rejectControl: { text: "Reject all", selector: "#r", inFrame: false },
      afterReject: { requests: [], cookies: [ga] },
    })));
    expect(r.consent_reject_honoured.status).toBe("PASS");
    expect(r.consent_no_tracking_cookies_before_choice.status).toBe("FAIL");
  });

  it("passes reject when nothing tracks afterwards", () => {
    const r = byKey(evaluateConsentTracking(obs({
      rejectControl: { text: "Reject all", selector: "#r", inFrame: false },
      afterReject: { requests: [GTAG_SCRIPT], cookies: [{ name: "CookieConsent", domain: "example.co.uk" }] },
    })));
    expect(r.consent_reject_honoured.status).toBe("PASS");
  });

  it("cannot test reject without a Reject button, and says so rather than passing", () => {
    const withBanner = byKey(evaluateConsentTracking(obs({ acceptControl: { text: "Accept all", selector: "#a", inFrame: false } })));
    expect(withBanner.consent_reject_honoured.status).toBe("INCONCLUSIVE");
    const tracked = byKey(evaluateConsentTracking(obs({ before: { requests: [GA_HIT], cookies: [] } })));
    expect(tracked.consent_reject_honoured.status).toBe("INCONCLUSIVE");
  });

  it("no banner and no tracking: there is no rejection to test", () => {
    const r = byKey(evaluateConsentTracking(obs()));
    expect(r.consent_reject_honoured.status).toBe("NOT_APPLICABLE");
  });

  it("a press that never completed is inconclusive, not a pass", () => {
    const r = byKey(evaluateConsentTracking(obs({
      rejectControl: { text: "Reject all", selector: "#r", inFrame: false },
      afterReject: null,
      stepErrors: { reject: "navigation timeout" },
    })));
    expect(r.consent_reject_honoured.status).toBe("INCONCLUSIVE");
  });

  it("a bot check or block page is never judged as the site", () => {
    // johnlewis.com / argos.co.uk to a headless browser: ~20 words, two requests, no banner.
    for (const o of [obs({ renderedWords: 26, before: { requests: ["a", "b"], cookies: [] } }), obs({ blockedPage: true, renderedWords: 400 })]) {
      expect(evaluateConsentTracking(o).every((r) => r.status === "INCONCLUSIVE")).toBe(true);
    }
    // A short page that does show a banner is still measured.
    const banner = byKey(evaluateConsentTracking(obs({ renderedWords: 20, rejectControl: { text: "Reject all", selector: "#r", inFrame: false }, afterReject: { requests: [], cookies: [] } })));
    expect(banner.consent_reject_honoured.status).toBe("PASS");
  });

  it("nothing rendered or nothing observed is never a pass", () => {
    for (const o of [obs({ renderedWords: 0 }), obs({ before: null, stepErrors: { before: "boom" } })]) {
      const rows = evaluateConsentTracking(o);
      expect(rows.map((r) => r.checkKey).sort()).toEqual([...CONSENT_TRACKING_KEYS].sort());
      expect(rows.every((r) => r.status === "INCONCLUSIVE")).toBe(true);
    }
  });
});
