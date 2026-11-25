/**
 * The last step every Dispatch tool result goes through before the model sees it (one choke
 * point, so no tool can forget). Pure; tested in __tests__/redact.test.ts.
 *
 *   1. Credentials are replaced: the vendor formats Pulse already recognises, private keys,
 *      and "password: …" / "API_KEY=…" style lines. Meeting notes, Slack and code all carry them.
 *   2. Money is replaced for anyone who can't see costs (Dan: "they cannot ask about costs").
 *      A figure with a currency sign or code, or "k"/"m" after one, becomes "[amount hidden]".
 *   3. The result is capped, and says it was cut, so the model never treats a partial read as
 *      the whole thing.
 */

import { SECRET_FORMATS } from "@/server/pulse-checks/secret-formats";

const SECRET_ASSIGNMENT =
  /\b((?:[A-Z0-9_]*?(?:PASSWORD|PASSWD|SECRET|TOKEN|API[_-]?KEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY))|password|passwd|secret|token|api[ _-]?key)\b(\s*["']?\s*[:=]\s*["']?)([^\s"'`,;]{4,})/gi;

export function redactSecrets(text: string): string {
  // The whole private key first: the vendor list below matches only its BEGIN line, and
  // replacing that line alone would leave the key body behind.
  let out = text.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----|$)/g,
    "[private key hidden]",
  );
  for (const format of SECRET_FORMATS) {
    const flags = format.re.flags.includes("g") ? format.re.flags : `${format.re.flags}g`;
    out = out.replace(new RegExp(format.re.source, flags), "[credential hidden]");
  }
  out = out.replace(SECRET_ASSIGNMENT, (_m, name: string, sep: string) => `${name}${sep}[hidden]`);
  return out;
}

const CURRENCY = "(?:£|\\$|€|GBP|USD|EUR|PKR|Rs\\.?)";
const AMOUNT = "\\d{1,3}(?:[,\\s]\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?";
const MONEY = new RegExp(
  [
    // £12,000 · $ 1.5k · € 30m · GBP 4,500 · 12,000 GBP · 45/hour after a sign
    `${CURRENCY}\\s?(?:${AMOUNT})\\s?(?:k|m|bn|K|M)?(?:\\s?(?:/|per)\\s?(?:hour|hr|day|month|mo|year|yr))?`,
    `(?:${AMOUNT})\\s?(?:k|m|K|M)?\\s?(?:GBP|USD|EUR|PKR|pounds|dollars|euros)\\b`,
  ].join("|"),
  "g",
);

export function redactMoney(text: string): string {
  return text.replace(MONEY, "[amount hidden]");
}

export interface FinaliseOptions {
  canSeeMoney: boolean;
  cap: number;
}

export function finaliseToolText(text: string, opts: FinaliseOptions): string {
  let out = redactSecrets(text);
  if (!opts.canSeeMoney) out = redactMoney(out);
  if (out.length > opts.cap) {
    out = `${out.slice(0, opts.cap)}\n[…cut here: this result was longer than Dispatch reads at once. Ask for a narrower search, or open it in Foundry.]`;
  }
  return out;
}
