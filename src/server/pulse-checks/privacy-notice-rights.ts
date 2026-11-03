// ─────────────────────────────────────────────────────────────────────────────
// DATA-SUBJECT RIGHTS, READ FROM THE PRIVACY POLICY.
//
// GDPR Art. 13(2)(b) and 14(2)(c) (and the UK GDPR, identically) require the privacy
// notice to tell people they have the right of access and the right to data
// portability, among others. Whether a product HONOURS those rights happens behind
// sign-in or by email, which no scan sees, so these two keys were withheld while they
// searched the homepage for "download your data". What a scan CAN read is the notice
// itself, and a notice that never mentions a right is a defect in the notice.
//
// Verdicts:
//   PASS          the policy states the right, quoted;
//   WARN          an English policy was read, has no separate "your rights" page, and
//                 does not state it;
//   INCONCLUSIVE  no policy could be read, the policy is not in English (the patterns
//                 are English), or the policy links a separate rights page Pulse did
//                 not read.
// ─────────────────────────────────────────────────────────────────────────────

import type { PulseScanCheckInput } from "@/types/pulse";
import { CATEGORIES } from "./categories";
import { documentLanguage } from "./jurisdictions";

export const ACCESS_RIGHT_CLAIM =
  /\bright\s+(?:of|to)\s+(?:request\s+)?access\b|\bsubject\s+access\s+requests?\b|\bcop(?:y|ies)\s+of\s+(?:the\s+|your\s+|that\s+|this\s+|any\s+|all\s+)?(?:personal\s+)?(?:data|information)\b|\b(?:request|obtain|ask\s+for)\s+access\s+to\s+(?:the\s+|your\s+|any\s+)?(?:personal\s+)?(?:data|information)\b|\baccess\s+(?:to\s+)?(?:the\s+)?personal\s+(?:data|information)\s+(?:that\s+)?we\s+hold\b|\bright\s+to\s+know\b/i;
export const PORTABILITY_RIGHT_CLAIM =
  /\bportab(?:ility|le)\b|\bmachine[- ]readable\b|\bstructured,\s+commonly[- ]used\b|\b(?:transmit|transfer)\s+(?:it|them|that\s+data|your\s+(?:personal\s+)?(?:data|information))\s+(?:directly\s+)?to\s+(?:another|a\s+third)\s+(?:controller|organi[sz]ation|service|company|party|provider)\b/i;
/**
 * The policy relies on consent or a contract for some processing. The right to portability
 * applies only to processing on those two bases (Art. 20(1)(a)), so a notice that never
 * mentions either may omit it lawfully (a public body relying on public task, for example).
 */
const CONSENT_OR_CONTRACT =
  /\b(?:on\s+the\s+basis\s+of|based\s+on|rely\s+on|relying\s+on|lawful\s+basis\s+(?:is|of|for)|legal\s+basis\s+(?:is|of|for))\s+(?:your\s+|the\s+)?(?:consent|(?:performance\s+of\s+(?:a|the|our)\s+)?contract)|\bperformance\s+of\s+(?:a|the|our)\s+contract\b|\bnecessary\s+(?:for|to\s+perform)\s+(?:a|the|our)\s+contract\b|\bArt(?:icle|\.)\s*6\s*\(1\)\s*\((?:a|b)\)/i;

/** A link out to a separate rights page. In-page anchors (a contents list) are not one. */
function linksRightsPage(html: string, policyUrl: string): boolean {
  let own: URL | null = null;
  try { own = new URL(policyUrl); } catch { own = null; }
  for (const m of html.matchAll(/<a\b([^>]*)>((?:(?!<\/a>)[\s\S]){0,300})<\/a>/gi)) {
    const text = m[2].replace(/<[^>]+>/g, " ");
    if (!/\b(?:your\s+(?:privacy\s+|data\s+)?rights|data\s+subject\s+rights|individual\s+rights|exercis(?:e|ing)\s+your\s+rights|privacy\s+rights)\b/i.test(text)) continue;
    const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(m[1])?.[1] ?? "";
    if (!href || href.startsWith("#")) continue;
    try {
      const target = new URL(href, policyUrl);
      if (own && target.origin === own.origin && target.pathname.replace(/\/$/, "") === own.pathname.replace(/\/$/, "")) continue;
    } catch {
      continue;
    }
    return true;
  }
  return false;
}

/** Readable text of a page: no scripts, styles, comments or tags. */
export function policyText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&rsquo;|&apos;/gi, "'")
    .replace(/\s+/g, " ");
}

function quote(text: string, re: RegExp): string | null {
  const m = re.exec(text);
  if (!m) return null;
  const start = Math.max(0, m.index - 60);
  return text.slice(start, m.index + m[0].length + 60).trim();
}

export interface PrivacyPolicyRead {
  /** Where the policy was read from, for the detail. */
  url: string;
  html: string;
}

/** The two rights checks from the policy Pulse read, or null when none could be read. Pure. */
export function privacyNoticeRightsChecks(policy: PrivacyPolicyRead | null): PulseScanCheckInput[] {
  const specs = [
    { key: "gdpr_right_to_access", label: "Privacy policy explains the right of access (GDPR Art. 15)", re: ACCESS_RIGHT_CLAIM, right: "the right of access (asking for a copy of their personal data)" },
    { key: "gdpr_right_to_portability", label: "Privacy policy explains the right to data portability (GDPR Art. 20)", re: PORTABILITY_RIGHT_CLAIM, right: "the right to data portability (receiving their data in a machine-readable format to take elsewhere)" },
  ];
  if (!policy) {
    return specs.map((s) => ({
      category: CATEGORIES.LEGAL, checkKey: s.key, label: s.label, status: "INCONCLUSIVE" as const, confidence: "LOW" as const,
      detail: "Not assessed: Pulse could not read a privacy policy linked from this page, so whether it explains this right is unknown.",
    }));
  }
  const lang = (documentLanguage(policy.html) ?? "en").toLowerCase();
  const english = lang.startsWith("en");
  const text = policyText(policy.html);
  const rightsLink = linksRightsPage(policy.html, policy.url);
  const portabilityApplies = CONSENT_OR_CONTRACT.test(text);
  return specs.map((s) => {
    const base = { category: CATEGORIES.LEGAL, checkKey: s.key, label: s.label };
    const q = quote(text, s.re);
    if (q) {
      return { ...base, status: "PASS" as const, confidence: "HIGH" as const, evidenceStrength: "VERIFIED" as const,
        detail: `The privacy policy at ${policy.url} tells people about ${s.right}.`, evidence: q.slice(0, 300) };
    }
    if (!english) {
      return { ...base, status: "INCONCLUSIVE" as const, confidence: "LOW" as const,
        detail: `The privacy policy at ${policy.url} is not in English (lang="${lang}"), and Pulse only recognises this right stated in English.` };
    }
    if (rightsLink) {
      return { ...base, status: "INCONCLUSIVE" as const, confidence: "LOW" as const,
        detail: `The privacy policy at ${policy.url} does not state ${s.right} itself, but links a separate page about people's rights that Pulse did not read.` };
    }
    if (s.key === "gdpr_right_to_portability" && !portabilityApplies) {
      return { ...base, status: "INCONCLUSIVE" as const, confidence: "LOW" as const,
        detail: `The privacy policy at ${policy.url} does not mention data portability, and does not say it relies on consent or a contract. Portability applies only to processing on those two bases (GDPR Art. 20), so its absence may be correct.` };
    }
    return { ...base, status: "WARN" as const, confidence: "MEDIUM" as const, evidenceStrength: "VERIFIED" as const,
      detail: `The privacy policy at ${policy.url} was read and does not mention ${s.right}. UK and EU GDPR (Art. 13 and 14) require the privacy notice to tell people about each of their rights. Add a "Your rights" section that names it and says how to use it.` };
  });
}
