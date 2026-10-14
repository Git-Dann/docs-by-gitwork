// @vitest-environment node
/**
 * Audit packet pulse-scan-8. Every positive case reproduces markup observed with curl on
 * 2026-10-14; every negative is a realistic page that must keep its current verdict.
 * The network is faked at the one SSRF-guarded transport, as in sensitive-path-content.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Route = (url: string) => Response | Error;
let route: Route = () => new Error("unset");

vi.mock("@/server/pulse-lite/url-guard", async (orig) => {
  const actual = await orig<typeof import("@/server/pulse-lite/url-guard")>();
  return {
    ...actual,
    fetchScannableUrl: vi.fn(async (url: string) => {
      const r = route(url);
      if (r instanceof Error) throw r;
      return r;
    }),
  };
});

import { linksLegalDocument, runUrlChecks } from "@/server/pulse-scan";

const res = (status: number, body: string | null, contentType = "text/html; charset=utf-8") => {
  const r = new Response(body, { status, headers: body === null ? {} : { "content-type": contentType } });
  Object.defineProperty(r, "url", { value: "https://acme.com/" });
  return r;
};

const page = (footer: string, head = "") =>
  `<!DOCTYPE html><html lang="en"><head><title>Acme - scheduling for teams</title>${head}</head><body>` +
  `<header><nav><a href="/pricing">Pricing</a></nav></header>` +
  `<main><h1>Scheduling infrastructure for everyone</h1><p>Acme lets your customers book time with you without the back-and-forth emails. Connect your calendar, set your availability and share one link.</p></main>` +
  `<footer>${footer}</footer></body></html>`;

function serveHomepage(html: string | null, status = 200) {
  route = (url) => {
    const { pathname, hostname } = new URL(url);
    if (hostname === "acme.com" && pathname === "/") return res(status, html);
    return res(404, "not found", "text/plain");
  };
}

async function scan(platform = "WEB_APP") {
  const out = await runUrlChecks("https://acme.com", platform);
  return { out, get: (key: string) => out.checks.find((c) => c.checkKey === key) };
}

beforeEach(() => {
  route = () => new Error("unset");
});

describe("status_page: a linked hosted status page is a status page", () => {
  it("vercel.com shape: footer links www.<brand>-status.com", async () => {
    serveHomepage(page(`<a href="https://www.acme-status.com">Status</a>`));
    const { get } = await scan();
    expect(get("status_page")?.status).toBe("PASS");
  }, 30_000);

  it("cal.com shape: footer links status.<brand>.com", async () => {
    serveHomepage(page(`<a href="https://status.acme.com/">Status</a>`));
    const { get } = await scan();
    expect(get("status_page")?.status).toBe("PASS");
  }, 30_000);

  it("still WARNs when only someone else's status page or a tweet /status/ URL is linked", async () => {
    serveHomepage(page(`<a href="https://www.githubstatus.com">GitHub status</a><a href="https://twitter.com/acme/status/1849000000">Launch tweet</a>`));
    const { get } = await scan();
    expect(get("status_page")?.status).toBe("WARN");
  }, 30_000);
});

describe("support_channel: an absolute link to the site's own help desk counts", () => {
  it("github.com shape: footer links https://support.<domain>", async () => {
    serveHomepage(page(`<a href="https://support.acme.com?tags=dotcom-footer">Support</a>`));
    const { get } = await scan();
    expect(get("support_channel")?.status).toBe("PASS");
  }, 30_000);

  it("still WARNs when the only help link belongs to another organisation", async () => {
    serveHomepage(page(`<a href="https://support.google.com/recaptcha">reCAPTCHA help</a>`));
    const { get } = await scan();
    expect(get("support_channel")?.status).toBe("WARN");
  }, 30_000);
});

describe("subresource_integrity: no cross-origin script, nothing to pin", () => {
  it("badssl.com shape: only same-origin scripts is NOT_APPLICABLE, not a CDN-compromise warning", async () => {
    serveHomepage(page("", `<script src="/js/app.js"></script><script src="https://acme.com/js/vendor.js"></script>`));
    const { get } = await scan();
    const sri = get("subresource_integrity");
    expect(sri?.status).toBe("NOT_APPLICABLE");
    expect(sri?.detail).not.toMatch(/compromised CDN/);
  }, 30_000);

  it("still WARNs for a third-party CDN script with no integrity attribute", async () => {
    serveHomepage(page("", `<script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"></script>`));
    const { get } = await scan();
    expect(get("subresource_integrity")?.status).toBe("WARN");
  }, 30_000);

  it("still PASSes when the CDN script is pinned", async () => {
    serveHomepage(page("", `<script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js" integrity="sha256-/JqT3SQfawRcv/BIHPThkBvs0OEvtFFmqPF/lYI/Cxo=" crossorigin="anonymous"></script>`));
    const { get } = await scan();
    expect(get("subresource_integrity")?.status).toBe("PASS");
  }, 30_000);
});

describe("status_200: a 2xx from an API endpoint is success", () => {
  it("countries.trevorblades.com/graphql shape: 204 to a bare GET is PASS for an API backend", async () => {
    serveHomepage(null, 204);
    const { get } = await scan("API_BACKEND");
    expect(get("status_200")?.status).toBe("PASS");
    expect(get("status_200")?.evidence).toBe("204");
  }, 30_000);

  it("a website homepage that serves 204 (no page) still WARNs", async () => {
    serveHomepage(null, 204);
    const { get } = await scan("WEB_APP");
    expect(get("status_200")?.status).toBe("WARN");
  }, 30_000);
});

describe("target_content_accessible: a security checkpoint is 'not let in', not a defect", () => {
  it("a Vercel checkpoint served with 200 is INCONCLUSIVE and stops the scan", async () => {
    serveHomepage(`<!doctype html><html><head><title>Vercel Security Checkpoint</title></head><body><p>We're verifying your browser</p><p>Enable JavaScript to continue</p></body></html>`);
    const { out, get } = await scan();
    expect(get("target_content_accessible")?.status).toBe("INCONCLUSIVE");
    expect(out.checks.map((c) => c.checkKey).sort()).toEqual(["ssl_valid", "target_content_accessible"]);
  }, 30_000);

  it("a 404 homepage is still a FAIL a visitor hits too", async () => {
    serveHomepage("<h1>Not found</h1>", 404);
    const { get } = await scan();
    expect(get("target_content_accessible")?.status).toBe("FAIL");
  }, 30_000);
});

describe("terms_of_service: link text that names the terms", () => {
  it("stripe.com footer: 'Privacy and terms' pointing at /gb/privacy", () => {
    const html = `<footer><a class="hds-link footer-links-block__item" href="/gb/privacy" data-analytics-label="global_footer__privacy_and_terms">Privacy and terms</a></footer>`;
    expect(linksLegalDocument(html, "terms", "stripe.com")).toBe(true);
  });

  it("allbirds.co.uk footer: an in-page control that opens the terms modal", () => {
    const html = `<footer><a\n          @click='openModal("terms-of-service")'\n          aria-controls='modal-terms-of-service'\n          role='button'\n          class='cursor-pointer hover:text-white hover:underline'\n        >\n          Terms of service\n        </a></footer><div id='modal-terms-of-service' role='dialog' aria-modal='true'><h2>Terms of service</h2></div>`;
    expect(linksLegalDocument(html, "terms", "www.allbirds.co.uk")).toBe(true);
  });

  it("does NOT credit a control whose target element does not exist, or a bare click handler", () => {
    // Same markup as allbirds minus the modal: aria-controls names nothing on the page.
    const noModal = `<footer><a aria-controls='modal-terms-of-service' role='button'>Terms of service</a></footer>`;
    expect(linksLegalDocument(noModal, "terms", "www.allbirds.co.uk")).toBe(false);
    expect(linksLegalDocument(`<footer><a onclick="alert('Coming soon')">Terms</a></footer>`, "terms", "acme.com")).toBe(false);
    expect(linksLegalDocument(`<footer><a @click="toast('TODO')">Terms of Service</a></footer>`, "terms", "acme.com")).toBe(false);
  });

  it("does NOT credit a placeholder link that goes nowhere", () => {
    expect(linksLegalDocument(`<footer><a href="#">Terms</a></footer>`, "terms", "acme.com")).toBe(false);
    expect(linksLegalDocument(`<footer><a>Terms of Service</a></footer>`, "terms", "acme.com")).toBe(false);
  });

  it("does NOT credit another organisation's terms, or prose that merely mentions terms", () => {
    expect(linksLegalDocument(`<p>This site is protected by reCAPTCHA. <a href="https://www.google.com/intl/en/policies/">Terms of Service</a> apply.</p>`, "terms", "acme.com")).toBe(false);
    expect(linksLegalDocument(`<a href="/glossary">Glossary of terms</a><a href="/search?q=x">Search terms</a>`, "terms", "acme.com")).toBe(false);
    expect(linksLegalDocument(`<a href="/gb/privacy">Privacy</a>`, "terms", "stripe.com")).toBe(false);
  });

  it("does NOT credit a terms link inside inert markup", () => {
    expect(linksLegalDocument(`<!-- <a href="/legal-stuff">Terms of Service</a> -->`, "terms", "acme.com")).toBe(false);
  });
});
