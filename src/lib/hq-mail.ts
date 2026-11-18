/**
 * Which mail on HQ is from a person and which is automated (bot notifications, newsletters,
 * no-reply senders). HQ shows people first and folds the rest behind a toggle; nothing is
 * dropped. Deliberately conservative: when in doubt a message counts as from a person, because
 * hiding a real email is worse than showing a newsletter.
 */

const AUTOMATED_SENDER = [
  /\[bot\]/i,
  /(^|[^a-z])bot($|[^a-z])/i,
  /no[-_.]?reply/i,
  /do[-_.]?not[-_.]?reply/i,
  /^notifications?@/i,
  /^(newsletter|news|digest|updates?|marketing|mailer|hello|team|info)@/i,
  /@(notifications?|mail|email|em|e|news|newsletter|updates?|marketing|mailer)\./i,
  /mailer-daemon/i,
];

const AUTOMATED_SUBJECT = [/^(re: )?\[[^\]]+\/[^\]]+\]/i, /\bverification code\b/i, /\bnewsletter\b/i, /\bunsubscribe\b/i];

/** The address part of `"Name" <a@b.c>`, or the whole string when there is no angle part. */
export function senderAddress(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

export function isAutomatedMail(from: string, subject = ""): boolean {
  const address = senderAddress(from);
  const name = from.replace(/<[^>]*>/, "").replace(/"/g, "").trim();
  if (AUTOMATED_SENDER.some((re) => re.test(address) || re.test(name))) return true;
  return AUTOMATED_SUBJECT.some((re) => re.test(subject));
}
