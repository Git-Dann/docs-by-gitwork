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

async function check(html: string, key: string) {
  const found = (await runWcagChecks(context(html))).find((c) => c.checkKey === key);
  if (!found) throw new Error(`missing ${key}`);
  return found;
}

describe("audit wcag-1: aria_hidden_not_focusable", () => {
  it("ignores tabindex=-1 controls and display:none containers (docs.github.com)", async () => {
    const html = `<button type="button" class="IconButton_iconButton__Lyaf0 BreadcrumbsScroller_leftChevron__Bg3sS BreadcrumbsScroller_chevronHidden__fihME" data-variant="invisible" aria-label="Scroll breadcrumbs left" aria-hidden="true" tabindex="-1"><svg aria-hidden="true" focusable="false"></svg></button>
<li aria-hidden="true" style="display:none"><ul><li><a class="NavList__link" href="#">x</a></li></ul></li>
<div hidden aria-hidden="true"><a href="/x">x</a></div>
<div aria-hidden="true"><button disabled>Off</button></div>`;
    expect((await check(html, "aria_hidden_not_focusable")).status).toBe("PASS");
  });

  it("still fails a focusable control inside an aria-hidden container (github.com Toggle-menu)", async () => {
    const html = `<div class=" Toggle-menu--isHidden" aria-hidden="true"><div id="_R_agl_" data-testid="ActionMenu"><button class="Primer_Brand__Button-module__Button___scH9Z" aria-haspopup="true" aria-label="Select a GitHub feature"><span>Code</span></button></div></div>`;
    expect((await check(html, "aria_hidden_not_focusable")).status).toBe("FAIL");
    // a class named "hidden" is not the hidden attribute
    expect((await check(`<div class="hidden" aria-hidden="true"><a href="/pricing">Pricing</a></div>`, "aria_hidden_not_focusable")).status).toBe("FAIL");
    expect((await check(`<div aria-hidden="true"><span tabindex="0">x</span></div>`, "aria_hidden_not_focusable")).status).toBe("FAIL");
  });
});

describe("audit wcag-1: buttons_have_names", () => {
  it("does not require a name on a button that is itself aria-hidden (zalando)", async () => {
    const html = `<button class="IPH5OT r9BRio Md_Vex" type="button" aria-hidden="true" tabindex="-1"><svg></svg></button>`;
    expect((await check(html, "buttons_have_names")).status).toBe("PASS");
  });

  it("still fails a visible icon-only button (linear.app mobile menu)", async () => {
    const html = `<button type="button" aria-disabled="false" aria-haspopup="dialog" aria-expanded="false" class="TZTsQG_mobileMenuTrigger hCgVwa_reset-button"><svg width="16" height="16" viewBox="0 0 16 16"><rect x="1" y="7.5" width="14" height="1"></rect></svg></button>`;
    expect((await check(html, "buttons_have_names")).status).toBe("FAIL");
  });
});

describe("audit wcag-1: iframes_have_titles", () => {
  it("ignores the hidden GTM noscript iframe (wordpress.org/news)", async () => {
    const html = `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-P24PF4B" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;
    expect((await check(html, "iframes_have_titles")).status).toBe("PASS");
  });

  it("still warns on a visible untitled iframe (webflow modal)", async () => {
    const html = `<iframe data-modal-variant="treatment" style="display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%" frameborder="0"></iframe>`;
    expect((await check(html, "iframes_have_titles")).status).toBe("WARN");
  });
});

describe("audit wcag-1: images_have_alt", () => {
  it("ignores a visibility:hidden tracking pixel and accepts a bare alt (rakuten)", async () => {
    const html = `<img src="https://www.rakuten.co.jp/akam/13/pixel_5732e2c9?a=dD05YjVi" style="visibility: hidden; position: absolute; left: -999px; top: -999px;" />
<img src="/spacer.png" alt>
<img src="/deco.svg" role="presentation">`;
    expect((await check(html, "images_have_alt")).status).toBe("PASS");
  });

  it("still fails a visible logo with no alt (news.ycombinator.com)", async () => {
    const html = `<a href="https://news.ycombinator.com"><img src="y18.svg" width="18" height="18" style="border:1px white solid; display:block"></a>`;
    const result = await check(html, "images_have_alt");
    expect(result.status).toBe("FAIL");
    expect(result.detail).toContain("1 of 1");
  });
});

describe("audit wcag-1: skip_to_main_content", () => {
  it("detects the WordPress block-theme skip link", async () => {
    const html = `<a class="skip-link screen-reader-text" id="wp-skip-link" href="#wp--skip-link--target">Skip to content</a><div class="wp-site-blocks"></div><main id="wp--skip-link--target"></main>`;
    expect((await check(html, "skip_to_main_content")).status).toBe("PASS");
  });

  it("still warns when there is no in-page skip anchor", async () => {
    const html = `<a href="#top">Back to top</a><a href="https://www.csoonline.com/article/4234854/frontier-labs-are-skipping-security-basics.html">Frontier labs are skipping security basics</a>`;
    expect((await check(html, "skip_to_main_content")).status).toBe("WARN");
  });
});

describe("audit wcag-1: form_labels_present", () => {
  it("accepts aria-label as a programmatic label (cbc.ca search)", async () => {
    const html = `<input id="gn-compact-search" class="searchInput" name="query" placeholder="Search CBC.ca" type="search" role="searchbox" autoComplete="off" aria-label="Search CBC.ca" value=""/>`;
    expect((await check(html, "form_labels_present")).status).toBe("PASS");
    expect((await check(`<label for="email">Email</label><input type="email" id="email" name="email">`, "form_labels_present")).status).toBe("PASS");
  });

  it("warns on an unlabelled input even when unrelated labels exist (allbirds newsletter)", async () => {
    const html = `<label\n for='swatch-266887168132-featured-6722242117764'>Rugged Beige</label><label for='swatch-266887168132-featured-6891029135492'>Natural Black</label>
<input\n type="email"\n name="contact[email]"\n id="Email"\n class="h-full w-full rounded-full"\n placeholder="Email Address"\n required\n>`;
    expect((await check(html, "form_labels_present")).status).toBe("WARN");
    expect((await check(`<input id="kw" name="wd" class="s_ipt" value="" maxlength="255" autocomplete="off">`, "form_labels_present")).status).toBe("WARN");
  });
});

describe("audit wcag-1: link_purpose_clear", () => {
  it("does not claim 2.4.4 requires self-describing link text", async () => {
    const html = `<p>You can read our Cookie Policy <a href="https://www.anthropic.com/legal/cookies">here</a>.</p>`;
    const result = await check(html, "link_purpose_clear");
    expect(result.status).toBe("WARN");
    expect(result.detail).toContain("2.4.9");
    expect(result.detail).not.toContain("2.4.4 requires");
  });

  it("still passes descriptive links", async () => {
    const result = await check(`<a href="/pricing">See pricing plans</a>`, "link_purpose_clear");
    expect(result.status).toBe("PASS");
  });
});

describe("audit wcag-1: prefers_reduced_motion", () => {
  it("is inconclusive when CSS lives in linked stylesheets that were not read (MDN)", async () => {
    const html = `<head><link rel="stylesheet" href="/static/client/styles-global.b9d12c319ddb3888.css"></head><body><main>MDN</main></body>`;
    const result = await check(html, "prefers_reduced_motion");
    expect(result.status).toBe("INCONCLUSIVE");
    expect(result.detail).not.toMatch(/^No prefers-reduced-motion media query —/);
  });

  it("still warns for fully inline CSS without the query and passes when present", async () => {
    expect((await check(`<style>.hero{animation:spin 2s infinite}</style>`, "prefers_reduced_motion")).status).toBe("WARN");
    expect((await check(`<link rel="stylesheet" href="/a.css"><style>@media (prefers-reduced-motion: reduce){*{animation:none}}</style>`, "prefers_reduced_motion")).status).toBe("PASS");
  });
});

describe("audit wcag-1: text_spacing_supported", () => {
  it("does not flag default/zero spacing values or custom properties (cal.com, flipkart)", async () => {
    const html = `<div style="--framer-font-weight-italic:300;--framer-letter-spacing:0px;--framer-line-height:1.2em">Cal</div><style>.r-oxtfae{letter-spacing:0px;}.r-hsy270{line-height:1px;}</style>`;
    expect((await check(html, "text_spacing_supported")).status).toBe("PASS");
  });

  it("still warns on inline !important spacing that blocks user overrides", async () => {
    expect((await check(`<p style="color:#222; line-height: 1 !important">Body copy</p>`, "text_spacing_supported")).status).toBe("WARN");
  });
});

describe("audit wcag-1: reviewer counter-examples stay findings", () => {
  it("aria_hidden_not_focusable: disabled does nothing on <a>, and a custom property is not display:none", async () => {
    expect((await check(`<div aria-hidden="true"><a href="/x" disabled>x</a></div>`, "aria_hidden_not_focusable")).status).toBe("FAIL");
    expect((await check(`<div aria-hidden="true" style="--m-display:none"><a href="/x">x</a></div>`, "aria_hidden_not_focusable")).status).toBe("FAIL");
    expect((await check(`<div data-aria-hidden="true"><div aria-hidden="true" inert><a href="/x">x</a></div></div>`, "aria_hidden_not_focusable")).status).toBe("PASS");
  });

  it("buttons_have_names: data-aria-hidden does not exempt an unnamed button", async () => {
    expect((await check(`<button data-aria-hidden="true"><svg></svg></button>`, "buttons_have_names")).status).toBe("FAIL");
  });

  it("iframes_have_titles: data-style / data-aria-hidden / custom properties do not hide a frame", async () => {
    expect((await check(`<iframe src="/a" data-style="display:none"></iframe>`, "iframes_have_titles")).status).toBe("WARN");
    expect((await check(`<iframe src="/a" data-aria-hidden="true"></iframe>`, "iframes_have_titles")).status).toBe("WARN");
    expect((await check(`<iframe src="/a" style="--x-display:none"></iframe>`, "iframes_have_titles")).status).toBe("WARN");
  });

  it("images_have_alt: empty names, data- attributes and alt inside a value do not count", async () => {
    for (const html of [
      `<img src="/a.png" aria-label="">`,
      `<img src="/a.png" data-aria-label="x">`,
      `<img src="/a.png" data-role="none">`,
      `<img src="/a.png" style="--d-display:none">`,
      `<img src="/a.png" title="see alt text">`,
      `<img src="/a.png" data-alt="x">`,
    ]) expect((await check(html, "images_have_alt")).status, html).toBe("FAIL");
    expect((await check(`<img src="/a.png" alt=""><img src="/b.png" aria-label="Chart">`, "images_have_alt")).status).toBe("PASS");
  });

  it("form_labels_present: implicit labels pass; data-title and empty aria-label do not", async () => {
    expect((await check(`<label>Search <input type="search" id="s" name="s"></label>`, "form_labels_present")).status).toBe("PASS");
    expect((await check(`<input id="q" data-title="x">`, "form_labels_present")).status).toBe("WARN");
    expect((await check(`<input id="q" aria-label="">`, "form_labels_present")).status).toBe("WARN");
  });

  it("prefers_reduced_motion: an inline @import is external CSS too", async () => {
    expect((await check(`<style>@import url("/site.css");</style>`, "prefers_reduced_motion")).status).toBe("INCONCLUSIVE");
  });
});

describe("audit wcag-1: video_captions", () => {
  it("does not require captions on a muted, control-less hero loop (github.com)", async () => {
    const r = await check(`<video autoplay loop muted playsinline src="/hero.mp4"></video>`, "video_captions");
    expect(r.status).toBe("PASS");
    expect(r.detail).toContain("muted video");
  });

  it("still warns on a video with controls, or a muted video the page can unmute", async () => {
    expect((await check(`<video controls muted src="/talk.mp4"></video>`, "video_captions")).status).toBe("WARN");
    expect((await check(`<video autoplay muted src="/talk.mp4"></video><button aria-label="Unmute">🔈</button>`, "video_captions")).status).toBe("WARN");
    expect((await check(`<video aria-label="Intro, muted by default" src="/talk.mp4"></video>`, "video_captions")).status).toBe("WARN");
  });
});

describe("audit wcag-1 review: false negatives closed by the adversarial pass", () => {
  it("an unquoted aria-hidden=true container is still checked for focusable controls", async () => {
    expect((await check(`<div aria-hidden=true><a href="/x">x</a></div>`, "aria_hidden_not_focusable")).status).toBe("FAIL");
    // …and an unquoted aria-hidden button exempted from naming is reported as focusable instead.
    expect((await check(`<button aria-hidden=true><svg></svg></button>`, "aria_hidden_not_focusable")).status).toBe("FAIL");
    expect((await check(`<div aria-hidden=true><a href="/x" tabindex="-1">x</a></div>`, "aria_hidden_not_focusable")).status).toBe("PASS");
  });

  it("iframes_have_titles: data-title is not a title; a real title still passes", async () => {
    expect((await check(`<iframe src="/a" data-title="Map"></iframe>`, "iframes_have_titles")).status).toBe("WARN");
    expect((await check(`<iframe src="/a" title="  "></iframe>`, "iframes_have_titles")).status).toBe("WARN");
    expect((await check(`<iframe src="/a" title="Store map"></iframe>`, "iframes_have_titles")).status).toBe("PASS");
  });

  it("video_captions: a muted video in a script-built player, or with a non-button unmute hook, stays in scope", async () => {
    expect((await check(`<video class="video-js" muted autoplay src="/talk.mp4"></video>`, "video_captions")).status).toBe("WARN");
    expect((await check(`<video muted autoplay src="/talk.mp4"></video><div class="hero-unmute" onclick="u()"></div>`, "video_captions")).status).toBe("WARN");
    expect((await check(`<video muted autoplay loop src="/hero.mp4"></video><p>Beautiful sound design.</p>`, "video_captions")).status).toBe("PASS");
  });

  it("prefers_reduced_motion: a preload-swapped stylesheet is external CSS; an unrelated preload is not", async () => {
    expect((await check(`<link rel="preload" href="/s.css" as="style" onload="this.rel='stylesheet'">`, "prefers_reduced_motion")).status).toBe("INCONCLUSIVE");
    expect((await check(`<link rel="preload" href="/f.woff2" as="font"><style>a{}</style>`, "prefers_reduced_motion")).status).toBe("WARN");
  });
});
