// DKIM, read from the TXT records at the common selectors.
//
// Two things the old check got wrong:
//  - `v=DKIM1` alone counted as a key. An EMPTY `p=` is a REVOKED key (RFC 6376 §3.6.1),
//    which is how a domain that sends no mail says so: example.com publishes `v=DKIM1; p=`
//    beside `v=spf1 -all` and a null MX, and was reported as signing its email.
//  - Finding nothing at four common selectors was reported as "no DKIM". A selector can be
//    named anything (Mailchimp's is k2, SendGrid's s1/s2, Amazon SES uses random tokens),
//    so absence there is not absence.

import type { PulseScanCheckInput } from "@/types/pulse";
import type { CheckCategory } from "./categories";

type Lookup = { ok: true; records: string[] } | { ok: false; reason: string };

/** A TXT answer as one string: quotes off, split strings joined. */
function txt(record: string): string {
  return record.replace(/"\s*"/g, "").replace(/^"|"$/g, "").trim();
}

/** The public key carried by a DKIM record: "" when revoked, null when not a DKIM record. */
export function dkimPublicKey(record: string): string | null {
  const value = txt(record);
  if (!/(?:^|;)\s*v\s*=\s*DKIM1\b/i.test(value) && !/(?:^|;)\s*p\s*=/i.test(value)) return null;
  const p = /(?:^|;)\s*p\s*=\s*([^;]*)/i.exec(value);
  return p ? p[1].replace(/\s+/g, "") : null;
}

/** True when the domain's SPF record authorises no sender at all ("v=spf1 -all"). */
function spfSendsNothing(spf: Lookup): boolean {
  if (!spf.ok) return false;
  return spf.records.map(txt).some((r) => /^v=spf1\s+-all$/i.test(r.replace(/\s+/g, " ").trim()));
}

export function dkimVerdict(
  base: { category: CheckCategory; checkKey: string; label: string },
  dkim: { ok: true; records: string[] },
  spf: Lookup,
): PulseScanCheckInput {
  const keys = dkim.records.map(dkimPublicKey).filter((k): k is string => k !== null);
  if (keys.some((k) => k.length > 0)) {
    return { ...base, status: "PASS", detail: "A DKIM record with a public key was found at a common selector, so outbound email from this domain can be cryptographically signed." };
  }
  if (keys.length > 0) {
    // Only revoked keys. With an SPF record that authorises nobody, the domain is saying it sends no mail.
    if (spfSendsNothing(spf)) {
      return { ...base, status: "NOT_APPLICABLE", detail: "Not applicable: this domain publishes revoked DKIM keys (empty p=) and an SPF record that authorises no sender, which is how a domain declares that it sends no email." };
    }
    return {
      ...base,
      status: "INCONCLUSIVE",
      confidence: "LOW",
      detail: "The DKIM records at the common selectors have an empty key (p=), which RFC 6376 defines as revoked, so they cannot sign mail. The domain may sign with a selector this scan did not query; check the DKIM-Signature header on a message it sends.",
    };
  }
  return {
    ...base,
    status: "INCONCLUSIVE",
    confidence: "LOW",
    confidenceReason: "DKIM selectors can be named anything; only common ones were queried.",
    detail: "No DKIM record was found at the common selectors (default, google, k1, s1). A selector can be named anything, so this does not show the domain is unsigned; check the DKIM-Signature header on a message it sends, which names the selector in use.",
  };
}
