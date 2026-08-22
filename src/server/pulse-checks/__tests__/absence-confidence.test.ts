import { describe, expect, it } from "vitest";

import { CHECKS_REGISTRY } from "@/server/checks-registry";
import { corsPolicyVerdict, dmarcCheckVerdict, type DnsLookup } from "@/server/pulse-scan";
import type { CheckCategory } from "@/server/pulse-checks/categories";
import type { PulseScanCheckInput } from "@/types/pulse";

import { CATEGORIES, WEIGHTED_CATEGORIES } from "../categories";
import {
  ABSENCE_DERIVED_KEYS,
  HIGH_CONFIDENCE_KEYS,
  annotateTrust,
  deriveConfidence,
} from "../confidence";
import { dmarcPolicyChecks, resolveApplicableDmarc } from "../email-deliverability";
import { computePriority } from "../priority";
import { looksLikeSessionCookie, parseSetCookieHeader } from "../security-extended";

/**
 * Item 17 of the false-positive audit: HIGH confidence was granted to nine keys whose
 * adverse verdict was always derived from the ABSENCE of a string, using a probe
 * narrower than the standard it cites. HIGH's contract is "directly observed — if we
 * say it, we saw it", and it is what removed the hedge from items 3, 4, 6, 7, 9, 12
 * and 13 of the same audit.
 *
 * ⚠️ SECOND PASS. Demoting the nine KEYS bought a false negative, which is the worse
 * direction. Almost every one of these checks has two branches — one that reads a
 * header/record, one that concludes from its absence — and the probes were repaired in
 * the same tree, so the key-level hedge landed on direct reads: origin reflection
 * (`Access-Control-Allow-Origin: https://attacker.example`) fell from P2 to P3 and out
 * of the free report's actionable list, and `session_cookie_httponly` reported P3 on a
 * cookie it had named while its sibling `session_cookie_samesite` reported P2 on the
 * same parse. So the assertions below come in matched pairs: the absence branch stays
 * hedged, the reading branch stays CONFIRMED.
 */

/** The category each key is REGISTERED under — asserted against the catalogue rather
 *  than assumed. The first version of this file built every fixture with
 *  CATEGORIES.SECURITY, so the P3 claim for `cdn_detected`, `load_balancer_detected`
 *  and `backup_domain_configured` was tested against a category they never carry. */
function registeredCategory(key: string): CheckCategory {
  const row = CHECKS_REGISTRY.find((c) => c.key === key);
  if (!row) throw new Error(`${key} is not in CHECKS_REGISTRY`);
  return row.category;
}

const emitted = (checkKey: string, over: Partial<PulseScanCheckInput> = {}): PulseScanCheckInput => ({
  category: registeredCategory(checkKey),
  checkKey,
  label: checkKey,
  status: "WARN",
  detail: "",
  ...over,
});

/** The `warn()` shape kept for the counter-example block, where the category is stated
 *  explicitly because the point of those cases is the key, not the catalogue. */
const warn = (checkKey: string, over: Partial<PulseScanCheckInput> = {}): PulseScanCheckInput => ({
  category: CATEGORIES.SECURITY,
  checkKey,
  label: checkKey,
  status: "WARN",
  detail: "",
  ...over,
});

describe("absence-derived ADVERSE verdicts are not HIGH confidence", () => {
  it.each([...ABSENCE_DERIVED_KEYS])("%s resolves to MEDIUM on WARN and on FAIL", (key) => {
    for (const status of ["WARN", "FAIL"] as const) {
      const { confidence, reason } = deriveConfidence(emitted(key, { status }));
      expect(confidence).toBe("MEDIUM");
      expect(reason).toMatch(/absence/i);
    }
  });

  it.each([...ABSENCE_DERIVED_KEYS])("%s buckets as LIKELY, never CONFIRMED", (key) => {
    expect(annotateTrust(emitted(key)).trustBucket).toBe("LIKELY");
    expect(annotateTrust(emitted(key, { status: "FAIL" })).trustBucket).toBe("LIKELY");
  });

  it("grades each key under the category it is actually registered with", () => {
    // The reviewer's test weakness, made load-bearing. The first version of this file
    // asserted the P3 tier for all nine keys with CATEGORIES.SECURITY, and four of them
    // are emitted under CATEGORIES.INFRASTRUCTURE — so the claim was true of a category
    // those checks never carry. The tier itself was right by luck: both categories are
    // in WEIGHTED_CATEGORIES, so both multiply by 2. Pin the premise, not just the
    // number, or a change to CATEGORY_META's `weighted` flags moves the tier silently.
    expect(registeredCategory("cdn_detected")).toBe(CATEGORIES.INFRASTRUCTURE);
    expect(registeredCategory("load_balancer_detected")).toBe(CATEGORIES.INFRASTRUCTURE);
    expect(registeredCategory("backup_domain_configured")).toBe(CATEGORIES.INFRASTRUCTURE);
    expect(registeredCategory("csp_report_directive")).toBe(CATEGORIES.SECURITY);
    expect(registeredCategory("rate_limiting_headers")).toBe(CATEGORIES.SECURITY);
    for (const key of ABSENCE_DERIVED_KEYS) {
      expect(WEIGHTED_CATEGORIES.has(registeredCategory(key))).toBe(true);
    }
  });

  it("keeps an absence out of the free report's actionable P1/P2 list", () => {
    // This is the point of the change, not a side effect: a partially-detected
    // absence should not be presented to a stranger as a confirmed defect. WARN in a
    // weighted category scored 1.5 × 1.0 × 2 = P2 at HIGH; at MEDIUM it is 1.8 → P3.
    for (const key of ABSENCE_DERIVED_KEYS) {
      const annotated = annotateTrust(emitted(key));
      expect(computePriority(annotated).tier).toBe("P3");
    }
  });

  it("listing a key in HIGH_CONFIDENCE_KEYS cannot un-hedge its absence branch", () => {
    // The two sets deliberately overlap — HIGH credits the branch that read a header,
    // this floor hedges the branch that read nothing — so the ORDER inside
    // deriveConfidence is load-bearing. The old test asserted the sets were disjoint,
    // which is what forced the whole key to MEDIUM and demoted the direct reads.
    const overlap = [...ABSENCE_DERIVED_KEYS].filter((k) => HIGH_CONFIDENCE_KEYS.has(k));
    expect(overlap.length).toBeGreaterThan(0);
    for (const key of overlap) {
      expect(deriveConfidence(emitted(key, { status: "WARN" })).confidence).toBe("MEDIUM");
    }
  });

  it("every key is a real registered check, so the set cannot rot", () => {
    const registered = new Set(CHECKS_REGISTRY.map((c) => c.key));
    const unknown = [...ABSENCE_DERIVED_KEYS].filter((k) => !registered.has(k));
    expect(unknown).toEqual([]);
  });

  it("does not hedge a check that no longer emits a verdict", () => {
    // `multi_region_signals` is emitted SKIPPED by infrastructure-extended.ts
    // (PROSE_INFERRED_CHECKS), so an entry here was dead config that read as a live
    // hedge on a check that has no verdict to hedge.
    expect(ABSENCE_DERIVED_KEYS.has("multi_region_signals")).toBe(false);
    expect(annotateTrust(emitted("multi_region_signals", { status: "SKIPPED" })).trustBucket).toBeUndefined();
  });
});

describe("the branch that READ something keeps full credit", () => {
  it.each([...ABSENCE_DERIVED_KEYS])("%s PASS is VERIFIED, not hedged", (key) => {
    // A PASS in this family is a read by construction — the check passes because it
    // FOUND the header, record or attribute. Flooring it credited a site that runs a
    // real edge tier LESS than one running nothing, which is the mirror error.
    const annotated = annotateTrust(emitted(key, { status: "PASS", detail: "Observed." }));
    expect(annotated.confidence).toBe("HIGH");
    expect(annotated.evidenceStrength).toBe("VERIFIED");
    expect(annotated.trustBucket).toBe("VERIFIED_WORKING");
  });

  it("honours a module-declared HIGH on an adverse branch it observed", () => {
    // The escape hatch: a module that measured its own evidence wins outright.
    const declared = annotateTrust(
      emitted("cdn_detected", {
        confidence: "HIGH",
        confidenceReason: "Read cache-status off the response.",
        status: "WARN",
      }),
    );
    expect(declared.confidence).toBe("HIGH");
    expect(declared.trustBucket).toBe("CONFIRMED");
  });

  it("honours a module-declared MEDIUM over the key-level HIGH", () => {
    // The other half of the same hatch, and the reason the overlap is safe:
    // infrastructure-extended.ts declares MEDIUM on the branch where a Server product
    // name is the only evidence of a proxy, even on a PASS.
    const declared = annotateTrust(
      emitted("load_balancer_detected", {
        status: "PASS",
        confidence: "MEDIUM",
        confidenceReason: "Product fingerprint only.",
      }),
    );
    expect(declared.confidence).toBe("MEDIUM");
    expect(declared.evidenceStrength).toBe("HEURISTIC");
  });

  it("honours a module-declared LOW too", () => {
    expect(deriveConfidence(warn("dmarc_record", { confidence: "LOW" })).confidence).toBe("LOW");
  });
});

/**
 * FN-2 / FN-3 / FN-4 of the adversarial review. Each input below is the reviewer's
 * exact reproducing input, pushed through the REAL repaired probe rather than a
 * hand-written verdict, so the test cannot drift from what the scan emits.
 */
describe("repaired probes that read the thing keep their CONFIRMED / P2 slot", () => {
  const answered = (answers: { type: number; data: string }[]): DnsLookup => ({ ok: true, answers });
  const nxdomain: DnsLookup = { ok: true, answers: [] };
  const txt = (data: string) => ({ type: 16, data: `"${data}"` });

  it("FN-3: cors_policy WARNing on an origin it read is CONFIRMED, not LIKELY", () => {
    const verdict = corsPolicyVerdict(
      { "access-control-allow-origin": "https://attacker.example" },
      "https://example.com/",
    );
    expect(verdict.status).toBe("WARN");
    const annotated = annotateTrust(emitted("cors_policy", {
      status: verdict.status,
      detail: verdict.detail,
      evidence: verdict.evidence,
    }));
    // Origin reflection is a real vulnerability read straight off the response. It
    // must not be filed as an unproven advisory.
    expect(annotated.confidence).toBe("HIGH");
    expect(annotated.trustBucket).toBe("CONFIRMED");
    expect(computePriority(annotated).tier).toBe("P2");
  });

  it("FN-3 control: cors_policy on a header-less response SKIPs, so nothing is graded", () => {
    const verdict = corsPolicyVerdict({}, "https://example.com/");
    expect(verdict.status).toBe("SKIPPED");
    // The reason cors_policy is no longer in ABSENCE_DERIVED_KEYS at all: it has no
    // absence-derived verdict left to hedge.
    expect(annotateTrust(emitted("cors_policy", { status: "SKIPPED" })).trustBucket).toBeUndefined();
  });

  it("FN-2 control: a consent/analytics cookie set is not a session finding at all", () => {
    // The condition that justifies HIGH on this key: the WARN can only fire on a
    // cookie the check identified, never on the absence of a flag across a joined
    // header. These are vercel.com's real three (audit item 12) — all of which MUST be
    // JS-readable to do their job, and all of which the old code called exposed
    // session cookies. If this ever finds a candidate again, the key's HIGH is no
    // longer earned and it belongs back in ABSENCE_DERIVED_KEYS.
    const cookies = parseSetCookieHeader(
      "_v-consent={\"essential\":true}; SameSite=Lax; Secure, "
      + "_v-anonymous-id=va3CHBAksnv4; SameSite=Lax; Secure, "
      + "_v-anonymous-id-renewed=1; SameSite=Lax; Secure",
    );
    expect(cookies.length).toBeGreaterThan(0);
    expect(cookies.filter((c) => looksLikeSessionCookie(c.name))).toEqual([]);
  });

  it("FN-2: session_cookie_httponly WARNing on a cookie it named is CONFIRMED", () => {
    const cookies = parseSetCookieHeader("sessionid=abc123; Path=/; Secure; SameSite=Lax");
    const sessionCookies = cookies.filter((c) => looksLikeSessionCookie(c.name));
    expect(sessionCookies.map((c) => c.name)).toEqual(["sessionid"]);
    expect(sessionCookies.every((c) => !c.httpOnly)).toBe(true);

    const httpOnly = annotateTrust(emitted("session_cookie_httponly", {
      status: "WARN",
      detail: "Session-shaped cookie(s) set without HttpOnly: `sessionid`",
      evidence: "`sessionid`",
    }));
    // Its sibling reads the same parsed cookies with the same rigour. The two must not
    // disagree about how sure they are — that contradiction was five lines apart in
    // security-extended.ts.
    const sameSite = annotateTrust(emitted("session_cookie_samesite", { status: "WARN" }));
    expect(httpOnly.confidence).toBe(sameSite.confidence);
    expect(httpOnly.trustBucket).toBe("CONFIRMED");
    expect(computePriority(httpOnly).tier).toBe(computePriority(sameSite).tier);
    expect(computePriority(httpOnly).tier).toBe("P2");
  });

  it("FN-4: dmarc_record WARNing on an sp=none it read is CONFIRMED", () => {
    // www.gov.uk: _dmarc.www.gov.uk is NXDOMAIN, _dmarc.gov.uk publishes p=reject
    // WITH sp=none, and for an existing subdomain it is sp that governs.
    const verdict = dmarcCheckVerdict({
      hostname: "www.gov.uk",
      atHost: nxdomain,
      parents: [{ domain: "gov.uk", lookup: answered([txt("v=DMARC1; p=reject; sp=none")]) }],
      unresolvedReason: null,
    });
    expect(verdict.status).toBe("WARN");
    expect(verdict.detail).toContain("sp=none");
    const annotated = annotateTrust(emitted("dmarc_record", {
      status: verdict.status,
      detail: verdict.detail,
      evidence: verdict.evidence,
    }));
    expect(annotated.confidence).toBe("HIGH");
    expect(annotated.trustBucket).toBe("CONFIRMED");
    expect(computePriority(annotated).tier).toBe("P2");
  });

  // ── FOURTH PASS: `dmarc_quarantine_reject` is HIGH, and stays a per-BRANCH decision ──
  //
  // The confirmer's concern was that this key sits in HIGH_CONFIDENCE_KEYS, is absent
  // from ABSENCE_DERIVED_KEYS, and declares no confidence of its own — so a WARN from an
  // incomplete probe would be stamped "directly observed". Checked against the code: the
  // incomplete-probe branch does not produce a WARN at all, and the WARN branches are
  // either a read record or a completed search. The treatment therefore stays
  // per-branch. Moving the key into ABSENCE_DERIVED_KEYS would floor the read as well,
  // which is FN-2/FN-3/FN-4 all over again, so these two tests pin both halves.
  it("dmarc_quarantine_reject WARNing on an sp=none it read is CONFIRMED, like its sibling", () => {
    // gov.uk publishes p=reject WITH sp=none, and sp is the tag that governs an
    // existing subdomain — so www.gov.uk is genuinely unprotected. Read off a
    // published record: hedging it would drop a real spoofing exposure out of the
    // actionable list.
    const applicable = resolveApplicableDmarc({
      hostname: "www.gov.uk",
      atHost: { ok: true, records: [] },
      parents: [{ domain: "gov.uk", lookup: { ok: true, records: ['"v=DMARC1; p=reject; sp=none"'] } }],
      unresolvedReason: null,
    });
    const built = dmarcPolicyChecks("www.gov.uk", applicable).policy;
    expect(built.status).toBe("WARN");
    expect(built.confidence).toBeUndefined(); // no per-branch declaration needed: the key's HIGH is right here
    const annotated = annotateTrust(emitted("dmarc_quarantine_reject", {
      status: built.status,
      detail: built.detail,
      evidence: built.evidence,
    }));
    expect(annotated.confidence).toBe("HIGH");
    expect(annotated.trustBucket).toBe("CONFIRMED");
    // It must agree with `dmarc_record`, which reads the same ladder for the same host.
    expect(annotateTrust(emitted("dmarc_record", { status: "WARN" })).confidence).toBe(annotated.confidence);
    // …and the key must NOT be hedged wholesale, which is what would break the above.
    expect(ABSENCE_DERIVED_KEYS.has("dmarc_quarantine_reject")).toBe(false);
  });

  it("dmarc_quarantine_reject on an incomplete ladder is LOW/INCONCLUSIVE, not a HIGH warning", () => {
    // The other half, and the reason a key-level hedge is not needed: when the
    // organizational-domain retry does not complete, the probe returns
    // probeInconclusive(), which DECLARES confidence LOW — and a module-declared
    // confidence is checked before HIGH_CONFIDENCE_KEYS in deriveConfidence. So the
    // failure mode "WARN from an unfinished probe, stamped directly-observed" cannot
    // occur on this branch: there is no WARN.
    const applicable = resolveApplicableDmarc({
      hostname: "www.example.com",
      atHost: { ok: true, records: [] },
      parents: [{ domain: "example.com", lookup: { ok: false, reason: "resolver returned HTTP 502" } }],
      unresolvedReason: null,
    });
    const built = dmarcPolicyChecks("www.example.com", applicable).policy;
    expect(built.status).toBe("INCONCLUSIVE");
    expect(built.confidence).toBe("LOW");
    const annotated = annotateTrust(built);
    expect(annotated.confidence).toBe("LOW");
    expect(annotated.trustBucket).toBe("INCONCLUSIVE");
  });

  it("FN-4 control: an unfinished DMARC ladder is INCONCLUSIVE, never a confident negative", () => {
    // The reason HIGH is safe here: when the discovery algorithm cannot be completed
    // the probe declines rather than reporting absence, so HIGH is never applied to an
    // under-asked question.
    const verdict = dmarcCheckVerdict({
      hostname: "www.example.com",
      atHost: nxdomain,
      parents: [{ domain: "example.com", lookup: { ok: false, answers: [] } }],
      unresolvedReason: null,
    });
    expect(verdict.status).toBe("INCONCLUSIVE");
    expect(annotateTrust(emitted("dmarc_record", { status: verdict.status, detail: verdict.detail })).trustBucket)
      .toBe("INCONCLUSIVE");
  });
});

describe("findings the audit verified CORRECT must stay CONFIRMED", () => {
  // ⚠️ These are the counter-examples that constrain the fix. Demoting either of them
  // would turn a proven true positive into a hedged advisory row.
  it("spf_record on news.ycombinator.com stays HIGH — SPF does not inherit", () => {
    // RFC 7208 §3.1: SPF is evaluated at the MailFrom domain and explicitly does NOT
    // inherit from the organizational domain, so NOERROR/EMPTY at the queried name is
    // the complete answer to the right question. `dmarc_record` now reaches HIGH by
    // the same logic, having implemented RFC 7489 §6.6.3's second query.
    const annotated = annotateTrust(
      warn("spf_record", { category: CATEGORIES.EMAIL, status: "FAIL", detail: "No SPF record found." }),
    );
    expect(annotated.confidence).toBe("HIGH");
    expect(annotated.trustBucket).toBe("CONFIRMED");
  });

  it("content_security_policy_nonce on linear.app stays HIGH", () => {
    // linear.app really does send `script-src 'unsafe-inline' 'self' blob:` with no
    // nonce and no hash anywhere in the policy — read straight out of a header.
    const annotated = annotateTrust(warn("content_security_policy_nonce", { status: "FAIL" }));
    expect(annotated.confidence).toBe("HIGH");
    expect(annotated.trustBucket).toBe("CONFIRMED");
  });

  it.each(["caa_dns_record", "dnssec_enabled", "cross_origin_opener_policy", "cross_origin_resource_policy"])(
    "%s stays HIGH (verified absent on every site that reported it)",
    (key) => {
      expect(deriveConfidence(warn(key)).confidence).toBe("HIGH");
    },
  );

  it("cdn_detected on news.ycombinator.com still reports, hedged rather than dropped", () => {
    // The audit verified HN genuinely has no CDN, so the finding must survive — but an
    // absence of headers cannot distinguish "no CDN" from "a transparent one", which is
    // why it is LIKELY rather than CONFIRMED. Hedged, not silenced.
    const annotated = annotateTrust(emitted("cdn_detected", {
      status: "WARN",
      detail: "No CDN or edge-cache signal in the response headers.",
    }));
    expect(annotated.trustBucket).toBe("LIKELY");
    expect(computePriority(annotated).tier).toBe("P3");
  });
});
