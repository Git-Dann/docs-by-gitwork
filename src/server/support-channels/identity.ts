/**
 * identity.ts — who is this actually from, and what does it actually say?
 *
 * PURE. No I/O, so it is unit-testable against real inbox samples.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────
 * A support mailbox is very often fed by a CONTACT FORM or a forwarder, not by customers
 * emailing directly. The Fellas Loaded inbox is the worst case and it is not unusual:
 *
 *     From:    "Fellas Loaded" <support@fellasloaded.com>     ← the app forwarding to itself
 *     Subject: Support Request - mattyshannan@gmail.com       ← the actual customer
 *     Body:    the actual message
 *
 * Taking the From line at face value labelled 226 consecutive rows "Fellas Loaded", which makes
 * the list unreadable and unsortable — every conversation looks like the same person. Worse, a
 * reply would go back to the forwarder rather than the human who wrote in.
 *
 * The connector is where this has to be solved. No amount of list design rescues a board where
 * every row has the same name on it.
 */

/** Addresses and names that identify a mailbox rather than a person. */
export interface IdentityContext {
  /** The mailbox we are reading (impersonate/intake address). Mail "from" this is a forward. */
  mailboxAddress?: string | null;
  /** A configured display name for the mailbox, when one exists. */
  mailboxName?: string | null;
  /**
   * The Care client's own name, e.g. "Fellas Loaded".
   *
   * ⚠️ This is the signal that actually works, and leaving it out is why the first fix repaired
   * nothing. The connector config holds ADDRESSES (`impersonateEmail`, `intakeAddress`) while the
   * stored label is a DISPLAY NAME, so they never matched; and Gmail stores `authorLabel` with
   * the `<address>` already stripped, so there is no address left to compare either. A "customer"
   * whose name is the client's own name is definitionally the app forwarding to itself.
   */
  clientName?: string | null;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/** Addresses that are never a person worth threading a conversation to. */
const NOREPLY_RE = /^(no-?reply|do-?not-?reply|postmaster|mailer-daemon|bounce)/i;

export function emailsIn(text: string | null | undefined): string[] {
  if (!text) return [];
  return (text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase());
}

function displayNameOf(fromText: string): string {
  // `"Björn Khermik" <b@x.com>` → Björn Khermik   ·   `b@x.com` → b@x.com
  const name = fromText.replace(/<[^>]*>/g, "").replace(/^["'\s]+|["'\s]+$/g, "").trim();
  return name || fromText.trim();
}

function addressOf(fromText: string): string {
  const angled = fromText.match(/<([^>]+)>/);
  if (angled) return angled[1].trim().toLowerCase();
  return (emailsIn(fromText)[0] ?? "").toLowerCase();
}

/**
 * Resolve the customer this conversation is really with.
 *
 * Order matters. We only override the From line when it is demonstrably the mailbox talking to
 * itself — otherwise a genuine sender ("Björn Khermik", "Jesse Grever") would be replaced by
 * whatever address happened to appear in their subject line, which would be worse than the
 * problem being fixed.
 */
export function resolveCustomer(
  input: { fromText: string; subject?: string | null; body?: string | null },
  ctx: IdentityContext = {},
): { label: string; email: string | null; viaForwarder: boolean } {
  const fromText = (input.fromText ?? "").trim();
  const fromAddress = addressOf(fromText);
  const fromName = displayNameOf(fromText);

  const mailbox = (ctx.mailboxAddress ?? "").toLowerCase().trim();
  const selfNames = [ctx.mailboxName, ctx.clientName]
    .map((n) => (n ?? "").toLowerCase().trim())
    .filter(Boolean);

  const isSelfAddressed = Boolean(mailbox) && fromAddress === mailbox;
  const isSelfNamed = selfNames.includes(fromName.toLowerCase());
  const isNoReply = NOREPLY_RE.test(fromAddress.split("@")[0] ?? "");

  // A real human wrote in directly — trust the From line, which is the common case.
  if (!isSelfAddressed && !isSelfNamed && !isNoReply) {
    return { label: fromName || fromAddress || "Unknown", email: fromAddress || null, viaForwarder: false };
  }

  // Forwarded: find the customer in the subject first (that is where form forwards put it),
  // then the body. Never pick the mailbox's own address back out of either.
  const candidates = [...emailsIn(input.subject), ...emailsIn(input.body)].filter(
    (e) => e !== mailbox && !NOREPLY_RE.test(e.split("@")[0] ?? ""),
  );
  const found = candidates[0];

  if (found) return { label: found, email: found, viaForwarder: true };

  // Nothing better available. Keep the From line rather than inventing an identity, and say it
  // came via a forwarder so the UI can be honest about it.
  return { label: fromName || fromAddress || "Unknown", email: fromAddress || null, viaForwarder: true };
}

// ─── Preview ──────────────────────────────────────────────────────────────────
//
// The Gmail adapter set `preview: subject` at creation and never updated it, so every row
// rendered its subject twice — once as the subject and once as the "preview" — and the operator
// could not tell what any message actually said without opening it. On a 226-row queue that is
// the difference between triaging from the list and not triaging at all.

const QUOTE_MARKERS = [
  /^\s*>/,
  /^\s*On .+ wrote:\s*$/i,
  /^\s*-{2,}\s*Original Message\s*-{2,}/i,
  /^\s*From:\s/i,
  /^\s*Sent from my /i,
  /^\s*_{5,}\s*$/,
  // `--` on its own line is the RFC 3676 signature delimiter and by far the most common one;
  // matching only long dash rules missed it and let signatures into every preview.
  /^\s*--+\s*$/,
];

/** Boilerplate a form forwarder wraps around the real message. */
const FORM_LABEL_RE = /^\s*(name|email|e-?mail address|phone|subject|message|comments?|enquiry|from)\s*[:：]\s*/i;

/**
 * A useful one-line gist of what the customer said.
 *
 * Strips quoted history and signature blocks (so a reply doesn't preview as the message it is
 * replying to), unwraps `Message: …` form labels, collapses whitespace, and — importantly —
 * returns null rather than echoing the subject when there is nothing else to say. A caller that
 * gets null should render nothing, not repeat the line above it.
 */
export function derivePreview(body: string | null | undefined, subject?: string | null): string | null {
  if (!body) return null;

  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (QUOTE_MARKERS.some((re) => re.test(line))) break; // quoted history starts here
    // A bare form label on its own line ("Message:") carries no content; drop the label and keep
    // whatever followed it on the same line.
    const unlabelled = line.replace(FORM_LABEL_RE, "").trim();
    if (!unlabelled) continue;
    kept.push(unlabelled);
    if (kept.join(" ").length > 200) break;
  }

  const text = kept.join(" ").replace(/\s+/g, " ").trim();
  if (!text) return null;

  // Echoing the subject is worse than showing nothing — it is what made every row read as two
  // identical lines.
  const normalised = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  if (subject && normalised(text) === normalised(subject)) return null;

  return text.slice(0, 200);
}
