/**
 * The "here's how you sign in" message for a client wiki user — what Dan pastes into an email
 * or Slack when signing a client up. Pure, so the exact wording is tested.
 *
 * ⚠️ The password is only ever known at the moment it is set: it is stored hashed, so there is
 * nothing to read it back from afterwards. When it is not known the message says it was sent
 * separately rather than leaving a blank that reads like an empty password.
 */

export interface WikiInviteInput {
  clientName: string;
  /** The wiki link the client opens. Null when the wiki is not shared — they could not get in. */
  link: string | null;
  email: string;
  name?: string | null;
  /** Only when it was just set; otherwise the message says it was sent separately. */
  password?: string | null;
}

/** First name from a full name, for the greeting. Empty or missing → "there". */
export function greetingName(name?: string | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "there";
}

/** The message, or null when there is no link to sign in at (the wiki isn't shared). */
export function wikiInviteText(input: WikiInviteInput): string | null {
  if (!input.link) return null;
  const password = input.password?.trim() ? input.password : "sent to you separately";
  return [
    `Hi ${greetingName(input.name)},`,
    "",
    `Here's your access to the ${input.clientName} project wiki:`,
    "",
    `Link: ${input.link}`,
    `Email: ${input.email}`,
    `Password: ${password}`,
    "",
    "Open the link and sign in with the email and password above. It's worth bookmarking.",
  ].join("\n");
}
