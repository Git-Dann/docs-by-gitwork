import { type ExtendedCheckContext, type PulseScanCheckInput, platformIs, skip } from "./_types";

// US state privacy-law checks (CCPA/CPRA + the VCDPA/CPA/CTDPA/UCPA family).
// These ALWAYS emit a PASS/WARN (like the GDPR core checks) rather than self-
// gating on page signals, so that when a user declares "US" / "US-CA" as a target
// market the central jurisdiction filter keeps them and the compliance scorecard
// can flag exactly what's required-and-missing. Tagging lives in jurisdictions.ts
// (ccpa_* → US-CA; us_privacy_rights_request / us_state_optout_signals → the state
// privacy-law family) so non-US scans skip these via the shared filter.

const CATEGORY = "Legal & Compliance";

const ALL_CHECKS: Array<[string, string]> = [
  ["ccpa_do_not_sell", "“Do Not Sell or Share My Personal Information” link (CCPA/CPRA)"],
  ["ccpa_notice_at_collection", "Notice at Collection (CCPA/CPRA)"],
  ["us_privacy_rights_request", "Consumer privacy-rights request mechanism (US state laws)"],
  ["us_state_optout_signals", "Opt-out preference signal support (GPC / “Your Privacy Choices”)"],
];

export async function runUsPrivacyExtended(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  // No public page to inspect for these signals on API/CLI/mobile-store scans.
  if (platformIs(ctx.platform, "API_BACKEND", "CLI_TOOL", "IOS_APP", "ANDROID_APP")) {
    return skip(CATEGORY, ALL_CHECKS, "Not applicable for this platform type.");
  }

  const html = ctx.pageResult.html;
  const htmlLower = ctx.htmlLower;
  const checks: PulseScanCheckInput[] = [];

  // CCPA/CPRA "Do Not Sell or Share" link — required for businesses that sell/share
  // personal information of California residents.
  const hasDoNotSell = /do not sell or share my personal information|do not sell my (personal )?info(rmation)?|your privacy choices/i.test(html);
  checks.push({
    category: CATEGORY,
    checkKey: "ccpa_do_not_sell",
    label: "“Do Not Sell or Share My Personal Information” link (CCPA/CPRA)",
    status: hasDoNotSell ? "PASS" : "WARN",
    detail: hasDoNotSell
      ? "Do-Not-Sell / “Your Privacy Choices” link detected — CCPA/CPRA opt-out requirement addressed."
      : "No “Do Not Sell or Share My Personal Information” / “Your Privacy Choices” link — the CCPA/CPRA requires businesses that sell or share personal data of California residents to provide a clear opt-out link, typically in the footer.",
  });

  // Notice at Collection — categories of PI collected + purposes, disclosed at/before collection.
  const hasNoticeAtCollection = /notice at collection|categories of personal information|information we collect|personal information.*we collect/i.test(html);
  checks.push({
    category: CATEGORY,
    checkKey: "ccpa_notice_at_collection",
    label: "Notice at Collection (CCPA/CPRA)",
    status: hasNoticeAtCollection ? "PASS" : "WARN",
    detail: hasNoticeAtCollection
      ? "Notice-at-collection signals detected (categories of personal information / purposes disclosed)."
      : "No “Notice at Collection” detected — CCPA/CPRA requires disclosing the categories of personal information collected and the purposes, at or before the point of collection.",
  });

  // Consumer rights request path — know / delete / correct / opt-out request mechanism.
  const hasRightsRequest = /your (privacy|data) rights|submit a (privacy|data) request|right to (know|delete|correct|opt.?out)|exercise your rights|privacy request form|data subject request/i.test(html);
  checks.push({
    category: CATEGORY,
    checkKey: "us_privacy_rights_request",
    label: "Consumer privacy-rights request mechanism (US state laws)",
    status: hasRightsRequest ? "PASS" : "WARN",
    detail: hasRightsRequest
      ? "Consumer privacy-rights request mechanism detected (know / delete / correct / opt-out)."
      : "No consumer privacy-rights request mechanism detected — CCPA/CPRA, VCDPA, CPA, CTDPA and UCPA all grant residents rights to access, delete, correct and opt out, and require an accessible way to submit those requests.",
  });

  // Opt-out preference / Global Privacy Control support.
  const hasOptOutSignals = /global privacy control|\bgpc\b|opt.?out preference signal|your privacy choices/i.test(html) || htmlLower.includes("sec-gpc");
  checks.push({
    category: CATEGORY,
    checkKey: "us_state_optout_signals",
    label: "Opt-out preference signal support (GPC / “Your Privacy Choices”)",
    status: hasOptOutSignals ? "PASS" : "WARN",
    detail: hasOptOutSignals
      ? "Opt-out preference signal support detected (Global Privacy Control / “Your Privacy Choices”)."
      : "No opt-out preference signal support detected — California (CPRA) and the Colorado/Connecticut laws require honouring browser opt-out signals such as Global Privacy Control (GPC).",
  });

  return checks;
}
