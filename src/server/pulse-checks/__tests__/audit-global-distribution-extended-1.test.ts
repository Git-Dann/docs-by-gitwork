import { describe, expect, it } from "vitest";
import { runGlobalDistributionExtended } from "../global-distribution-extended";
import type { ExtendedCheckContext } from "../_types";

function context(html: string, hostname: string): ExtendedCheckContext {
  return {
    pageResult: { ok: true, status: 200, headers: {}, html, responseTimeMs: 10, finalUrl: `https://${hostname}` },
    httpsUrl: `https://${hostname}`,
    hostname,
    platform: "SAAS",
    ctx: { isPaymentEnabled: false, isAuthEnabled: false, isSaas: true, isMobileApp: false, hasBackend: true, authMethod: "unknown" },
    htmlLower: html.toLowerCase(),
    catchAll200: false,
  } as ExtendedCheckContext;
}

function find(checks: { checkKey: string; status: string; detail?: string }[], key: string) {
  return checks.find((c) => c.checkKey === key);
}

describe("audit global-distribution-extended-1: French market detection", () => {
  it("does not treat an English site with French hreflang alternates as French (github.com)", async () => {
    const html = `<!DOCTYPE html><html lang="en" data-color-mode="auto"><head><link rel="alternate" hreflang="ko-kr" href="https://github.com?locale=ko-kr" /> <link rel="alternate" hreflang="fr-fr" href="https://github.com?locale=fr-fr" /></head><body><a href="/site/terms">Terms</a></body></html>`;
    const checks = await runGlobalDistributionExtended(context(html, "github.com"));
    expect(find(checks, "cnil_france_compliant")?.status).toBe("PASS");
    expect(find(checks, "cnil_france_compliant")?.detail).toMatch(/Not applicable/);
    expect(find(checks, "local_legal_notice")?.status).toBe("PASS");
    expect(find(checks, "local_legal_notice")?.detail).toBe("Not applicable.");
  });

  it("does not treat a German site with a French language-switcher link as French (münchen.de)", async () => {
    const html = `<html lang="de"><body><ul><li class="dropdown-menu__item"><a lang="en" class="dropdown-item" href="/en">English</a></li><li class="dropdown-menu__item"><a lang="fr" class="dropdown-item" href="/fr">Français</a></li></ul></body></html>`;
    const checks = await runGlobalDistributionExtended(context(html, "xn--mnchen-3ya.de"));
    expect(find(checks, "cnil_france_compliant")?.detail).toMatch(/Not applicable/);
    expect(find(checks, "local_legal_notice")?.detail).toBe("Not applicable.");
  });

  it("still flags a genuinely French-language site without CNIL / Mentions Légales", async () => {
    const html = `<!doctype html><html lang="fr-FR"><head><title>Boutique</title></head><body><footer><a href="/cgv">CGV</a></footer></body></html>`;
    const checks = await runGlobalDistributionExtended(context(html, "boutique-exemple.com"));
    expect(find(checks, "cnil_france_compliant")?.status).toBe("WARN");
    expect(find(checks, "local_legal_notice")?.status).toBe("WARN");
  });

  it("still treats a .fr host as French and passes when CNIL and Mentions Légales are present", async () => {
    const html = `<html lang="fr"><body><footer><a href="/mentions-legales">Mentions légales</a> Conformément aux recommandations de la CNIL</footer></body></html>`;
    const checks = await runGlobalDistributionExtended(context(html, "www.exemple.fr"));
    expect(find(checks, "cnil_france_compliant")?.status).toBe("PASS");
    expect(find(checks, "cnil_france_compliant")?.detail).toBe("CNIL compliance signals detected.");
    expect(find(checks, "local_legal_notice")?.detail).toBe("Mentions Légales page signals detected.");
  });
});

describe("audit global-distribution-extended-1: XHTML xml:lang", () => {
  it("treats <html xml:lang=\"fr\"> as a French site", async () => {
    const checks = await runGlobalDistributionExtended(context(`<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="fr"><body><a href="/cgv">CGV</a></body></html>`, "boutique-exemple.com"));
    expect(find(checks, "local_legal_notice")?.status).toBe("WARN");
  });
});
