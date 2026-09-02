import { describe, expect, it, vi } from "vitest";
import {
  clickjackingVerdict,
  isLegalHubHref,
  legalPageConfirms,
  linksLegalDocument,
  permissionsPolicyVerdict,
  resolveLegalDocumentChecks,
  stripInertMarkup,
  type LegalProbeResult,
} from "@/server/pulse-scan";

// ─────────────────────────────────────────────────────────────────────────────
// `privacy_policy` and `terms_of_service` are the only URL checks a release gate
// treats as non-negotiable (`release-decision.ts` blockingKeys) and that
// `priority.ts` ranks launch-blocking, so BOTH error directions are expensive:
// a false FAIL puts "your launch is blocked" on a document linked from the footer
// Pulse just parsed, and a false PASS silently unblocks the gate.
//
// ⚠️ THIS FILE USED TO BE STRUCTURALLY INCAPABLE OF CATCHING EITHER.
// It declared its own copies of the implementation's token arrays and matched
// against them, so it could only ever confirm that the tokens it was given match
// the tokens it was given. Both real-world misses below were invisible to it:
//
//   · `href="/help/terms-conditions"` — the standard UK form, on GOV.UK's own
//     footer. curl: `https://www.gov.uk/help/terms-conditions` → 200, H1 "Terms
//     and conditions". Pulse's headline P1 about GOV.UK was "no terms of service".
//   · `href="https://www.ycombinator.com/legal/"` — a bare hub holding both
//     documents (H1 "Legal", headings "Privacy Policy" and "Terms of Use").
//
// So: every fixture below is a real observed shape, and the assertions run the
// SHIPPED functions. If the implementation is re-tightened, these fail.
// ─────────────────────────────────────────────────────────────────────────────

describe("privacy links are found in every real shape observed", () => {
  const cases: [string, string][] = [
    ["bare relative", `<a href="/privacy">Privacy</a>`],
    ["locale-prefixed (the real stripe.com/gb case)", `<a href="/gb/privacy">Privacy</a>`],
    ["long locale under /legal", `<a href="/en-gb/legal/privacy-policy">Privacy</a>`],
    ["trailing slash", `<a href="/privacy/">Privacy</a>`],
    ["absolute URL", `<a href="https://example.com/privacy">Privacy</a>`],
    ["fragment", `<a href="/privacy#cookies">Privacy</a>`],
    ["query", `<a href="/privacy?lang=en">Privacy</a>`],
    ["single quotes", `<a href='/privacy'>Privacy</a>`],
    ["German", `<a href="/de/datenschutz">Datenschutz</a>`],
    ["French", `<a href="/fr/confidentialite">Confidentialité</a>`],
    ["nested under /legal", `<a href="/legal/privacy-notice">Privacy</a>`],
    // Observed shapes the old matcher missed:
    ["underscore separator", `<a href="/legal/privacy_policy">Privacy</a>`],
    ["no separator", `<a href="/privacypolicy">Privacy</a>`],
    ["bare relative with no leading slash (Hacker News footer style)", `<a href="privacy.html">Privacy</a>`],
    ["combined privacy-and-terms document", `<a href="/legal/privacy-and-terms">Legal</a>`],
    ["privacy notice", `<a href="/privacy-notice/">Privacy notice</a>`],
  ];
  for (const [name, html] of cases) {
    it(`finds it: ${name}`, () => expect(linksLegalDocument(html, "privacy")).toBe(true));
  }

  it("still reports a genuine absence", () => {
    expect(linksLegalDocument(`<a href="/about">About</a><a href="/contact">Contact</a>`, "privacy")).toBe(false);
  });

  it("does not match the word 'privacy' in ordinary body text", () => {
    expect(linksLegalDocument(`<p>We take your privacy seriously.</p>`, "privacy")).toBe(false);
  });

  it("does not match a path that merely starts with the token", () => {
    // The single-word form still requires a terminator, which is what keeps a
    // marketing article out of a legal-compliance verdict.
    expect(linksLegalDocument(`<a href="/blog/privacy-shield-explained">Read</a>`, "privacy")).toBe(false);
  });

  // ⚠️ Deliberate exclusions. Widening a launch-blocking legal check is only safe
  // where the token names the DOCUMENT. These name something adjacent to it.
  it("does not accept the CCPA opt-out control as a privacy policy", () => {
    expect(linksLegalDocument(`<a href="/privacy-choices">Your Privacy Choices</a>`, "privacy")).toBe(false);
  });

  it("does not accept a privacy centre as the policy itself", () => {
    // It usually links the policy rather than being it, so it is treated as a hub
    // — earning a content-verified fetch, not a free PASS.
    expect(linksLegalDocument(`<a href="/privacy-center">Privacy Center</a>`, "privacy")).toBe(false);
  });
});

describe("terms links are found in every real shape observed", () => {
  const cases: [string, string][] = [
    ["bare", `<a href="/terms">Terms</a>`],
    ["locale-prefixed", `<a href="/gb/terms-of-service">Terms</a>`],
    ["/tos", `<a href="/tos">Terms</a>`],
    ["under /legal", `<a href="/legal/terms-of-use">Terms</a>`],
    ["absolute with trailing slash", `<a href="https://example.com/terms/">Terms</a>`],
    // The GOV.UK case. Neither of the old matcher's alternatives could see it:
    // "terms" is followed by `-` (not a terminator) and "conditions" is preceded
    // by `-` (not a `/`).
    ["hyphenated, no 'and' (the real GOV.UK footer)", `<a href="/help/terms-conditions">Terms and conditions</a>`],
    ["hyphenated with 'and'", `<a href="/legal/terms-and-conditions">Terms</a>`],
    ["no separator at all", `<a href="/termsandconditions">Terms</a>`],
    ["locale + bare terms", `<a href="/en-gb/terms">Terms</a>`],
    ["terms of use, underscores", `<a href="/terms_of_use">Terms</a>`],
    ["German", `<a href="/de/agb">AGB</a>`],
  ];
  for (const [name, html] of cases) {
    it(`finds it: ${name}`, () => expect(linksLegalDocument(html, "terms")).toBe(true));
  }

  it("still reports a genuine absence", () => {
    // Verified: stripe.com/gb links a privacy policy but no terms page, so a FAIL
    // here is a true finding and must not be papered over by the looser matcher.
    expect(linksLegalDocument(`<a href="/gb/privacy">Privacy</a>`, "terms")).toBe(false);
  });

  it("does not match ordinary body prose", () => {
    expect(linksLegalDocument(`<p>In terms of value, we lead.</p>`, "terms")).toBe(false);
  });

  it("does not accept a French imprint as terms of service", () => {
    // `mentions-legales` is company identification, not a contract with the user.
    expect(linksLegalDocument(`<a href="/mentions-legales">Mentions légales</a>`, "terms")).toBe(false);
  });
});

describe("legal hub hrefs are recognised, and only as the last path segment", () => {
  for (const href of [
    "https://www.ycombinator.com/legal/",
    "/legal",
    "/legal/",
    "/policies",
    "/legal-notices/",
    "https://example.com/en/legal?x=1",
  ]) {
    it(`hub: ${href}`, () => expect(isLegalHubHref(href)).toBe(true));
  }

  for (const href of ["/legal/privacy", "/illegal", "/legally-binding", "/about", "/legalisation-services"]) {
    it(`not a hub: ${href}`, () => expect(isLegalHubHref(href)).toBe(false));
  }
});

describe("a fetched page only confirms a document from its title or a heading", () => {
  it("confirms from an <h1> (the GOV.UK terms page)", () => {
    expect(legalPageConfirms("terms", `<h1 class="gem-c-title">Terms and conditions</h1>`)).toBe(true);
  });

  it("confirms from a <title>", () => {
    expect(legalPageConfirms("privacy", `<title>Privacy Policy | Example</title>`)).toBe(true);
  });

  it("confirms both documents from a hub page's headings (the real Y Combinator /legal page)", () => {
    const hub = `<title>Legal | Y Combinator</title><h1>Legal</h1><h2>Privacy Policy</h2><h2>Terms of Use</h2>`;
    expect(legalPageConfirms("privacy", hub)).toBe(true);
    expect(legalPageConfirms("terms", hub)).toBe(true);
  });

  // ⚠️ The single most important negative in this file. Almost every homepage
  // footer contains the literal words "Privacy Policy" as link text, so a
  // body-wide match would let a catch-all host confirm its own shell.
  it("does NOT confirm from footer link text", () => {
    const homepage = `<title>Acme — the best widgets</title><h1>Widgets, reinvented</h1>
      <footer><a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a></footer>`;
    expect(legalPageConfirms("privacy", homepage)).toBe(false);
    expect(legalPageConfirms("terms", homepage)).toBe(false);
  });

  it("does NOT confirm from a marketing heading that merely mentions privacy", () => {
    expect(legalPageConfirms("privacy", `<h1>Your privacy matters to us</h1>`)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The verdict tree. `probe` is injected, so every branch is driven here without a
// network — including the two that decide whether a launch gate fires.
// ─────────────────────────────────────────────────────────────────────────────

const NOT_FOUND: LegalProbeResult = { status: 404, contentType: "text/html", body: "<h1>Not found</h1>" };
const page = (body: string): LegalProbeResult => ({ status: 200, contentType: "text/html", body });

function harness(pages: Record<string, LegalProbeResult>) {
  const probe = vi.fn(async (url: string) => pages[url] ?? NOT_FOUND);
  return { probe };
}

describe("a direct link passes without spending a fetch", () => {
  it("passes both, and never probes", async () => {
    const { probe } = harness({});
    const result = await resolveLegalDocumentChecks({
      html: `<footer><a href="/privacy">Privacy</a><a href="/help/terms-conditions">Terms</a></footer>`,
      baseUrl: "https://www.gov.uk",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.status).toBe("PASS");
    expect(result.terms.status).toBe("PASS");
    expect(probe).not.toHaveBeenCalled();
  });
});

describe("a legal hub is verified by content, never trusted on its href", () => {
  it("passes both when the hub page really holds both documents (news.ycombinator.com)", async () => {
    const { probe } = harness({
      "https://www.ycombinator.com/legal/": page(
        `<title>Legal | Y Combinator</title><h1>Legal</h1><h2>Privacy Policy</h2><h2>Terms of Use</h2>`,
      ),
    });
    const result = await resolveLegalDocumentChecks({
      html: `<a href="https://www.ycombinator.com/legal/">Legal</a><a href="security.html">Security</a>`,
      baseUrl: "https://news.ycombinator.com",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.status).toBe("PASS");
    expect(result.terms.status).toBe("PASS");
    expect(result.privacy.evidence).toContain("https://www.ycombinator.com/legal/");
    // One fetch, reused for the second document.
    expect(probe).toHaveBeenCalledTimes(1);
  });

  // ⚠️ THE FALSE-NEGATIVE GUARD. Widening the matcher so a bare `/legal/` link
  // counts as proof would PASS this site. It must FAIL.
  it("still FAILS when the hub page contains no such document", async () => {
    const { probe } = harness({
      "https://example.com/legal/": page(
        `<title>Legal | Example</title><h1>Legal</h1><h2>Trademark guidelines</h2><h2>Imprint</h2>`,
      ),
    });
    const result = await resolveLegalDocumentChecks({
      html: `<a href="/legal/">Legal</a>`,
      baseUrl: "https://example.com",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.status).toBe("FAIL");
    expect(result.terms.status).toBe("FAIL");
  });

  // ⚠️ A vendor's policy is not this site's policy.
  it("will not credit a hub on a different organisation", async () => {
    const { probe } = harness({
      "https://vendor.example/legal/": page(`<h1>Privacy Policy</h1><h1>Terms of Service</h1>`),
    });
    const result = await resolveLegalDocumentChecks({
      html: `<a href="https://vendor.example/legal/">Vendor legal</a>`,
      baseUrl: "https://acme.com",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.status).toBe("FAIL");
    // The point of this test is that the STRANGER'S page is never fetched. Asserting
    // "no fetch at all" was a broader claim than the behaviour being protected, and it
    // started failing once the conventional paths on our OWN origin began to be probed
    // (see "probes the conventional paths" below). Assert the actual intent.
    for (const [url] of probe.mock.calls) {
      expect(url).not.toContain("vendor.example");
      expect(url).toContain("acme.com");
    }
  });

  // ⚠️ RESIDUAL: a policy on its OWN SUBDOMAIN was missed and took a P1. The matcher
  // only ever looked in the PATH, so `https://privacy.example.com` returned false
  // while `https://legal.example.com/privacy` matched. `resolveLegalDocumentChecks`
  // supplies the scanned host, which is what makes the host-label match safe — see
  // `legal-links-real-footers.test.ts` for the guards on it.
  it("PASSES a policy hosted on its own same-organisation subdomain, with no fetch", async () => {
    const { probe } = harness({});
    const result = await resolveLegalDocumentChecks({
      html: `<footer><a href="https://privacy.example.com">Privacy</a><a href="https://terms.example.com">Terms</a></footer>`,
      baseUrl: "https://www.example.com",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.status).toBe("PASS");
    expect(result.terms.status).toBe("PASS");
    expect(probe).not.toHaveBeenCalled();
  });

  // …and a stranger's `privacy.` host is still not this site's policy, end to end.
  it("still FAILS when the only privacy host belongs to another organisation", async () => {
    const { probe } = harness({});
    const result = await resolveLegalDocumentChecks({
      html: `<footer><a href="https://privacy.vendor.example">Vendor privacy</a></footer>`,
      baseUrl: "https://acme.com",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.status).toBe("FAIL");
  });

  it("accepts a hub on a sibling subdomain of the same registrable domain", async () => {
    const { probe } = harness({
      "https://help.acme.co.uk/legal": page(`<h1>Privacy Policy</h1>`),
    });
    const result = await resolveLegalDocumentChecks({
      html: `<a href="https://help.acme.co.uk/legal">Legal</a>`,
      baseUrl: "https://app.acme.co.uk",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.status).toBe("PASS");
  });
});

describe("no link and nothing to check is still a FAIL", () => {
  // ⚠️ DELIBERATE POLICY CHANGE (2026-08-22). This used to assert that a readable page
  // with no legal link FAILS *without probing*. It was changed after sweeping ten live
  // homepages: stripe.com's served HTML links `/gb/privacy` and no terms page at all, so
  // `terms_of_service` came back FAIL — a P1 launch blocker, which hard-caps the score at
  // 65 — while `https://stripe.com/terms` returns HTTP 200. "Not linked from the homepage"
  // and "does not exist" are different facts and only the second should block a release.
  //
  // The probes are bounded (three paths per document, against the shared maxProbes
  // ceiling), content-verified, and reached only after the markup test has already
  // failed. Crucially the check is NOT weakened: with nothing served, the verdict is
  // still FAIL.
  //
  // ⚠️ The earlier wording here — "skipped entirely on a catch-all-200 host where a
  // 200 proves nothing" — was wrong, and being wrong about which requests a scan makes
  // is not cosmetic. They are skipped only when `catchAll200 && !unreadableShell`, i.e.
  // when the markup WAS readable and its absence of a link is already good evidence. On
  // a catch-all host whose markup is an unreadable shell there is no evidence in either
  // direction, so the probes must still run; they now stop at the first non-evidence
  // 200 rather than spending all six (see "stops after the first non-evidence 200").
  it("probes the conventional paths, and still FAILS when nothing serves one", async () => {
    const { probe } = harness({});
    const result = await resolveLegalDocumentChecks({
      html: `<html><body><h1>Acme</h1><a href="/about">About</a></body></html>`,
      baseUrl: "https://acme.com",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.status).toBe("FAIL");
    expect(result.terms.status).toBe("FAIL");
    // It looked, and it says so — the verdict now carries what was checked.
    expect(probe).toHaveBeenCalled();
    expect(result.terms.detail).toMatch(/fetched \d+ candidate page/i);
    // Bounded: three conventional paths per document, no more.
    const urls = probe.mock.calls.map(([u]: [string]) => u);
    expect(urls.filter((u: string) => u.includes("/terms")).length).toBeLessThanOrEqual(3);
    for (const u of urls) expect(u.startsWith("https://acme.com")).toBe(true);
  });

  it("a document published but linked from nowhere is WARN, not FAIL and not PASS", async () => {
    // The Stripe shape. The document exists, so FAIL would be false; a visitor cannot
    // reach it, so PASS would be false too.
    const { probe } = harness({
      "https://acme.com/terms": page(`<h1>Terms of Service</h1><p>...</p>`),
    });
    const result = await resolveLegalDocumentChecks({
      html: `<html><body><a href="/privacy">Privacy Policy</a></body></html>`,
      baseUrl: "https://acme.com",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.status).toBe("PASS");
    expect(result.terms.status).toBe("WARN");
    expect(result.terms.detail).toMatch(/nothing on the scanned page links to it/i);
    expect(result.terms.evidence).toContain("not linked from");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The SPA-shell case (audit item 19). gitwork.co.uk serves a 2,687-byte body that
// is only `<div id="root"></div>`; its rendered footer links `/privacy`, and the
// page really exists ("Gitwork Group Ltd (company number 15756347)"). Pulse
// reported privacy_policy as FAIL — its top P1 — while `canonical_url`,
// `h1_present` and `image_alt_coverage` in the SAME scan were correctly marked
// unassessable, because the SPA reclassifier stepped over these two keys on the
// false premise that they were "fetched rather than parsed".
// ─────────────────────────────────────────────────────────────────────────────

const SPA_SHELL = `<!doctype html><html><head><title>Gitwork</title></head><body><div id="root"></div><script src="/assets/index.js"></script></body></html>`;

describe("an unrendered SPA shell is resolved by evidence, not by assumption", () => {
  it("PASSES when the conventional path really serves the policy", async () => {
    const { probe } = harness({
      "https://gitwork.co.uk/privacy": page(
        `<title>Privacy Policy — Gitwork</title><h1>Privacy Policy</h1><p>Gitwork Group Ltd (company number 15756347)…</p>`,
      ),
    });
    const result = await resolveLegalDocumentChecks({
      html: SPA_SHELL,
      baseUrl: "https://gitwork.co.uk",
      catchAll200: false,
      unreadableShell: true,
      probe,
    });
    expect(result.privacy.status).toBe("PASS");
  });

  // ⚠️ THE OTHER FALSE-NEGATIVE GUARD. `terms_of_service` on gitwork.co.uk was
  // genuinely correct — no /terms route in the bundle, no "terms of service"
  // string in 616KB. A blanket adverse→INCONCLUSIVE rewrite for SPA shells (the
  // literal reading of audit item 19) would have lost this true positive. It has
  // to survive, and it has to survive for the right reason: the paths were
  // actually probed and answered.
  it("still FAILS a policy-less SPA whose conventional paths 404", async () => {
    const { probe } = harness({});
    const result = await resolveLegalDocumentChecks({
      html: SPA_SHELL,
      baseUrl: "https://gitwork.co.uk",
      catchAll200: false,
      unreadableShell: true,
      probe,
    });
    expect(result.terms.status).toBe("FAIL");
    expect(result.terms.detail).toContain("fetched");
    expect(probe).toHaveBeenCalledWith("https://gitwork.co.uk/terms");
  });

  it("reports INCONCLUSIVE, not FAIL and not PASS, on a catch-all host", async () => {
    // gitwork.co.uk really is one: both RFC security.txt paths return the SPA
    // shell with the homepage's etag. A 200 there proves nothing either way.
    const { probe } = harness({
      "https://gitwork.co.uk/privacy": page(SPA_SHELL),
      "https://gitwork.co.uk/terms": page(SPA_SHELL),
    });
    const result = await resolveLegalDocumentChecks({
      html: SPA_SHELL,
      baseUrl: "https://gitwork.co.uk",
      catchAll200: true,
      unreadableShell: true,
      probe,
    });
    expect(result.privacy.status).toBe("INCONCLUSIVE");
    expect(result.terms.status).toBe("INCONCLUSIVE");
    expect(result.privacy.detail).toContain("catch-all");
    // A weaker claim than a direct read, and marked as such.
    expect(result.privacy.confidence).toBe("MEDIUM");
  });

  it("reports INCONCLUSIVE when the policy route is itself client-rendered", async () => {
    const { probe } = harness({
      "https://spa.example/privacy": page(SPA_SHELL),
    });
    const result = await resolveLegalDocumentChecks({
      html: SPA_SHELL,
      baseUrl: "https://spa.example",
      catchAll200: false,
      unreadableShell: true,
      probe,
    });
    expect(result.privacy.status).toBe("INCONCLUSIVE");
    expect(result.privacy.detail).toContain("client-rendered");
  });

  it("reports INCONCLUSIVE when the probe cannot connect at all", async () => {
    const probe = vi.fn(async () => ({ status: 0, contentType: "", body: "" }));
    const result = await resolveLegalDocumentChecks({
      html: SPA_SHELL,
      baseUrl: "https://down.example",
      catchAll200: false,
      unreadableShell: true,
      probe,
    });
    expect(result.privacy.status).toBe("INCONCLUSIVE");
  });

  it("honours the fetch budget rather than probing without limit", async () => {
    const { probe } = harness({});
    await resolveLegalDocumentChecks({
      html: SPA_SHELL,
      baseUrl: "https://acme.com",
      catchAll200: false,
      unreadableShell: true,
      probe,
      maxProbes: 2,
    });
    expect(probe).toHaveBeenCalledTimes(2);
  });
});

describe("a rendered DOM is what these checks read", () => {
  // The check is handed `contentHtml`, so once the render agent adopts a DOM the
  // footer links are visible and the verdict needs no probing at all. This is the
  // gitwork.co.uk case on an internal scan.
  it("passes from the rendered footer with no fetch", async () => {
    const { probe } = harness({});
    const result = await resolveLegalDocumentChecks({
      html: `<div id="root"><main>…</main><footer><a href="/privacy">Privacy Policy</a></footer></div>`,
      baseUrl: "https://gitwork.co.uk",
      catchAll200: true,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.status).toBe("PASS");
    expect(result.terms.status).toBe("FAIL");
    expect(probe).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ONE FLAKY PROBE MUST NOT SILENCE AN ESTABLISHED FAIL.
//
// `resolveOne` held a single `unreadable` string, set by whichever candidate hit
// first, and it then outranked every conclusive answer collected afterwards. So a
// single timed-out request on a genuinely policy-less site converted a launch-gate
// FAIL into a silent INCONCLUSIVE — non-deterministically, run to run, on the same
// site. Reproduced: page links nothing, `/privacy` returns status 0 while
// `/privacy-policy` AND `/legal/privacy` both 404 ⇒ privacy INCONCLUSIVE, terms FAIL,
// off identical evidence.
//
// The two kinds of "unreadable" now rank differently, and the split is the point:
// a 200 we cannot read is evidence that SOMETHING is served there and outranks the
// absences; a transport failure is a fact about the network, not the site, and only
// speaks when nothing else answered.
// ─────────────────────────────────────────────────────────────────────────────

const UNREACHABLE: LegalProbeResult = { status: 0, contentType: "", body: "" };

describe("a transport failure does not outrank a conclusive answer", () => {
  const probeWithOneDeadPath = (dead: string) =>
    vi.fn(async (url: string) => (url === dead ? UNREACHABLE : NOT_FOUND));

  it("still FAILS when the FIRST candidate times out and the rest 404", async () => {
    const probe = probeWithOneDeadPath("https://acme.com/privacy");
    const result = await resolveLegalDocumentChecks({
      html: `<html><body><h1>Acme</h1></body></html>`,
      baseUrl: "https://acme.com",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.status).toBe("FAIL");
    // Same evidence, same verdict — the flake must not make the two documents differ.
    expect(result.terms.status).toBe("FAIL");
    // The candidate we could not reach is DISCLOSED, not erased.
    expect(result.privacy.detail).toContain("could not be reached");
    expect(result.privacy.evidence).toContain("https://acme.com/privacy could not be fetched");
  });

  it("still FAILS when the SECOND candidate times out", async () => {
    const probe = probeWithOneDeadPath("https://acme.com/privacy-policy");
    const result = await resolveLegalDocumentChecks({
      html: `<html><body><h1>Acme</h1></body></html>`,
      baseUrl: "https://acme.com",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.status).toBe("FAIL");
  });

  it("is INCONCLUSIVE only when NOTHING answered conclusively", async () => {
    const probe = vi.fn(async () => UNREACHABLE);
    const result = await resolveLegalDocumentChecks({
      html: `<html><body><h1>Acme</h1></body></html>`,
      baseUrl: "https://acme.com",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.status).toBe("INCONCLUSIVE");
    expect(result.terms.status).toBe("INCONCLUSIVE");
  });

  // ⚠️ RESIDUAL: THE DISCLOSURE WAS SINGULAR-ONLY. `transportFailure` was one string
  // set with `??=`, so with two or more unreachable candidates the FAIL said "One
  // further candidate could not be reached" and `evidence` named only the first.
  // Understating how much of the probe set went unanswered makes a FAIL look
  // better-evidenced than it is — the same dishonesty as overstating it, pointed the
  // other way.
  it("reports the real COUNT and lists every candidate it could not reach", async () => {
    const dead = ["https://acme.com/privacy-policy", "https://acme.com/legal/privacy"];
    const probe = vi.fn(async (url: string) => (dead.includes(url) ? UNREACHABLE : NOT_FOUND));
    const result = await resolveLegalDocumentChecks({
      html: `<html><body><h1>Acme</h1></body></html>`,
      baseUrl: "https://acme.com",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    // One conclusive 404 remains, so the verdict is still FAIL on real evidence.
    expect(result.privacy.status).toBe("FAIL");
    expect(result.privacy.detail).toContain("2 further candidates could not be reached");
    expect(result.privacy.detail).toContain("they are not part of this verdict");
    for (const url of dead) expect(result.privacy.evidence).toContain(url);
  });

  it("keeps the singular wording when exactly one candidate is unreachable", async () => {
    const probe = probeWithOneDeadPath("https://acme.com/privacy-policy");
    const result = await resolveLegalDocumentChecks({
      html: `<html><body><h1>Acme</h1></body></html>`,
      baseUrl: "https://acme.com",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.detail).toContain("1 further candidate could not be reached");
    expect(result.privacy.detail).toContain("it is not part of this verdict");
  });

  it("lists every failure when NOTHING answered and the verdict is INCONCLUSIVE", async () => {
    const probe = vi.fn(async () => UNREACHABLE);
    const result = await resolveLegalDocumentChecks({
      html: `<html><body><h1>Acme</h1></body></html>`,
      baseUrl: "https://acme.com",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.status).toBe("INCONCLUSIVE");
    for (const path of ["/privacy", "/privacy-policy", "/legal/privacy"]) {
      expect(result.privacy.evidence).toContain(`https://acme.com${path} could not be fetched`);
    }
  });

  // ⚠️ THE OTHER DIRECTION, and it must not regress into a false FAIL. A 200 that is
  // an app shell says the route exists; the other two conventional guesses 404ing does
  // not make the document absent.
  it("keeps INCONCLUSIVE when a candidate serves a 200 we cannot read", async () => {
    const probe = vi.fn(async (url: string) =>
      url === "https://spa.example/privacy" ? page(SPA_SHELL) : NOT_FOUND,
    );
    const result = await resolveLegalDocumentChecks({
      html: SPA_SHELL,
      baseUrl: "https://spa.example",
      catchAll200: false,
      unreadableShell: true,
      probe,
    });
    expect(result.privacy.status).toBe("INCONCLUSIVE");
    expect(result.privacy.detail).toContain("client-rendered");
    // …and the document that really has nothing is still a FAIL in the same scan.
    expect(result.terms.status).toBe("FAIL");
  });
});

describe("the probe budget covers the worst case exactly", () => {
  // The arithmetic, so a future change to either cap is visibly a budget change:
  // at most 2 hub candidates (deduped and shared across BOTH documents via `seen`)
  // plus 3 conventional paths per document = 8 distinct URLs. The default ceiling is
  // 8, so no candidate is ever silently dropped for want of budget — which would
  // read as "we checked and found nothing" when we had in fact stopped looking.
  it("fetches all 8 distinct candidates with the default ceiling", async () => {
    const { probe } = harness({});
    const result = await resolveLegalDocumentChecks({
      html: `<a href="/legal">Legal</a><a href="/policies">Policies</a>`,
      baseUrl: "https://acme.com",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    const urls = new Set(probe.mock.calls.map(([u]: [string]) => u));
    expect(urls.size).toBe(8);
    // Nothing was dropped, so the FAIL is a real "we looked everywhere" verdict.
    expect(result.privacy.status).toBe("FAIL");
    expect(result.terms.status).toBe("FAIL");
  });

  // A catch-all host answers 200 to everything, so after the first such answer no
  // further probe can change the verdict — the 200 branch refuses to read it and, by
  // definition, nothing can 404. Spending four more 60KB fetches to reach the same
  // INCONCLUSIVE is pure cost on the scan's critical path.
  it("stops after the first non-evidence 200 on a catch-all host", async () => {
    const probe = vi.fn(async () => page(SPA_SHELL));
    const result = await resolveLegalDocumentChecks({
      html: SPA_SHELL,
      baseUrl: "https://gitwork.co.uk",
      catchAll200: true,
      unreadableShell: true,
      probe,
    });
    expect(result.privacy.status).toBe("INCONCLUSIVE");
    expect(result.terms.status).toBe("INCONCLUSIVE");
    // One per document, not three.
    expect(probe).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Two header verdicts exported from the same module, both fixed in the same
// remediation pass. They live here rather than in
// `url-header-dns-false-positives.test.ts` only because of file ownership during a
// parallel pass — if these files are ever consolidated, this is the section to move.
// ─────────────────────────────────────────────────────────────────────────────

describe("frame-ancestors: a source list that permits every origin is not protection", () => {
  const csp = (value: string) => clickjackingVerdict({ "content-security-policy": value });

  // ⚠️ The guard used to test only the BARE `*` token, so these two PASSed while the
  // docblock five lines above claimed a wildcard could not satisfy the check. Both
  // permit every origin on their scheme, i.e. framing is not restricted at all, and
  // both sites send no X-Frame-Options — so each would otherwise take a correct WARN.
  it("WARNs on a scheme-wildcard host", () => {
    expect(csp("frame-ancestors https://*").status).toBe("WARN");
  });

  it("WARNs on bare scheme sources", () => {
    expect(csp("frame-ancestors http: https:").status).toBe("WARN");
  });

  it("WARNs on a wildcard host with an explicit port", () => {
    expect(csp("frame-ancestors https://*:443").status).toBe("WARN");
  });

  it("WARNs on the bare wildcard (the case that already worked)", () => {
    expect(csp("frame-ancestors *").status).toBe("WARN");
  });

  // A source list is a UNION, so ONE permissive source opens the whole list. This is
  // why the test is `.some()` and not `.every()`.
  it("WARNs when a permissive source sits beside a restrictive one", () => {
    const verdict = csp("frame-ancestors 'self' https://*");
    expect(verdict.status).toBe("WARN");
    expect(verdict.detail).toContain("https://*");
  });

  // …and the restrictive shapes must keep PASSing, including the wildcard SUBDOMAIN
  // form, which names a domain and is a real restriction.
  it("PASSes 'self', 'none', a named origin and a wildcard subdomain", () => {
    expect(csp("frame-ancestors 'self'").status).toBe("PASS");
    expect(csp("frame-ancestors 'none'").status).toBe("PASS");
    expect(csp("frame-ancestors 'self' https://cms.linear.app").status).toBe("PASS");
    expect(csp("frame-ancestors https://*.example.com").status).toBe("PASS");
  });

  it("still PASSes on X-Frame-Options alone, and still WARNs when neither is present", () => {
    expect(clickjackingVerdict({ "x-frame-options": "SAMEORIGIN" }).status).toBe("PASS");
    expect(clickjackingVerdict({}).status).toBe("WARN");
  });

  // ⚠️ AND THE FIX ABOVE OVER-CORRECTED. Treating ANY bare scheme source as
  // permit-all (`/^[a-z][a-z0-9+.-]*:$/`) made a policy that genuinely restricts WEB
  // framing, while additionally admitting an app or extension scheme, WARN with an
  // explanation that was untrue of it: "permits every origin". None of these lets an
  // attacker frame the page FROM A WEBSITE, which is the thing this check measures —
  // `blob:`/`data:`/`filesystem:` are derived contexts with no remote publisher, and
  // the extension/app schemes are locally-installed contexts.
  const APP_AND_DERIVED_SCHEMES = [
    "chrome-extension:",
    "blob:",
    "data:",
    "moz-extension:",
    "safari-web-extension:",
    "filesystem:",
    "file:",
    "capacitor:",
    "ionic:",
    "tauri:",
  ];
  for (const scheme of APP_AND_DERIVED_SCHEMES) {
    it(`PASSes a restrictive list that also admits ${scheme}`, () => {
      const verdict = csp(`frame-ancestors 'self' ${scheme}`);
      expect(verdict.status).toBe("PASS");
      // …and says the right thing, rather than the false "permits every origin".
      expect(verdict.detail).toContain("restricts framing");
    });
  }

  it("PASSes several app schemes at once, and beside a named origin", () => {
    expect(csp("frame-ancestors 'self' capacitor: ionic: chrome-extension:").status).toBe("PASS");
    expect(csp("frame-ancestors https://cms.example.com blob:").status).toBe("PASS");
  });

  // ⚠️ THE FALSE-NEGATIVE GUARD FOR THAT NARROWING: a scheme that CAN carry an
  // arbitrary remote page is still permit-all, bare or wildcarded.
  it("still WARNs on every scheme that can carry a remote page", () => {
    for (const source of ["http:", "https:", "ws:", "wss:", "ftp:"]) {
      expect(csp(`frame-ancestors 'self' ${source}`).status).toBe("WARN");
    }
    expect(csp("frame-ancestors 'self' http://*").status).toBe("WARN");
    expect(csp("frame-ancestors 'self' https://*:8443").status).toBe("WARN");
  });

  // The narrowing governs the `scheme://*` form for the same reason, so a wildcarded
  // app scheme is not "every origin" either.
  it("does not call a wildcarded app scheme every-origin", () => {
    expect(csp("frame-ancestors 'self' chrome-extension://*").status).toBe("PASS");
  });
});

describe("permissions-policy: granting everything to everyone is not scoping", () => {
  const header = (value: string) => permissionsPolicyVerdict({ "permissions-policy": value });

  // ⚠️ Any non-empty header used to PASS with the sentence "powerful browser features
  // are explicitly scoped", so this exact header — the three most sensitive
  // capabilities opened to every origin, which is LOOSER than the spec default of
  // `self` — was reported as scoped.
  it("WARNs when camera, microphone and geolocation are granted to every origin", () => {
    const verdict = header("camera=*, microphone=*, geolocation=*");
    expect(verdict.status).toBe("WARN");
    expect(verdict.detail).toContain("camera");
    expect(verdict.detail).toContain("EVERY origin");
  });

  it("WARNs on a mixed policy that opens one powerful feature", () => {
    expect(header("camera=(self), geolocation=*").status).toBe("WARN");
  });

  // ⚠️ AND MUST NOT FIRE ON CLIENT-HINT DELEGATION, which is what `=*` is normally
  // for. This is Google's own live header shape; a blanket "any `=*` is adverse" rule
  // would flag it, which is the false positive that makes a check get ignored.
  it("PASSes client-hint delegation with =*", () => {
    expect(header("ch-ua-arch=*, ch-ua-bitness=*, ch-ua-model=*, ch-ua-platform-version=*").status).toBe("PASS");
  });

  it("PASSes a genuinely scoped policy", () => {
    expect(header("camera=(), microphone=(), geolocation=()").status).toBe("PASS");
    expect(header('geolocation=(self "https://maps.example.com"), camera=()').status).toBe("PASS");
  });

  it("still reads the deprecated predecessor, and still WARNs on neither", () => {
    expect(permissionsPolicyVerdict({ "feature-policy": "camera 'none'" }).status).toBe("WARN");
    expect(permissionsPolicyVerdict({}).status).toBe("WARN");
  });

  // ⚠️ RESIDUAL: the parser split on `,` ONLY — the structured-fields spelling — so a
  // `;`-separated header and the legacy space-delimited Feature-Policy spelling both
  // fell straight through to PASS and were described as "powerful browser features are
  // explicitly scoped". The exposure risk is low (a browser rejects the malformed form
  // and falls back to the secure `self` default), but the SENTENCE was false: saying
  // "this is fine" about a header that was never parsed is the same failure as saying
  // "it isn't there" about a lookup that was never made.
  it("WARNs on the `;`-separated spelling", () => {
    const verdict = header("camera=*; microphone=*");
    expect(verdict.status).toBe("WARN");
    expect(verdict.detail).toContain("camera");
    expect(verdict.detail).toContain("microphone");
  });

  it("WARNs on the legacy space-delimited spelling", () => {
    const verdict = header("camera *; microphone *");
    expect(verdict.status).toBe("WARN");
    expect(verdict.detail).toContain("camera");
  });

  it("WARNs on a mixed-separator header", () => {
    expect(header("geolocation=(self); camera=*, microphone=()").status).toBe("WARN");
  });

  // ⚠️ AND THE OTHER DIRECTION FOR THE WIDENED PARSE. Google's live client-hint shape
  // must still PASS, and so must a genuinely scoped policy written either way —
  // handling `;` must not turn the legacy `'none'`/`'self'` spellings adverse.
  it("still PASSes Google's live client-hint header", () => {
    expect(header("ch-ua-arch=*, ch-ua-bitness=*, ch-ua-model=*, ch-ua-platform-version=*").status).toBe("PASS");
  });

  it("still PASSes a scoped policy in either spelling", () => {
    expect(header("camera 'none'; microphone 'none'; fullscreen 'self'").status).toBe("PASS");
    expect(header("camera=(); microphone=(self)").status).toBe("PASS");
    expect(header('geolocation=(self "https://maps.example.com"), camera=()').status).toBe("PASS");
  });

  // A header Pulse cannot read directives out of gets no scoping claim at all — the
  // PASS sentence promises a `feature=allowlist` pair was actually read. Two ways a
  // header fails to supply one, and each is a separate guard in the parser.
  it("makes no scoping claim about a header with no allowlist delimiter", () => {
    for (const junk of ["!!!", "garbage", "camera"]) {
      const verdict = header(junk);
      expect(verdict.detail).toContain("could not read any");
      expect(verdict.detail).not.toContain("explicitly scoped");
    }
  });

  it("makes no scoping claim about a header whose directive name is not a feature token", () => {
    for (const junk of ["???=(*)", '"camera"=(self)', "<<<>>>=*"]) {
      const verdict = header(junk);
      expect(verdict.detail).toContain("could not read any");
      expect(verdict.detail).not.toContain("explicitly scoped");
    }
  });

  // ⚠️ …and the parser must not become so strict that it rejects a real feature name.
  // These are all live, valid directive names.
  it("still reads the real feature names, hyphens and all", () => {
    for (const name of ["camera", "ch-ua-arch", "sync-xhr", "interest-cohort", "publickey-credentials-get", "xr-spatial-tracking"]) {
      expect(header(`${name}=(self)`).detail).toContain("explicitly scoped");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ A COMMENTED-OUT LINK CLEARED A LAUNCH-BLOCKING LEGAL GATE.
//
// `extractHrefs` was a naive regex over the WHOLE document, and the path matcher ran
// over the raw html, so an `href` that a browser never sees satisfied the check:
//
//   <!-- <a href="https://privacy.example.com">old link</a> -->   → privacy_policy PASS
//
// That is not a contrived input. Commenting the footer out is what a site looks like
// halfway through a redesign, and `privacy_policy`/`terms_of_service` are release-gate
// blockingKeys that hard-cap the score at 65 — so the one moment a site genuinely has
// no reachable policy was the moment Pulse reported it had one. Same class as §34.3's
// "comments were matched as code", and the same trap applies to the fix: an `href`
// legitimately contains `//`, and a comment-looking sequence can appear INSIDE an
// attribute value, so the strip has to be quote-aware or it eats real links.
// ─────────────────────────────────────────────────────────────────────────────

describe("inert markup is not evidence", () => {
  // The verbatim reproducing input from the confirmation pass.
  it("does not credit an href inside an HTML comment (the reproducer)", () => {
    const html = `<!-- <a href="https://privacy.example.com">old link</a> -->`;
    expect(linksLegalDocument(html, "privacy", "example.com")).toBe(false);
  });

  it("does not credit a commented-out PATH link, either kind", () => {
    expect(linksLegalDocument(`<!-- <a href="/privacy-policy">P</a> -->`, "privacy")).toBe(false);
    expect(linksLegalDocument(`<!-- <a href="/help/terms-conditions">T</a> -->`, "terms")).toBe(false);
    expect(linksLegalDocument(`<!--<a href="/privacy">P</a>-->`, "privacy")).toBe(false);
  });

  // An unterminated comment runs to the end of the document in every browser, so
  // nothing after it is on the page either.
  it("treats an unterminated comment as running to the end of the document", () => {
    expect(linksLegalDocument(`<p>x</p><!-- <a href="/privacy">P</a>`, "privacy")).toBe(false);
  });

  it("does not credit an href inside a <script> block", () => {
    expect(
      linksLegalDocument(`<script>var s = "<a href='/privacy-policy'>x</a>";</script>`, "privacy"),
    ).toBe(false);
    expect(
      linksLegalDocument(`<script type="application/json">{"a":"<a href='/terms-of-service'>x</a>"}</script>`, "terms"),
    ).toBe(false);
    // The host form goes through `extractHrefs`, which was the other half of the bug.
    expect(
      linksLegalDocument(`<script>var s = '<a href="https://privacy.example.com">x</a>';</script>`, "privacy", "example.com"),
    ).toBe(false);
  });

  it("does not credit an href inside <template>, <noscript> or <textarea>", () => {
    expect(linksLegalDocument(`<template><a href="/privacy-policy">P</a></template>`, "privacy")).toBe(false);
    expect(linksLegalDocument(`<noscript><a href="/terms-of-service">T</a></noscript>`, "terms")).toBe(false);
    expect(linksLegalDocument(`<textarea><a href="/privacy-policy">P</a></textarea>`, "privacy")).toBe(false);
  });

  // ── THE OTHER DIRECTION. A real footer must still match, on a page that also
  //    carries comments, scripts and a noscript block — i.e. every real page. ────
  it("still finds a real footer link on a page full of inert markup", () => {
    const html = `<!doctype html>
      <!-- TODO: restore the old privacy link -->
      <script>window.__DATA__ = {legal: "/privacy-notice"};</script>
      <noscript><p>Enable JavaScript</p></noscript>
      <footer><a href="/privacy-policy">Privacy</a> · <a href="/help/terms-conditions">Terms</a></footer>`;
    expect(linksLegalDocument(html, "privacy")).toBe(true);
    expect(linksLegalDocument(html, "terms")).toBe(true);
  });

  it("still finds a same-organisation policy subdomain beside a comment", () => {
    const html = `<!-- old --><footer><a href="https://privacy.example.com">Privacy</a></footer>`;
    expect(linksLegalDocument(html, "privacy", "example.com")).toBe(true);
  });

  // ⚠️ THE TRAP THE STRIP MUST NOT FALL INTO. A naive `/<!--[\s\S]*?-->/` starts its
  // match at the `<!--` sitting INSIDE an attribute value and runs to the next real
  // `-->`, swallowing the live privacy link in between. A browser never reads a `<`
  // inside a quoted attribute as markup, and neither may we.
  it("does not lose a link because an attribute value contains a comment opener", () => {
    const html =
      `<a data-tpl="<!--" href="/privacy-policy">Privacy</a><!-- gone --><a href="//example.com/terms-of-service">Terms</a>`;
    expect(linksLegalDocument(html, "privacy")).toBe(true);
    expect(linksLegalDocument(html, "terms")).toBe(true);
  });

  it("does not treat a bare `<` in text as a tag, and keeps reading past it", () => {
    const html = `<p>1 < 2</p><a href="/privacy-policy">P</a>`;
    expect(linksLegalDocument(html, "privacy")).toBe(true);
  });

  it("keeps an href whose value legitimately contains `//`", () => {
    expect(linksLegalDocument(`<a href="//cdn.example.com/legal/privacy-policy">P</a>`, "privacy")).toBe(true);
    expect(linksLegalDocument(`<a href="https://example.com/terms-of-service">T</a>`, "terms")).toBe(true);
  });

  it("strips the inert regions without corrupting the surrounding markup", () => {
    expect(stripInertMarkup(`<a data-x="<!--" href="/privacy">P</a>`)).toContain(`href="/privacy"`);
    expect(stripInertMarkup(`<!-- x --><a href="/privacy">P</a>`)).toContain(`href="/privacy"`);
    expect(stripInertMarkup(`<!-- <a href="/privacy">P</a> -->`)).not.toContain("href");
    expect(stripInertMarkup(`<script>"/privacy"</script>`)).not.toContain("/privacy");
  });

  // The CONFIRM path reads a fetched page's headings, and it had the same hole: a
  // commented-out or templated heading would confirm a document that is not published.
  it("does not confirm a fetched page from a commented-out or scripted heading", () => {
    expect(legalPageConfirms("privacy", `<!-- <h1>Privacy Policy</h1> -->`)).toBe(false);
    expect(legalPageConfirms("privacy", `<script>var t = "<h1>Privacy Policy</h1>";</script>`)).toBe(false);
    expect(legalPageConfirms("terms", `<template><h1>Terms of Service</h1></template>`)).toBe(false);
    // …and a real heading still confirms.
    expect(legalPageConfirms("privacy", `<h1>Privacy Policy</h1>`)).toBe(true);
    expect(legalPageConfirms("terms", `<!-- draft --><title>Terms of Service — Acme</title>`)).toBe(true);
  });

  it("does not spend a fetch on a commented-out legal hub, and still FAILS", async () => {
    const { probe } = harness({});
    const result = await resolveLegalDocumentChecks({
      html: `<!-- <a href="/legal/">Legal</a> -->`,
      baseUrl: "https://acme.com",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.status).toBe("FAIL");
    expect(result.terms.status).toBe("FAIL");
    const urls = probe.mock.calls.map(([u]: [string]) => u);
    expect(urls).not.toContain("https://acme.com/legal/");
  });

  it("a page whose ONLY legal link is commented out is a FAIL, not a PASS", async () => {
    const { probe } = harness({});
    const result = await resolveLegalDocumentChecks({
      html: `<footer><!-- <a href="/privacy-policy">Privacy</a> --></footer>`,
      baseUrl: "https://acme.com",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.status).toBe("FAIL");
  });

  // …and a live hub is still fetched and still passes on its content.
  it("still fetches and confirms a real legal hub", async () => {
    const { probe } = harness({
      "https://acme.com/legal/": page(`<h1>Legal</h1><h2>Privacy Policy</h2><h2>Terms of Use</h2>`),
    });
    const result = await resolveLegalDocumentChecks({
      html: `<!-- old markup --><footer><a href="/legal/">Legal</a></footer>`,
      baseUrl: "https://acme.com",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.status).toBe("PASS");
    expect(result.terms.status).toBe("PASS");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ THE INCONCLUSIVE BRANCH DISCLOSED ONE KIND OF UNREADABLE WHEN BOTH OCCURRED.
//
// It read `servedButUnreadable ?? (…transportFailures…)`, so a shell served at
// `/privacy` PLUS two candidates that could not be reached at all reported only the
// shell. Understating how much of the probe set went unanswered makes an INCONCLUSIVE
// look better-evidenced than it is — the same dishonesty the FAIL branch was already
// fixed for, pointed at the other verdict.
// ─────────────────────────────────────────────────────────────────────────────

describe("an INCONCLUSIVE discloses every reason it could not establish the answer", () => {
  const DEAD = ["https://spa.example/privacy-policy", "https://spa.example/legal/privacy"];

  it("reports the shell AND both unreachable candidates", async () => {
    const probe = vi.fn(async (url: string) =>
      url === "https://spa.example/privacy" ? page(SPA_SHELL) : DEAD.includes(url) ? UNREACHABLE : NOT_FOUND,
    );
    const result = await resolveLegalDocumentChecks({
      html: SPA_SHELL,
      baseUrl: "https://spa.example",
      catchAll200: false,
      unreadableShell: true,
      probe,
    });
    expect(result.privacy.status).toBe("INCONCLUSIVE");
    expect(result.privacy.detail).toContain("client-rendered");
    for (const url of DEAD) {
      expect(result.privacy.detail).toContain(`${url} could not be fetched`);
      expect(result.privacy.evidence).toContain(url);
    }
  });

  // ── The must-not-change side: a shell with nothing unreachable must not grow a
  //    transport sentence, and a transport failure must still not CREATE an
  //    INCONCLUSIVE when something answered conclusively. ─────────────────────
  it("says nothing about transport when every other candidate answered", async () => {
    const probe = vi.fn(async (url: string) =>
      url === "https://spa.example/privacy" ? page(SPA_SHELL) : NOT_FOUND,
    );
    const result = await resolveLegalDocumentChecks({
      html: SPA_SHELL,
      baseUrl: "https://spa.example",
      catchAll200: false,
      unreadableShell: true,
      probe,
    });
    expect(result.privacy.status).toBe("INCONCLUSIVE");
    expect(result.privacy.detail).not.toContain("could not be fetched");
  });

  it("still FAILS, not INCONCLUSIVE, when a conclusive 404 sits beside a dead candidate", async () => {
    const probe = vi.fn(async (url: string) =>
      url === "https://acme.com/privacy" ? UNREACHABLE : NOT_FOUND,
    );
    const result = await resolveLegalDocumentChecks({
      html: `<html><body><h1>Acme</h1></body></html>`,
      baseUrl: "https://acme.com",
      catchAll200: false,
      unreadableShell: false,
      probe,
    });
    expect(result.privacy.status).toBe("FAIL");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ `frame-ancestors 'self' *:443` PASSED. CSP's host-source grammar makes the
// SCHEME optional, so a bare `*` host with a port is every origin on that port — on
// any scheme, which is strictly WIDER than `https://*`, which already WARNs. The
// wildcard branch only ever matched the `scheme://*` form.
// ─────────────────────────────────────────────────────────────────────────────

describe("frame-ancestors: a scheme-less wildcard host is every origin", () => {
  const csp = (value: string) => clickjackingVerdict({ "content-security-policy": value });

  it("WARNs on the reproducer", () => {
    const verdict = csp("frame-ancestors 'self' *:443");
    expect(verdict.status).toBe("WARN");
    expect(verdict.detail).toContain("*:443");
  });

  it("WARNs on the port-wildcard and trailing-slash spellings", () => {
    expect(csp("frame-ancestors *:*").status).toBe("WARN");
    expect(csp("frame-ancestors *:8443").status).toBe("WARN");
    expect(csp("frame-ancestors *:80 'self'").status).toBe("WARN");
    expect(csp("frame-ancestors */").status).toBe("WARN");
  });

  // ⚠️ Found by diffing this against its sibling. `restrictsFraming`/`permitsAnyOrigin`
  // in `pulse-checks/security-extended.ts` already treated the SCHEME-RELATIVE `//*`
  // as permit-all — it inherits the page's own scheme, which is remote by definition —
  // while this copy required a written scheme. The two checks run on the same response
  // and disagreed on the same header, which is the self-contradiction audit items 10
  // and 18 are about.
  it("WARNs on the scheme-relative wildcard, matching its sibling check", () => {
    expect(csp("frame-ancestors //*").status).toBe("WARN");
    expect(csp("frame-ancestors 'self' //*:443").status).toBe("WARN");
  });

  // ⚠️ The other direction: a wildcard that names a DOMAIN is a real restriction and
  // must keep PASSing, ports and all.
  it("still PASSes a wildcard SUBDOMAIN, with or without a port", () => {
    expect(csp("frame-ancestors https://*.example.com").status).toBe("PASS");
    expect(csp("frame-ancestors *.example.com").status).toBe("PASS");
    expect(csp("frame-ancestors *.example.com:443").status).toBe("PASS");
    expect(csp("frame-ancestors 'self' *.example.com:8443").status).toBe("PASS");
  });

  it("still PASSes the restrictive shapes", () => {
    expect(csp("frame-ancestors 'self'").status).toBe("PASS");
    expect(csp("frame-ancestors 'none'").status).toBe("PASS");
    expect(csp("frame-ancestors https://cms.example.com:8443").status).toBe("PASS");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ RESIDUAL FROM THE `;`/SPACE PARSE: `camera =*` — a SPACE BEFORE THE EQUALS —
// PASSED with "powerful browser features are explicitly scoped (camera =*)".
//
// The delimiter is `Math.min(indexOf("="), search(/\s/))`, so the space won, the
// feature name parsed as `camera` and the allowlist parsed as the literal `=*` — which
// the wide-open test does not recognise. A check saying "this is fine" about the camera
// being granted to every origin is the same failure as saying "it isn't there" about a
// lookup that was never made (§35).
// ─────────────────────────────────────────────────────────────────────────────

describe("permissions-policy: whitespace around the `=` must not buy a PASS", () => {
  const header = (value: string) => permissionsPolicyVerdict({ "permissions-policy": value });

  it("WARNs on the reproducer", () => {
    const verdict = header("camera =*");
    expect(verdict.status).toBe("WARN");
    expect(verdict.detail).toContain("camera");
    expect(verdict.detail).not.toContain("explicitly scoped");
  });

  it("WARNs on the spacing variants", () => {
    expect(header("camera = *").status).toBe("WARN");
    expect(header("geolocation =*; microphone=()").status).toBe("WARN");
    expect(header("camera =(*)").status).toBe("WARN");
  });

  // The syntax is invalid under RFC 8941 (no whitespace around a dictionary `=`), so a
  // browser may reject the whole header and fall back to the secure `self` defaults.
  // The WARN must not assert the header is actively "looser than sending none" without
  // saying that.
  it("says the syntax is invalid rather than asserting the policy is in force", () => {
    expect(header("camera =*").detail).toMatch(/syntax/i);
  });

  // ── The must-not-change side. ─────────────────────────────────────────────
  it("still PASSes Google's live client-hint header", () => {
    expect(header("ch-ua-arch=*, ch-ua-bitness=*, ch-ua-model=*, ch-ua-platform-version=*").status).toBe("PASS");
  });

  it("still WARNs on the well-formed wide-open header, with no syntax claim", () => {
    const verdict = header("camera=*, microphone=*");
    expect(verdict.status).toBe("WARN");
    expect(verdict.detail).toContain("EVERY origin");
    expect(verdict.detail).not.toMatch(/syntax/i);
  });

  it("still PASSes the legacy space-delimited scoped spelling", () => {
    expect(header("camera 'none'; microphone 'none'; fullscreen 'self'").status).toBe("PASS");
    expect(header("camera=(); microphone=(self)").status).toBe("PASS");
    expect(header('geolocation=(self "https://maps.example.com"), camera=()').status).toBe("PASS");
  });

  it("still reads the real feature names", () => {
    for (const name of ["camera", "ch-ua-arch", "sync-xhr", "publickey-credentials-get"]) {
      expect(header(`${name}=(self)`).detail).toContain("explicitly scoped");
    }
  });
});
