import { describe, expect, it } from "vitest";
import { dmarcCheckVerdict } from "@/server/pulse-scan";
import { organizationalDomainCandidates } from "@/server/pulse-lite/registrable-domain";

/**
 * `dmarc_record` pinned against REAL DMARC records, measured over DoH on 2026-08-22.
 *
 * Pulse used to query `_dmarc.<hostname>` once and stop, so every subdomain of every
 * DMARC-protected organisation was reported as having no DMARC record — including
 * www.gov.uk and developer.mozilla.org, both of whose organisations publish `p=reject`,
 * the strictest policy DMARC defines.
 *
 * The fix implements RFC 7489 §6.6.3 discovery, and the interesting part is that doing
 * it correctly does NOT simply turn those findings into passes. For a subdomain that
 * exists, the governing policy is the parent's `sp=` (subdomain policy); `p=` applies
 * only when no `sp=` is published, and `np=` covers names that do NOT exist and is
 * therefore irrelevant to a host we just fetched successfully.
 *
 * gov.uk is the case that proves the distinction matters: it publishes
 * `p=reject; sp=none; np=reject`. Reading `p=reject` and calling www.gov.uk protected
 * would be a FALSE NEGATIVE on an email-spoofing check — the parent explicitly asks
 * receivers to take no action on its subdomains. mozilla.org publishes `p=reject` with
 * no `sp=`, so the reject really does cascade.
 *
 * Records verified live (`dig`/DoH TXT), quoted verbatim below.
 */

const REAL = {
  // "v=DMARC1;p=reject;sp=none;np=reject;adkim=s;aspf=s;fo=1;rua=..."
  govuk: "v=DMARC1;p=reject;sp=none;np=reject;adkim=s;aspf=s;fo=1;rua=mailto:dmarc-rua@dmarc.service.gov.uk",
  // "v=DMARC1; p=reject; pct=100; adkim=r; aspf=r; rua=..."  — no sp=
  mozilla: "v=DMARC1; p=reject; pct=100; adkim=r; aspf=r; rua=mailto:dmarc_agg@vali.email,mailto:dmarc@mozilla.com",
  // "v=DMARC1; p=none; pct=100; sp=none; ..."
  yc: "v=DMARC1; p=none; pct=100; sp=none; ruf=mailto:dmarc-reports+f@ycombinator.com; rua=mailto:dmarc-reports@ycombinator.com; aspf=r;",
};

const TXT = 16;
/** The resolver answered, with these TXT records. */
const found = (records: string[]) => ({ ok: true, answers: records.map((data) => ({ type: TXT, data })) });
/** The resolver answered and there is nothing there (NXDOMAIN / NOERROR-empty). */
const empty = () => ({ ok: true, answers: [] });
/** The query did NOT resolve — which is not the same as absence, and must not be reported as it. */
const failed = () => ({ ok: false, answers: [] });

/** Build the `parents` argument the real caller builds, from the real primitive. */
function parentsFor(hostname: string, byDomain: Record<string, ReturnType<typeof found>>) {
  return organizationalDomainCandidates(hostname).map((domain) => ({
    domain,
    lookup: byDomain[domain] ?? empty(),
  }));
}

describe("www.gov.uk — the organisation publishes p=reject, but sp=none", () => {
  const verdict = dmarcCheckVerdict({
    hostname: "www.gov.uk",
    atHost: empty(),
    parents: parentsFor("www.gov.uk", { "gov.uk": found([REAL.govuk]) }),
    unresolvedReason: null,
  });

  it("is not reported as having no DMARC protection at all", () => {
    // The old behaviour: a flat "No DMARC record" with no mention of the parent.
    expect(verdict.detail).toContain("_dmarc.gov.uk");
    expect(verdict.evidence).toContain("v=DMARC1");
  });

  it("does NOT pass on the parent's p=reject, because sp=none governs subdomains", () => {
    // This is the false negative the fix must not introduce.
    expect(verdict.status).not.toBe("PASS");
    expect(verdict.detail).toContain("sp=none");
  });

  it("names the two available remedies", () => {
    expect(verdict.detail).toMatch(/publish a record at _dmarc\.www\.gov\.uk/i);
    expect(verdict.detail).toMatch(/tighten sp=/i);
  });
});

describe("developer.mozilla.org — p=reject with no sp=, so it cascades", () => {
  const verdict = dmarcCheckVerdict({
    hostname: "developer.mozilla.org",
    atHost: empty(),
    parents: parentsFor("developer.mozilla.org", { "mozilla.org": found([REAL.mozilla]) }),
    unresolvedReason: null,
  });

  it("passes on the inherited enforcing policy", () => {
    expect(verdict.status).toBe("PASS");
    expect(verdict.detail).toContain("mozilla.org");
  });

  it("says the policy was inherited rather than found at the host", () => {
    // A PASS that implied a record exists at developer.mozilla.org would be its own
    // small lie, and would send someone looking for a record that is not there.
    expect(verdict.detail).toMatch(/no record at _dmarc\.developer\.mozilla\.org/i);
    expect(verdict.evidence).toMatch(/inherited/i);
  });
});

describe("news.ycombinator.com — parent is p=none; sp=none", () => {
  it("is still a finding, because nothing is enforced anywhere", () => {
    const verdict = dmarcCheckVerdict({
      hostname: "news.ycombinator.com",
      atHost: empty(),
      parents: parentsFor("news.ycombinator.com", { "ycombinator.com": found([REAL.yc]) }),
      unresolvedReason: null,
    });
    expect(verdict.status).toBe("WARN");
    expect(verdict.detail).toContain("sp=none");
  });
});

describe("a record at the host itself always wins", () => {
  it("cam.ac.uk publishes its own p=reject", () => {
    const verdict = dmarcCheckVerdict({
      hostname: "cam.ac.uk",
      atHost: found(["v=DMARC1; p=reject; pct=100; rua=mailto:dmarc-rua@dmarc.service.gov.uk"]),
      parents: [],
      unresolvedReason: null,
    });
    expect(verdict.status).toBe("PASS");
    expect(verdict.detail).toContain("_dmarc.cam.ac.uk");
  });
});

describe("could-not-look is never rendered as is-not-there", () => {
  it("a failed lookup at the host is INCONCLUSIVE, not a missing record", () => {
    const verdict = dmarcCheckVerdict({
      hostname: "example.com",
      atHost: failed(),
      parents: [],
      unresolvedReason: null,
    });
    expect(verdict.status).toBe("INCONCLUSIVE");
    expect(verdict.detail).toMatch(/unknown rather than missing/i);
  });

  it("a failed lookup at the PARENT is INCONCLUSIVE too", () => {
    const verdict = dmarcCheckVerdict({
      hostname: "www.example.com",
      atHost: empty(),
      parents: [{ domain: "example.com", lookup: failed() }],
      unresolvedReason: null,
    });
    expect(verdict.status).toBe("INCONCLUSIVE");
  });

  it("an unidentifiable organizational domain is INCONCLUSIVE, not a fail", () => {
    // e.g. a suffix outside the curated public-suffix list. The record may well be
    // published on a parent name Pulse could not identify.
    const verdict = dmarcCheckVerdict({
      hostname: "app.something.unknowntld",
      atHost: empty(),
      parents: [],
      unresolvedReason: "The suffix \".unknowntld\" is not in Pulse's curated public-suffix list.",
    });
    expect(verdict.status).toBe("INCONCLUSIVE");
    expect(verdict.detail).toMatch(/unknown rather than missing/i);
  });
});
