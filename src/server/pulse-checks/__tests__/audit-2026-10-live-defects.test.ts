/**
 * Defects found by scanning REAL targets on production (October 2026), each verified by
 * hand with curl / dig before being called a defect. Each test fails on the old code.
 *
 *   · api.github.com serves HTTP/2 — Pulse said "could not verify HTTP/2" (WARN).
 *     Fixed by measuring ALPN; covered by uninspectable/live checks, not here.
 *   · gitwork.co.uk is a 2.6KB client-rendered shell — Pulse warned "no cookie consent",
 *     "no GDPR notice", "no DPO contact" having read none of it.
 *   · a UK site was warned it lacked a CHINA ICP licence.
 *   · Bitwarden: permissions listed twice, a FAIL telling a published extension it would
 *     be rejected at review, and the verdict reported no app name.
 *   · TLS-RPT: "no record" AND "record has no destination" for the same missing record.
 */
import { describe, expect, it } from "vitest";
import { reclassifySpaChecks } from "@/server/pulse-lite/spa-detect";
import { checkAppliesToMarkets, jurisdictionsForCheck } from "@/server/pulse-checks/jurisdictions";
import { evaluateExtensionManifest } from "@/server/pulse-checks/chrome-extension";
import { buildAgentVerdict } from "@/server/pulse-agent";
import type { PulseScanCheckInput } from "@/types/pulse";

const c = (checkKey: string, status: PulseScanCheckInput["status"], detail = "d"): PulseScanCheckInput =>
  ({ checkKey, status, detail, category: "Security", label: checkKey }) as PulseScanCheckInput;

describe("an unrendered client-side shell", () => {
  const out = Object.fromEntries(
    reclassifySpaChecks([
      c("cookie_consent", "WARN"),
      c("gdpr_dpo_contact", "WARN"),
      c("gdpr_article13_notice", "WARN"),
      c("csp_header", "WARN"),
      c("has_robots_txt", "FAIL"),
      c("privacy_policy", "FAIL"),
      c("meta_title", "PASS"),
    ]).map((x) => [x.checkKey, x.status]),
  );

  it("does not claim content it never read was missing", () => {
    expect(out.cookie_consent).toBe("INCONCLUSIVE");
    expect(out.gdpr_dpo_contact).toBe("INCONCLUSIVE");
    expect(out.gdpr_article13_notice).toBe("INCONCLUSIVE");
  });

  it("keeps findings that do not depend on reading the page", () => {
    expect(out.csp_header).toBe("WARN");      // a response header — really absent
    expect(out.has_robots_txt).toBe("FAIL");  // fetched, not parsed
    expect(out.privacy_policy).toBe("FAIL");  // establishes its answer by probing policy paths itself
    expect(out.meta_title).toBe("PASS");      // a PASS was earned from what WAS in the shell
  });
});

describe("jurisdiction", () => {
  it("a China ICP licence only applies to sites serving China", () => {
    expect(jurisdictionsForCheck("icp_license")).toEqual(["CN"]);
    expect(checkAppliesToMarkets("icp_license", ["UK", "EU", "US"])).toBe(false);
    expect(checkAppliesToMarkets("icp_license", ["CN"])).toBe(true);
  });
});

describe("Chrome extension host permissions", () => {
  const manifest = { manifest_version: 3, host_permissions: ["https://*/*", "*://*/*"], content_scripts: [{ matches: ["*://*/*", "https://*/*"] }] };

  it("lists each wildcard once", () => {
    const check = evaluateExtensionManifest(manifest, "store").find((x) => x.checkKey === "ext_host_permissions_scoped")!;
    expect(check.evidence).toBe("https://*/*, *://*/*");
  });

  // Audit 2026-10 (extension item 12): source is a WARN too now — all-sites access is often legitimate.
  it("a published listing is a WARN, without telling it it will be rejected; source is a WARN too", () => {
    const store = evaluateExtensionManifest(manifest, "store").find((x) => x.checkKey === "ext_host_permissions_scoped")!;
    const repo = evaluateExtensionManifest(manifest, "repo").find((x) => x.checkKey === "ext_host_permissions_scoped")!;
    expect(store.status).toBe("WARN");
    expect(store.detail).not.toMatch(/rejected/);
    expect(repo.status).toBe("WARN");
    expect(repo.detail).toMatch(/held for justification/);
  });
});

describe("the agent verdict names a store app", () => {
  const url = "https://chromewebstore.google.com/detail/bitwarden-password-manager/nngceckbapebfimnlniiiahkandclblb";
  const base = { url, status: "COMPLETED" as const, healthScore: 80, techStack: [], checks: [] };

  it("keeps a name read from the listing even when it equals the link's slug", () => {
    expect(buildAgentVerdict({ ...base, name: "Bitwarden Password Manager", nameFromStore: true }).subject.name).toBe("Bitwarden Password Manager");
  });

  it("still drops an invented placeholder that did NOT come from the store", () => {
    expect(buildAgentVerdict({ ...base, name: "chromewebstore.google.com" }).subject.name).toBeNull();
  });
});
