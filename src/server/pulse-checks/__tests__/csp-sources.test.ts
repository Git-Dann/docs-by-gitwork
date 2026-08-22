import { describe, expect, it } from "vitest";
import { permitsEveryOrigin, restrictsFraming } from "@/server/pulse-checks/csp-sources";
import { restrictsFraming as fromSecurityExtended } from "@/server/pulse-checks/security-extended";
import { clickjackingVerdict } from "@/server/pulse-scan";

/**
 * `frame-ancestors` is graded by TWO checks on the same response —
 * `clickjacking_protection` (pulse-scan.ts) and `csp_frame_ancestors`
 * (security-extended.ts). Each had its own copy of this rule and its own copy of the
 * scheme list, and the copies drifted: on `frame-ancestors 'self' https://*` with a
 * trailing slash, pulse-scan WARNed "permits every origin" while security-extended
 * PASSed "clickjacking protection via CSP" — about the identical header.
 *
 * A scan that contradicts itself is worse than either verdict alone. Both now call
 * `permitsEveryOrigin` from csp-sources.ts, and this file is what stops them diverging
 * again.
 */

const PERMIT_ALL = [
  "*", "*:*", "*:443", "*:80",
  "*/", "*/path",                       // scheme optional in CSP's host-source grammar
  "https:", "http:", "ws:", "wss:", "ftp:",
  "https://*", "https://*:443", "https://*/", "http://*",
  "//*", "//*/",                        // scheme-relative: inherits the page's scheme
  "https://*/*",
];

const RESTRICTS = [
  "'self'", "self", "'none'",
  "https://cms.linear.app", "https://cms.linear.app:443",
  "https://*.example.com", "https://*.example.com:443",
  // Schemes that cannot carry an attacker's remote page.
  "chrome-extension:", "moz-extension:", "safari-web-extension:",
  "blob:", "data:", "filesystem:", "file:", "capacitor:", "ionic:", "tauri:",
];

describe("permitsEveryOrigin", () => {
  for (const s of PERMIT_ALL) {
    it(`permits every origin: ${s}`, () => expect(permitsEveryOrigin(s)).toBe(true));
  }
  for (const s of RESTRICTS) {
    it(`is a real restriction: ${s}`, () => expect(permitsEveryOrigin(s)).toBe(false));
  }
  it("an empty or blank source is not protection", () => {
    expect(permitsEveryOrigin("")).toBe(false);
    expect(permitsEveryOrigin("   ")).toBe(false);
  });
});

describe("restrictsFraming treats the list as a UNION", () => {
  it("one permit-all source opens the whole directive", () => {
    expect(restrictsFraming(["'self'", "*"])).toBe(false);
    expect(restrictsFraming(["'self'", "https://*/"])).toBe(false);
    expect(restrictsFraming(["'self'", "*:443"])).toBe(false);
  });
  it("a list of real restrictions restricts", () => {
    expect(restrictsFraming(["'self'", "https://cms.linear.app"])).toBe(true);
    expect(restrictsFraming(["'self'", "chrome-extension:"])).toBe(true);
  });
  it("an empty list is not evidence of protection", () => {
    expect(restrictsFraming([])).toBe(false);
  });
});

describe("the two checks can no longer disagree", () => {
  it("security-extended re-exports the same function", () => {
    expect(fromSecurityExtended).toBe(restrictsFraming);
  });

  // The end-to-end version of the same guarantee: pulse-scan's verdict must agree with
  // the shared predicate for every source above, including the shapes the two copies
  // used to split on.
  for (const source of [...PERMIT_ALL, ...RESTRICTS]) {
    it(`pulse-scan's verdict agrees on: ${source}`, () => {
      const verdict = clickjackingVerdict({ "content-security-policy": `frame-ancestors 'self' ${source}` });
      const shared = restrictsFraming(["'self'", source]);
      expect(verdict.status === "PASS", `${source} -> ${verdict.status}`).toBe(shared);
    });
  }
});
