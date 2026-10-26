import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/pulse-lite/url-guard", () => ({
  fetchScannableUrl: (url: string, init?: RequestInit) => fetch(url, init),
}));

import { errorMonitoringTool, hostingPlatformOf, isFirstPartyHost, responseTimeVerdict } from "../web-basics";
import { codeSplittingEvidence, runPerformanceExtended } from "../performance-extended";
import { genericLinkTexts, hasUnmutedAutoplayVideo, pageTitleVerdict, runWcagChecks } from "../wcag";
import { isSelfCanonical } from "../seo-extended";
import { evaluateIosExtendedChecks } from "../ios-app-extended";
import type { ExtendedCheckContext } from "../_types";
import type { RepoSnapshot } from "../native-mobile";
import type { PulseScanCheckInput } from "@/types/pulse";

afterEach(() => vi.unstubAllGlobals());

function stub404() {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
}

function ctxFor(url: string, html: string): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: url },
    httpsUrl: url,
    hostname: new URL(url).hostname,
    platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  };
}

const at = (checks: PulseScanCheckInput[], key: string) => {
  const c = checks.find((x) => x.checkKey === key);
  if (!c) throw new Error(`no check emitted for ${key}`);
  return c;
};

describe("custom_domain — hostingPlatformOf", () => {
  it("recognises hosting namespaces the old seven-suffix list missed", () => {
    for (const h of ["myapp.herokuapp.com", "me.github.io", "proj.web.app", "proj.firebaseapp.com", "x.azurewebsites.net", "app.lovable.app", "x.replit.app", "x.bolt.host", "x.vercel.app"]) {
      expect(hostingPlatformOf(h), h).not.toBeNull();
    }
  });

  it("leaves real custom domains — and the vendor's own www host — alone", () => {
    expect(hostingPlatformOf("foundry.gitwork.co.uk")).toBeNull();
    expect(hostingPlatformOf("www.example.com")).toBeNull();
    expect(hostingPlatformOf("www.bolt.host")).toBeNull();
    expect(hostingPlatformOf("bolt.host")).toBeNull();
  });
});

describe("third_party_script_count — isFirstPartyHost", () => {
  it("treats the site's own cdn./static. subdomains as first party", () => {
    expect(isFirstPartyHost("cdn.example.com", "www.example.com")).toBe(true);
    expect(isFirstPartyHost("static.bbc.co.uk", "www.bbc.co.uk")).toBe(true);
  });

  it("still counts other organisations — and other apps on a shared platform — as third party", () => {
    expect(isFirstPartyHost("www.googletagmanager.com", "www.example.com")).toBe(false);
    expect(isFirstPartyHost("other.vercel.app", "myapp.vercel.app")).toBe(false);
    expect(isFirstPartyHost("example.com.evil.net", "example.com")).toBe(false);
  });
});

describe("response_time — responseTimeVerdict", () => {
  it("never FAILs on one slow sample", () => {
    expect(responseTimeVerdict([6200]).status).toBe("WARN");
  });

  it("FAILs only when two separate loads are both past the threshold", () => {
    expect(responseTimeVerdict([6200, 5800]).status).toBe("FAIL");
    expect(responseTimeVerdict([6200, 900]).status).toBe("WARN");
    expect(responseTimeVerdict([800]).status).toBe("PASS");
  });
});

describe("error_monitoring — errorMonitoringTool", () => {
  it("does not pass on the bare word in page text", () => {
    expect(errorMonitoringTool("<p>We moved our logs from Datadog and Sentry last year.</p>")).toBeNull();
    expect(errorMonitoringTool('<a href="/blog/how-we-use-sentry-and-datadog">sentry vs datadog</a>')).toBeNull();
  });

  it("passes on the SDK script or init call", () => {
    expect(errorMonitoringTool('<script src="https://browser.sentry-cdn.com/7.0.0/bundle.min.js"></script>')).toBe("Sentry");
    expect(errorMonitoringTool("<script>Sentry.init({ dsn: 'x' })</script>")).toBe("Sentry");
    expect(errorMonitoringTool('<script src="https://www.datadoghq-browser-agent.com/us1/v5/datadog-rum.js"></script>')).toBe("Datadog RUM");
  });
});

describe("image_dimension_attributes / image_width_height agree", () => {
  const imgs = (withDims: number, without: number) =>
    "<html><body>" +
    Array.from({ length: withDims }, (_, i) => `<img src="/a${i}.png" width="10" height="10">`).join("") +
    Array.from({ length: without }, (_, i) => `<img src="/b${i}.png">`).join("") +
    "</body></html>";

  it("85% coverage: both PASS (they used to split PASS/WARN at 80% vs 90%)", async () => {
    stub404();
    const checks = await runPerformanceExtended(ctxFor("https://example.com", imgs(17, 3)));
    expect(at(checks, "image_dimension_attributes").status).toBe("PASS");
    expect(at(checks, "image_width_height").status).toBe("PASS");
  });

  it("50% coverage: both WARN", async () => {
    stub404();
    const checks = await runPerformanceExtended(ctxFor("https://example.com", imgs(5, 5)));
    expect(at(checks, "image_dimension_attributes").status).toBe("WARN");
    expect(at(checks, "image_width_height").status).toBe("WARN");
  });
});

describe("no_unused_javascript — codeSplittingEvidence", () => {
  it("does not pass on the substring 'chunk' or 'import(' in page text", async () => {
    expect(codeSplittingEvidence("<p>Read this chunk of text; import(x) is a function.</p>")).toBeNull();
    stub404();
    const checks = await runPerformanceExtended(ctxFor("https://example.com", "<p>a chunk of text, import(x)</p>"));
    expect(at(checks, "no_unused_javascript").status).toBe("INCONCLUSIVE");
  });

  it("passes on split bundles the page actually loads", () => {
    expect(codeSplittingEvidence('<script src="/_next/static/chunks/main-abc.js"></script>')).not.toBeNull();
    expect(codeSplittingEvidence('<script src="/static/js/2.8f3a.chunk.js"></script>')).not.toBeNull();
    expect(codeSplittingEvidence('<link rel="modulepreload" href="/assets/vendor-1a2b.js">')).not.toBeNull();
  });
});

describe("wcag", () => {
  it("no_autoplay_video: `muted` before `autoplay` is muted", () => {
    expect(hasUnmutedAutoplayVideo('<video muted autoplay loop src="/hero.mp4"></video>')).toBe(false);
    expect(hasUnmutedAutoplayVideo('<video autoplay loop src="/hero.mp4"></video>')).toBe(true);
    // One muted video must not excuse a second, unmuted one.
    expect(hasUnmutedAutoplayVideo('<video autoplay muted></video><video autoplay></video>')).toBe(true);
  });

  it("link_purpose_clear: an aria-label gives a 'Read more' link its name", () => {
    expect(genericLinkTexts('<a href="/p" aria-label="Read more about pricing">Read more</a>')).toEqual([]);
    expect(genericLinkTexts('<a href="/p">Read more</a>')).toEqual(["Read more"]);
  });

  it("page_title_unique: never PASS from one page; WARN only on what the page proves", () => {
    expect(pageTitleVerdict("Pricing — Acme").status).toBe("INCONCLUSIVE");
    expect(pageTitleVerdict("React App").status).toBe("WARN");
    expect(pageTitleVerdict("").status).toBe("WARN");
  });

  it("wcag22_consistent_help: never PASS — help present is INCONCLUSIVE, none is NOT_APPLICABLE", async () => {
    stub404();
    const withHelp = await runWcagChecks(ctxFor("https://example.com", '<html lang="en"><a href="/help">Help</a></html>'));
    expect(at(withHelp, "wcag22_consistent_help").status).toBe("INCONCLUSIVE");
    const without = await runWcagChecks(ctxFor("https://example.com", '<html lang="en"><p>Hi</p></html>'));
    expect(at(without, "wcag22_consistent_help").status).toBe("NOT_APPLICABLE");
  });
});

describe("canonical_self_referencing — isSelfCanonical", () => {
  it("is self only when it names this page", () => {
    expect(isSelfCanonical("https://example.com/pricing/", "https://example.com/pricing")).toBe(true);
    expect(isSelfCanonical("/pricing", "https://example.com/pricing")).toBe(true);
    expect(isSelfCanonical("https://EXAMPLE.com/pricing#top", "https://example.com/pricing")).toBe(true);
  });

  it("a canonical to another page on the same host is not self-referencing", () => {
    expect(isSelfCanonical("https://example.com/", "https://example.com/pricing")).toBe(false);
    expect(isSelfCanonical("/", "https://example.com/pricing")).toBe(false);
  });
});

describe("ios_x_bitcode_deprecated", () => {
  const snap = (files: Record<string, string>, extra: string[] = []): RepoSnapshot => ({
    owner: "o",
    repo: "r",
    paths: [...Object.keys(files), ...extra],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  });
  const swift = { "App/AppDelegate.swift": "import UIKit\n" };

  it("is INCONCLUSIVE when no project.pbxproj was read", () => {
    expect(at(evaluateIosExtendedChecks(snap(swift)), "ios_x_bitcode_deprecated").status).toBe("INCONCLUSIVE");
  });

  it("PASSes on a read pbxproj without the setting and WARNs with it", () => {
    const ok = snap({ ...swift, "App.xcodeproj/project.pbxproj": "buildSettings = { SWIFT_VERSION = 5.0; };" });
    expect(at(evaluateIosExtendedChecks(ok), "ios_x_bitcode_deprecated").status).toBe("PASS");
    const bad = snap({ ...swift, "App.xcodeproj/project.pbxproj": "buildSettings = { ENABLE_BITCODE = YES; };" });
    expect(at(evaluateIosExtendedChecks(bad), "ios_x_bitcode_deprecated").status).toBe("WARN");
  });
});
