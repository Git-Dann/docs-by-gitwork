/**
 * Facts read from a page's markup and inline scripts that the old substring checks
 * guessed at: web push set-up, and credentials written into the page. Each returns the
 * evidence it found, or null. Pure, no I/O.
 */

const inlineScripts = (html: string) =>
  (html.match(/<script\b(?![^>]*\ssrc\s*=)[^>]*>[\s\S]*?<\/script\s*>/gi) ?? []).join("\n");

/** Push SDK hosts, and the browser push API itself. */
const PUSH_SDKS: Array<[RegExp, string]> = [
  [/\/\/cdn\.onesignal\.com\//i, "OneSignal SDK"],
  [/\/\/(?:www\.)?gstatic\.com\/firebasejs\/[\d.]+\/firebase-messaging/i, "Firebase Cloud Messaging"],
  [/\/\/clientcdn\.pushengage\.com\//i, "PushEngage SDK"],
  [/\/\/(?:cdn\.)?webpushr\.com\//i, "Webpushr SDK"],
  [/\/\/cdn\.pushalert\.co\//i, "PushAlert SDK"],
  [/\/\/sdk\.moengage\.com\//i, "MoEngage SDK"],
];

export function webPushEvidence(html: string): string | null {
  for (const m of html.matchAll(/<script\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi)) {
    const hit = PUSH_SDKS.find(([re]) => re.test(m[1]));
    if (hit) return hit[1];
  }
  const code = inlineScripts(html);
  if (/\bpushManager\s*\.\s*subscribe\s*\(/.test(code)) return "inline script calls pushManager.subscribe()";
  if (/\bOneSignal(?:Deferred)?\s*\.\s*(?:push|init)\s*\(/.test(code)) return "inline OneSignal set-up";
  return null;
}

/** Values that are the placeholder in a form, never a credential. */
const PLACEHOLDER = /^(?:\*+|•+|password|your password|enter (?:your )?password|\s*)$/i;

/**
 * A password input with a non-empty value attribute (the browser fills it in for anyone),
 * or text that states a username/email and a password together, e.g.
 * "Login: admin@example.com / Password: password123".
 */
export function hardcodedCredentials(html: string): { prefilledPassword: string | null; statedPair: string | null } {
  let prefilledPassword: string | null = null;
  for (const input of html.match(/<input\b[^>]*>/gi) ?? []) {
    if (!/\stype\s*=\s*["']?password\b/i.test(input)) continue;
    const value = /\svalue\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(input);
    const v = (value?.[1] ?? value?.[2] ?? value?.[3] ?? "").trim();
    if (v && !PLACEHOLDER.test(v)) { prefilledPassword = `<input type="password" value="${"•".repeat(Math.min(v.length, 8))}">`; break; }
  }
  const text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ");
  const pair = /\b(?:user(?:name)?|login|e-?mail)\s*[:=]\s*(\S{2,60})\s*(?:[,/|]|and)?\s*\bpass(?:word)?\s*[:=]\s*(\S{3,40})/i.exec(text);
  const statedPair = pair && !PLACEHOLDER.test(pair[2]) && !/^[.…_-]+$/.test(pair[2])
    ? `${pair[0].slice(0, pair[0].length - pair[2].length)}${"•".repeat(Math.min(pair[2].length, 8))}`.trim()
    : null;
  return { prefilledPassword, statedPair };
}
