import { describe, expect, it } from "vitest";
import { runWcagChecks } from "../wcag";
import type { ExtendedCheckContext } from "../_types";

function context(html: string): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 1, finalUrl: "https://example.test" },
    httpsUrl: "https://example.test", hostname: "example.test", platform: "WEB_APP",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: false, isMobileApp: false, hasBackend: false, authMethod: "unknown" },
    htmlLower: html.toLowerCase(), catchAll200: false,
  };
}

const find = (checks: { checkKey: string; status: string; detail?: string; label?: string }[], key: string) => checks.find((c) => c.checkKey === key)!;

describe("audit wcag-2: video_captions", () => {
  it("does not demand captions for muted, control-less hero videos (github.com / notion.so markup)", async () => {
    const html = '<video muted="" playsInline="" aria-describedby="visual-code-0-desc"></video>'
      + '<video class="lp-SectionHero-visual-media" muted="" playsInline="" aria-describedby="lp-SectionHero-visual-desc-0"></video>'
      + '<video loop="" muted="" class="HeroMedia" width="2560" height="1600" preload="none" playsInline=""><source src="https://videos.ctfassets.net/x/hero.mp4" media="(min-width: 840px)"/></video>';
    const check = find(await runWcagChecks(context(html)), "video_captions");
    expect(check.status).toBe("PASS");
    expect(check.detail).toMatch(/muted video/);
    expect(check.detail).not.toMatch(/No <video> elements detected/);
  });

  it("still warns on uncaptioned videos with audio or controls", async () => {
    const html = '<video controls src="/talk.mp4"></video><video muted controls src="/demo.mp4"></video><video autoplay src="/promo.mp4"></video>';
    const check = find(await runWcagChecks(context(html)), "video_captions");
    expect(check.status).toBe("WARN");
    expect(check.detail).toMatch(/^3 video\(s\) missing caption track/);
  });

  it("does not treat a class name containing 'muted' as the muted attribute", async () => {
    const check = find(await runWcagChecks(context('<video class="video muted" src="/talk.mp4"></video>')), "video_captions");
    expect(check.status).toBe("WARN");
  });

  it("passes captioned videos", async () => {
    const check = find(await runWcagChecks(context('<video controls src="/talk.mp4"><track kind="captions" src="/talk.vtt" srclang="en"></video>')), "video_captions");
    expect(check.status).toBe("PASS");
  });
});

describe("audit wcag-2: wcag22_consistent_help", () => {
  it("does not warn when a page simply has no help mechanism (SC 3.2.6 is conditional) - badssl.com style", async () => {
    const check = find(await runWcagChecks(context('<html lang="en"><body><h1>badssl.com</h1><a href="https://expired.badssl.com/">expired</a></body></html>')), "wcag22_consistent_help");
    expect(check.status).toBe("PASS");
    expect(check.detail).toMatch(/Not applicable/);
    expect(check.detail).not.toMatch(/3\.3\.6/);
    expect(check.label).toContain("3.2.6");
  });

  it("still recognises a present help mechanism", async () => {
    const check = find(await runWcagChecks(context('<footer><a href="/contact">Contact us</a><a href="https://support.anthropic.com">Support</a></footer>')), "wcag22_consistent_help");
    expect(check.status).toBe("PASS");
    expect(check.detail).toMatch(/help\/contact mechanism is present/);
  });
});
