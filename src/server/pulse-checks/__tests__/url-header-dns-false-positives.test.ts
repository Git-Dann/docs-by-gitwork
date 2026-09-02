import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  clickjackingVerdict,
  corsPolicyVerdict,
  detectEdgeCache,
  dmarcCheckVerdict,
  parseDmarcTags,
  permissionsPolicyVerdict,
  spfCheckVerdict,
  txtStrings,
  type DnsLookup,
} from "@/server/pulse-scan";

// ─────────────────────────────────────────────────────────────────────────────
// The URL-side half of the July 2026 false-positive audit (6 sites, 88 actionable
// findings verified with curl/dig/DoH/headless Chrome; 38 finding-instances
// defective). Every fixture below is a real observed response.
//
// The audit's Pattern A is the rule these tests enforce: "we could not look"
// must never be rendered as "it isn't there", and a verdict derived from an
// absence must name the exact question that was asked.
//
// ⚠️ Findings the audit verified CORRECT appear here too, as the discriminating
// controls. Each is marked. If one of them stops firing, the fix has produced a
// false negative — which on these checks is the more expensive direction.
// ─────────────────────────────────────────────────────────────────────────────

const answered = (answers: { type: number; data: string }[]): DnsLookup => ({ ok: true, answers });
const nxdomain: DnsLookup = { ok: true, answers: [] };
const lookupFailed: DnsLookup = { ok: false, answers: [] };
const txt = (data: string) => ({ type: 16, data: `"${data}"` });
const cname = (data: string) => ({ type: 5, data });
const mx = (data: string) => ({ type: 15, data });

// ── Item 3: DMARC discovery ─────────────────────────────────────────────────

describe("DMARC: RFC 7489 §6.6.3 organizational-domain discovery", () => {
  it("parses the tags it needs, and only those", () => {
    const tags = parseDmarcTags([
      "v=DMARC1;p=reject;sp=none;np=reject;adkim=s;aspf=s;fo=1;rua=mailto:x@gov.uk",
    ]);
    expect(tags).toMatchObject({ p: "reject", sp: "none", np: "reject" });
  });

  it("strips the resolver's quoting from TXT answers", () => {
    expect(txtStrings(answered([txt("v=spf1 -all")]))).toEqual(["v=spf1 -all"]);
  });

  it("passes on a record at the scanned name", () => {
    const verdict = dmarcCheckVerdict({
      hostname: "gov.uk",
      atHost: answered([txt("v=DMARC1;p=reject;sp=none;np=reject")]),
      parents: [],
      unresolvedReason: null,
    });
    expect(verdict.status).toBe("PASS");
  });

  // The headline defect: 3 of 6 audited sites. `_dmarc.developer.mozilla.org` is
  // NXDOMAIN; `_dmarc.mozilla.org` is `p=reject`, the strictest policy DMARC has.
  it("finds an inherited ENFORCING policy at the organizational domain", () => {
    const verdict = dmarcCheckVerdict({
      hostname: "developer.mozilla.org",
      atHost: nxdomain,
      parents: [{ domain: "mozilla.org", lookup: answered([txt("v=DMARC1; p=reject; pct=100; adkim=r; aspf=r")]) }],
      unresolvedReason: null,
    });
    expect(verdict.status).toBe("PASS");
    expect(verdict.detail).toContain("mozilla.org");
    expect(verdict.evidence).toContain("p=reject");
  });

  // ⚠️ THE FALSE-NEGATIVE GUARD the audit called out explicitly: a blanket
  // "org record found ⇒ PASS" would reassure exactly the hosts that are
  // unprotected. gov.uk publishes p=reject WITH sp=none, and for an existing
  // subdomain it is sp that governs. So www.gov.uk is genuinely uncovered.
  it("does NOT pass a subdomain whose parent publishes sp=none", () => {
    const verdict = dmarcCheckVerdict({
      hostname: "www.gov.uk",
      atHost: nxdomain,
      parents: [{ domain: "gov.uk", lookup: answered([txt("v=DMARC1;p=reject;sp=none;np=reject;adkim=s")]) }],
      unresolvedReason: null,
    });
    expect(verdict.status).toBe("WARN");
    // It must report BOTH the inherited record and the effective subdomain policy,
    // rather than the old flat falsehood "No DMARC record".
    expect(verdict.detail).toContain("sp=none");
    expect(verdict.detail).toContain("gov.uk");
    expect(verdict.detail).not.toContain("No DMARC record found");
  });

  it("does not pass on p=none either (news.ycombinator.com ← ycombinator.com)", () => {
    const verdict = dmarcCheckVerdict({
      hostname: "news.ycombinator.com",
      atHost: nxdomain,
      parents: [{ domain: "ycombinator.com", lookup: answered([txt("v=DMARC1; p=none; pct=100; sp=none")]) }],
      unresolvedReason: null,
    });
    expect(verdict.status).toBe("WARN");
  });

  // ⚠️ RFC 9091 scopes `np=` to NON-EXISTENT subdomains. Pulse only ever scans a
  // host it has just fetched a page from, so np= must never be read as that
  // host's policy — gov.uk's np=reject alongside sp=none is exactly the trap.
  it("ignores np= when deciding an existing subdomain's policy", () => {
    const verdict = dmarcCheckVerdict({
      hostname: "www.gov.uk",
      atHost: nxdomain,
      parents: [{ domain: "gov.uk", lookup: answered([txt("v=DMARC1;p=none;sp=none;np=reject")]) }],
      unresolvedReason: null,
    });
    expect(verdict.status).toBe("WARN");
  });

  it("prefers a delegated department's own record over the parent's", () => {
    const verdict = dmarcCheckVerdict({
      hostname: "www.hmrc.gov.uk",
      atHost: nxdomain,
      parents: [
        { domain: "hmrc.gov.uk", lookup: answered([txt("v=DMARC1; p=reject; sp=reject")]) },
        { domain: "gov.uk", lookup: answered([txt("v=DMARC1;p=reject;sp=none")]) },
      ],
      unresolvedReason: null,
    });
    expect(verdict.status).toBe("PASS");
    expect(verdict.detail).toContain("hmrc.gov.uk");
  });

  it("WARNs, naming the full discovery path, when there really is no record anywhere", () => {
    const verdict = dmarcCheckVerdict({
      hostname: "app.nodmarc.com",
      atHost: nxdomain,
      parents: [{ domain: "nodmarc.com", lookup: nxdomain }],
      unresolvedReason: null,
    });
    expect(verdict.status).toBe("WARN");
    expect(verdict.detail).toContain("_dmarc.app.nodmarc.com");
    expect(verdict.detail).toContain("_dmarc.nodmarc.com");
  });

  it("WARNs on a bare apex with nothing to fall back to", () => {
    const verdict = dmarcCheckVerdict({
      hostname: "nodmarc.com",
      atHost: nxdomain,
      parents: [],
      unresolvedReason: null,
    });
    expect(verdict.status).toBe("WARN");
  });

  // Pattern A: a lookup that did not complete is not an absence.
  it("is INCONCLUSIVE when the lookup at the scanned name fails", () => {
    const verdict = dmarcCheckVerdict({
      hostname: "example.com",
      atHost: lookupFailed,
      parents: [],
      unresolvedReason: null,
    });
    expect(verdict.status).toBe("INCONCLUSIVE");
  });

  it("is INCONCLUSIVE when the fallback lookup fails", () => {
    const verdict = dmarcCheckVerdict({
      hostname: "www.example.com",
      atHost: nxdomain,
      parents: [{ domain: "example.com", lookup: lookupFailed }],
      unresolvedReason: null,
    });
    expect(verdict.status).toBe("INCONCLUSIVE");
  });

  // The registrable-domain module returns null rather than guessing, so the
  // discovery algorithm cannot be completed — unknown, not missing.
  it("is INCONCLUSIVE when the organizational domain could not be established", () => {
    const verdict = dmarcCheckVerdict({
      hostname: "host.invalidtld",
      atHost: nxdomain,
      parents: [],
      unresolvedReason: "The suffix \".invalidtld\" is not in Pulse's curated public-suffix list.",
    });
    expect(verdict.status).toBe("INCONCLUSIVE");
    expect(verdict.detail).toContain("invalidtld");
  });
});

// ── Item 15 (SPF wording) + the audit's must-survive SPF finding ─────────────

describe("SPF: the probe was right, the sentence was not — and it must NOT inherit", () => {
  it("passes on a real record", () => {
    const verdict = spfCheckVerdict({
      hostname: "gov.uk",
      txt: answered([txt("v=spf1 -all")]),
      mx: nxdomain,
      registrable: "gov.uk",
    });
    expect(verdict.status).toBe("PASS");
  });

  // ⚠️ VERIFIED CORRECT BY THE AUDIT, AND IT MUST STILL FIRE.
  // news.ycombinator.com has no SPF; RFC 7208 §3.1 makes SPF non-inheriting, so
  // ycombinator.com's `v=spf1 ... -all` genuinely does not cover it. An
  // organizational-domain fallback here — the one added to DMARC above — would
  // convert a true email-spoofing finding into a false negative.
  it("still WARNs on a subdomain with no SPF, whatever the parent publishes", () => {
    const verdict = spfCheckVerdict({
      hostname: "news.ycombinator.com",
      txt: answered([txt("some-unrelated-verification-token")]),
      mx: nxdomain,
      registrable: "ycombinator.com",
    });
    expect(verdict.status).toBe("WARN");
    // And it says WHY inheritance is not the answer, instead of leaving the
    // reader to assume Pulse simply failed to look at the parent.
    expect(verdict.detail).toContain("RFC 7208");
    expect(verdict.detail).toContain("ycombinator.com");
  });

  it("no longer claims 'anyone can spoof your domain' about a name that sends no mail", () => {
    const verdict = spfCheckVerdict({
      hostname: "www.gov.uk",
      txt: nxdomain,
      mx: nxdomain,
      registrable: "gov.uk",
    });
    expect(verdict.status).toBe("WARN");
    expect(verdict.detail).not.toMatch(/anyone can spoof/i);
    // The actionable version: publish the record that says "this name sends nothing".
    expect(verdict.detail).toContain("v=spf1 -all");
  });

  it("uses the stronger wording when the name does handle mail", () => {
    const verdict = spfCheckVerdict({
      hostname: "acme.com",
      txt: nxdomain,
      mx: answered([mx("10 mx.acme.com.")]),
      registrable: "acme.com",
    });
    expect(verdict.status).toBe("WARN");
    expect(verdict.detail).toContain("MX");
  });

  // developer.mozilla.org: the TXT query returns a type-5 CNAME answer and no
  // TXT, and RFC 1034 §3.6.2 forbids any other record type at a CNAME owner. No
  // record CAN exist here, so "missing" is not a defect anyone can fix.
  it("is INCONCLUSIVE at a CNAME owner name, where no TXT can exist", () => {
    const verdict = spfCheckVerdict({
      hostname: "developer.mozilla.org",
      txt: answered([cname("mozilla.map.fastly.net.")]),
      mx: answered([]),
      registrable: "mozilla.org",
    });
    expect(verdict.status).toBe("INCONCLUSIVE");
    expect(verdict.detail).toContain("RFC 1034");
  });

  it("is INCONCLUSIVE when the TXT lookup did not complete", () => {
    const verdict = spfCheckVerdict({
      hostname: "example.com",
      txt: lookupFailed,
      mx: nxdomain,
      registrable: "example.com",
    });
    expect(verdict.status).toBe("INCONCLUSIVE");
  });
});

// ── Item 4: cors_policy ─────────────────────────────────────────────────────

describe("cors_policy: absence is the secure state, and an explicit origin is not a pass", () => {
  // Reproduced on ALL SIX audited sites — the strongest reproduction in the corpus.
  it("SKIPS with a reason when the header is absent", () => {
    const verdict = corsPolicyVerdict({}, "https://www.gov.uk/");
    expect(verdict.status).toBe("SKIPPED");
    expect(verdict.detail).toMatch(/not assessed/i);
    // And it stops naming API routes it never probed.
    expect(verdict.detail).not.toMatch(/verify cross-origin policy is correctly configured for API routes/i);
  });

  it("WARNs on the wildcard", () => {
    const verdict = corsPolicyVerdict({ "access-control-allow-origin": "*" }, "https://acme.com/");
    expect(verdict.status).toBe("WARN");
  });

  // ⚠️ THE LIVE FALSE NEGATIVE. `corsHeader ? "PASS"` upgraded this response from
  // WARN to PASS: only the literal `*` was ever caught. Fixing the absence branch
  // alone would have left this rubber-stamped and gone quiet on the safe case.
  it("WARNs on a foreign origin instead of passing it", () => {
    const verdict = corsPolicyVerdict(
      { "access-control-allow-origin": "https://attacker.example" },
      "https://acme.com/",
    );
    expect(verdict.status).toBe("WARN");
    expect(verdict.detail).toContain("attacker.example");
    expect(verdict.detail).toMatch(/reflection/i);
  });

  it("calls out the credentialed grant, which is the dangerous one", () => {
    const verdict = corsPolicyVerdict(
      {
        "access-control-allow-origin": "https://attacker.example",
        "access-control-allow-credentials": "true",
      },
      "https://acme.com/",
    );
    expect(verdict.status).toBe("WARN");
    expect(verdict.detail).toMatch(/credentials/i);
  });

  it("passes only when the value is the site's own origin", () => {
    const verdict = corsPolicyVerdict(
      { "access-control-allow-origin": "https://acme.com" },
      "https://acme.com/pricing",
    );
    expect(verdict.status).toBe("PASS");
  });
});

// ── Item 10: x_frame_options ────────────────────────────────────────────────

describe("x_frame_options: a header check, with CSP frame-ancestors honoured", () => {
  it("passes on the header itself", () => {
    expect(clickjackingVerdict({ "x-frame-options": "DENY" }).status).toBe("PASS");
  });

  // linear.app — proved by driving real Chrome, and already PASSED by
  // `csp_frame_ancestors` on the identical response. One scan cannot assert both.
  it("passes when only the CSP restricts framing", () => {
    const verdict = clickjackingVerdict({
      "content-security-policy": "default-src 'self'; frame-ancestors 'self' https://cms.linear.app; script-src 'self'",
    });
    expect(verdict.status).toBe("PASS");
    expect(verdict.detail).toContain("frame-ancestors");
  });

  // ⚠️ FALSE-NEGATIVE GUARD: `frame-ancestors *` permits every origin, so
  // honouring the supersession must not degrade into honouring the directive's
  // mere presence.
  it("does NOT pass on frame-ancestors *", () => {
    const verdict = clickjackingVerdict({ "content-security-policy": "frame-ancestors *" });
    expect(verdict.status).toBe("WARN");
  });

  // Only the ENFORCED policy blocks. A report-only policy reports.
  it("does NOT pass on frame-ancestors in a report-only policy", () => {
    const verdict = clickjackingVerdict({
      "content-security-policy-report-only": "frame-ancestors 'self'",
    });
    expect(verdict.status).toBe("WARN");
  });

  it("still WARNs when neither is present", () => {
    expect(clickjackingVerdict({}).status).toBe("WARN");
  });
});

// ── Item 11: permissions_policy ─────────────────────────────────────────────

describe("permissions_policy: the absent-header default is `self`, not 'unrestricted'", () => {
  it("passes on the header", () => {
    expect(permissionsPolicyVerdict({ "permissions-policy": "camera=(), geolocation=()" }).status).toBe("PASS");
  });

  // Proved on linear.app via document.featurePolicy in real Chrome: with no
  // header, camera/microphone/geolocation are all self=true, foreign=false.
  it("no longer claims camera/microphone/geolocation are unrestricted", () => {
    const verdict = permissionsPolicyVerdict({});
    expect(verdict.status).toBe("WARN");
    expect(verdict.detail).not.toMatch(/are unrestricted/i);
    expect(verdict.detail).toMatch(/default/i);
  });

  // vercel.com sends `feature-policy: fullscreen 'self'; camera 'none'` and no
  // permissions-policy. `grep -rn 'feature-policy' src/` used to return nothing,
  // so Pulse told it the one feature it explicitly DENIES was unrestricted.
  it("reads the deprecated predecessor and reports it as present", () => {
    const verdict = permissionsPolicyVerdict({ "feature-policy": "fullscreen 'self'; camera 'none'" });
    expect(verdict.detail).toContain("camera 'none'");
    expect(verdict.detail).toMatch(/deprecated|withdrawn/i);
    expect(verdict.evidence).toContain("feature-policy");
  });
});

// ── Item 6: cdn_detected ────────────────────────────────────────────────────

describe("cdn_detected: standards-defined signals before vendor fingerprints", () => {
  // gitwork.co.uk — a proxy's own machine-readable account of forwarding the
  // request, and the old five-name list carried legacy `x-cache` but not this.
  it("detects an RFC 9211 Cache-Status header (Netlify Edge)", () => {
    const evidence = detectEdgeCache({
      "cache-status": '"Netlify Edge"; fwd=miss; fwd-status=200; stored',
      server: "Netlify",
    });
    expect(evidence?.header).toBe("cache-status");
    expect(evidence?.reason).toContain("9211");
  });

  it("detects an RFC 9111 Age header on its own", () => {
    expect(detectEdgeCache({ age: "317" })?.header).toBe("age");
  });

  it("treats Age: 0 as presence, not as a zero to be ignored", () => {
    expect(detectEdgeCache({ age: "0" })).not.toBeNull();
  });

  it("detects a Via header", () => {
    expect(detectEdgeCache({ via: "1.1 router, 1.1 varnish" })?.header).toBe("via");
  });

  it("detects an edge platform named in Server", () => {
    expect(detectEdgeCache({ server: "cloudflare" })?.header).toBe("server");
  });

  it("still detects the legacy vendor headers", () => {
    expect(detectEdgeCache({ "x-vercel-id": "lhr1::iad1::7d86s" })?.header).toBe("x-vercel-id");
    expect(detectEdgeCache({ "cf-ray": "8b0c::LHR" })?.header).toBe("cf-ray");
  });

  // ⚠️ VERIFIED CORRECT BY THE AUDIT, AND IT MUST STILL FIRE.
  // news.ycombinator.com genuinely has no CDN — single A record 209.216.230.207
  // in one US colo, no CNAME. Tempting to call wrong because www.ycombinator.com
  // IS on Cloudflare; news. is not.
  it("still WARNs on a genuinely CDN-less origin", () => {
    expect(
      detectEdgeCache({
        server: "nginx",
        "content-type": "text/html; charset=utf-8",
        "cache-control": "private",
      }),
    ).toBeNull();
  });

  // The old load-balancer sibling tested `/cloudflare|nginx|.../` against
  // JSON.stringify(headers), which passes on any site whose unrelated header
  // value happens to contain one of those words.
  it("does not fire on an unrelated header that merely contains a vendor word", () => {
    expect(
      detectEdgeCache({
        "content-security-policy": "script-src 'self' https://static.cloudflareinsights.com",
        "x-generator": "nginx-unit docs",
      }),
    ).toBeNull();
  });

  // ⚠️ `CDN-Cache-Control` is a directive the ORIGIN sends TO a CDN, so it proves
  // the origin expects one — not that one handled this response.
  it("does not accept CDN-Cache-Control as proof an intermediary handled the request", () => {
    expect(detectEdgeCache({ "cdn-cache-control": "max-age=3600" })).toBeNull();
  });

  it("does not treat a bare reverse proxy as a CDN", () => {
    // Caddy/Traefik/Envoy are load balancers; that verdict belongs to
    // `load_balancer_detected`, not here.
    expect(detectEdgeCache({ server: "Caddy" })).toBeNull();
    expect(detectEdgeCache({ server: "traefik" })).toBeNull();
  });
});

// ── Item 15: security_txt — wording only, the probe was already right ───────

describe("security_txt says what is missing, not what the site lacks", () => {
  const source = readFileSync("src/server/pulse-scan.ts", "utf8");
  const block = source.slice(
    source.indexOf('checkKey: "security_txt"'),
    source.indexOf('checkKey: "security_txt"') + 1400,
  );

  // Credit where due: the probe content-verifies against text/plain or
  // contact:/expires:, so gitwork.co.uk's catch-all 200 did NOT fool it. The
  // defect was purely the sentence, which turned "this host does not serve the
  // RFC 9116 file" into "security researchers have no official path to report
  // vulnerabilities". Verified false on both sites it fired on:
  // news.ycombinator.com publishes /security.html (linked from the footer Pulse
  // parsed) with security@ycombinator.com, and mozilla.org serves a security.txt
  // with a bounty programme.
  it("drops the 'no official path to report vulnerabilities' claim", () => {
    expect(block).not.toMatch(/no official path to report vulnerabilities/i);
  });

  it("names the artefact and what it buys", () => {
    expect(block).toContain("RFC 9116");
    expect(block).toMatch(/discover it automatically|auto-discover/i);
  });

  // The content-verify itself must not be weakened while rewording around it.
  it("still content-verifies rather than trusting a 200", () => {
    const probe = source.slice(source.indexOf("const securityTxtFound = await fileServed("), source.indexOf('checkKey: "security_txt"'));
    expect(probe).toContain("text/plain");
    expect(probe).toMatch(/contact:/i);
  });
});

// ── Pattern A, at the transport: a resolver that did not answer ─────────────

describe("the DoH transport distinguishes 'no record' from 'no answer'", () => {
  const source = readFileSync("src/server/pulse-scan.ts", "utf8");
  const transport = source.slice(
    source.indexOf("async function dnsLookup("),
    source.indexOf("const hostAnalysis = analyzeHost(hostname)"),
  );

  // The old helper returned `[]` for a resolver 5xx, a thrown fetch AND a real
  // NXDOMAIN, so "we couldn't look" and "it isn't there" were the same value.
  it("returns an ok flag rather than a bare array", () => {
    expect(transport).toContain("ok: false");
    expect(transport).toContain("ok: true");
  });

  // DoH Status 0 = NOERROR and 3 = NXDOMAIN are both real answers; SERVFAIL and
  // REFUSED are not, and used to be indistinguishable from an empty answer.
  it("treats NXDOMAIN as an answer and SERVFAIL as a failure", () => {
    expect(transport).toContain("json.Status !== 0 && json.Status !== 3");
  });

  // A TXT query against a CNAME owner returns the type-5 answer, which is what
  // lets spfCheckVerdict recognise a name that cannot hold the record — for free.
  it("keeps answer types, so no extra query is needed to spot a CNAME owner", () => {
    expect(transport).toContain("type: a.type");
  });
});

// ── Item 14: a label must name its subject, never the desired outcome ────────

describe("check labels are not phrased as the PASS state", () => {
  const source = readFileSync("src/server/pulse-scan.ts", "utf8");

  // vercel.com sends `x-powered-by: Next.js, Payload`, so the report headline was
  //   "X-Powered-By header absent — X-Powered-By is set to \"Next.js, Payload\""
  // because the public triage view renders `label` as the finding headline while
  // `status` and `detail` flip to the opposite meaning.
  it("no_x_powered_by names the header, not its absence", () => {
    const block = source.slice(source.indexOf('checkKey: "no_x_powered_by"'));
    const label = /label: "([^"]+)"/.exec(block)?.[1];
    expect(label).toBe("X-Powered-By header");
  });

  it("x_frame_options names the header rather than claiming a posture", () => {
    const block = source.slice(source.indexOf('checkKey: "x_frame_options"'));
    const label = /label: "([^"]+)"/.exec(block)?.[1];
    // "Clickjacking protection" was a posture claim on a single-header read, and
    // the same scan's csp_frame_ancestors contradicted it.
    expect(label).not.toBe("Clickjacking protection");
    expect(label).toContain("X-Frame-Options");
  });
});
