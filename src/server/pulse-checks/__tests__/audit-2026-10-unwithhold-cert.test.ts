// @vitest-environment node
/**
 * certificate_expiry_30d was derived from the HSTS max-age header, which has nothing to
 * do with certificate expiry; a certificate expiring tomorrow PASSed. It now reads the
 * certificate (tls-certificate.ts). These cover the verdict; `readCertificate` was
 * checked live (google.com PASS, expired.badssl.com FAIL "expired on 2015-04-12",
 * an unresolvable host INCONCLUSIVE).
 */
import { describe, expect, it } from "vitest";
import { certificateExpiryCheck, type CertificateReading } from "../tls-certificate";

const now = new Date("2026-10-26T12:00:00Z");
const inDays = (d: number): CertificateReading => ({
  ok: true, validTo: new Date(now.getTime() + d * 86_400_000 + 3_600_000), issuer: "Let's Encrypt", authorized: true, authorizationError: null,
});

describe("certificate_expiry_30d reads the certificate", () => {
  it.each([
    [-3, "FAIL", /expired on/],
    [0, "FAIL", /expires in 0 days/],
    [6, "FAIL", /expires in 6 days/],
    [7, "WARN", /expires in 7 days/],
    [29, "WARN", /expires in 29 days/],
    [30, "PASS", /another 30 days/],
    [200, "PASS", /another 200 days/],
  ])("%i days left → %s", (days, status, detail) => {
    const c = certificateExpiryCheck("site.test", inDays(days), now);
    expect(c.status).toBe(status);
    expect(c.detail).toMatch(detail);
    expect(c.evidence).toMatch(/valid_to \d{4}-\d{2}-\d{2}/);
  });

  it("a certificate that could not be read is INCONCLUSIVE, never PASS", () => {
    const c = certificateExpiryCheck("site.test", { ok: false, reason: "no TLS answer within 6s" }, now);
    expect(c.status).toBe("INCONCLUSIVE");
    expect(c.detail).toMatch(/could not be read \(no TLS answer within 6s\)/);
  });
});
