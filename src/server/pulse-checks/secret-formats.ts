/**
 * Credential formats Pulse recognises, and the rules that keep them honest.
 *
 * A "rotate this key immediately" finding has to be right, so this matches the
 * vendors' own published formats only, and separates three things a looser scanner
 * runs together:
 *
 *   1. SECRETS — a key that grants access by itself (Stripe sk_live_, AWS AKIA…,
 *      GitHub ghp_, OpenAI sk-, Anthropic sk-ant-, a PEM private key, …).
 *   2. PUBLIC-BY-DESIGN keys — Stripe pk_live_ and Google browser keys (AIza…: Maps
 *      JavaScript, the Firebase web config). These are meant to ship in client code and
 *      are secured by referrer/bundle restrictions, so rotating one achieves nothing.
 *      They are reported as a note, never as a finding.
 *   3. PLACEHOLDERS and test keys — sk_test_, "your_api_key", sk-XXXX…, example values.
 *
 * Pure: no I/O. Used by the repo secret scanner; written so the page-source check
 * (`no_api_keys_in_html`) can share it.
 */

export interface SecretFormat {
  kind: string;
  re: RegExp;
  /** True when the key is meant to be public (shipped to browsers / apps). */
  publicByDesign?: boolean;
  /** Extra shape test on the matched token, e.g. "looks random", not a CSS class. */
  accept?: (token: string) => boolean;
}

/** A random-looking key tail: mixes upper case, lower case and digits. `sk-loading-spinner-wrapper` does not. */
export function looksRandom(tail: string): boolean {
  return /[A-Z]/.test(tail) && /[a-z]/.test(tail) && /[0-9]/.test(tail) && new Set(tail).size >= 10;
}

const NB = "(?<![A-Za-z0-9_-])"; // not preceded by a key character

export const SECRET_FORMATS: SecretFormat[] = [
  { kind: "Stripe live secret key", re: new RegExp(`${NB}(?:sk|rk)_live_[A-Za-z0-9]{20,}`) },
  { kind: "Stripe publishable key", re: new RegExp(`${NB}pk_live_[A-Za-z0-9]{20,}`), publicByDesign: true },
  { kind: "AWS access key ID", re: new RegExp(`${NB}(?:AKIA|ASIA)[0-9A-Z]{16}(?![0-9A-Za-z])`) },
  { kind: "Google API key", re: new RegExp(`${NB}AIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])`), publicByDesign: true },
  { kind: "GitHub token", re: new RegExp(`${NB}(?:(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}(?![A-Za-z0-9])|github_pat_[A-Za-z0-9_]{22,})`) },
  { kind: "Slack token", re: new RegExp(`${NB}xox[baprs]-\\d{6,}-[A-Za-z0-9-]{8,}`) },
  { kind: "Anthropic API key", re: new RegExp(`${NB}sk-ant-[A-Za-z0-9_-]{24,}`), accept: (t) => looksRandom(t.replace(/^sk-ant-(?:api|admin)\d*-?/, "")) },
  {
    kind: "OpenAI API key",
    re: new RegExp(`${NB}sk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}`),
    accept: (t) => looksRandom(t.replace(/^sk-(?:proj-|svcacct-|admin-)?/, "")),
  },
  { kind: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/ },
  { kind: "Twilio API key", re: new RegExp(`${NB}SK[0-9a-f]{32}(?![0-9a-fA-F])`) },
  { kind: "SendGrid API key", re: new RegExp(`${NB}SG\\.[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}`) },
];

/** Words that mark a value (or the line around it) as an example, not a credential. */
const PLACEHOLDER_LINE = /\b(?:example|placeholder|dummy|redacted|changeme|change_me|sample|fake|lorem)\b|your[_-]|<\s*(?:your|api|secret|token|key)[^>]*>/i;
const PLACEHOLDER_TOKEN = /x{4,}|X{4,}|\*{3,}|\.{3,}|0{8,}|1234567|abcdefgh|example|your|dummy|fake|sample|placeholder|redacted/i;

/** True when this matched token is a stand-in, not a key. */
export function isPlaceholderToken(token: string, line = ""): boolean {
  if (PLACEHOLDER_TOKEN.test(token)) return true;
  if (/(?:^|[_-])test_/.test(token) || /_test_/.test(token)) return true;
  // Very low variety ("sk-aaaaaaaaaaaaaaaaaaaaaaaa") is a filler, not a key.
  if (new Set(token.replace(/^[a-z]+[_-]/i, "")).size < 6) return true;
  return PLACEHOLDER_LINE.test(line);
}

export interface SecretMatch {
  kind: string;
  publicByDesign: boolean;
  /** First 6 characters + length; the report never republishes a credential. */
  redacted: string;
}

/**
 * A Google key (AIza…) is public by design EXCEPT when it is a Gemini / Generative
 * Language key, which grants paid model access and must stay server-side. The format
 * is identical, so the only signal is what the code around it says.
 */
const GOOGLE_AI_CONTEXT = /gemini|generativelanguage|generative[_-]?ai|GOOGLE_AI|google_genai|palm/i;

/** Every credential-format match in the text, one per kind, placeholders removed. */
export function findSecrets(text: string): SecretMatch[] {
  const byKind = new Map<string, SecretMatch>();
  const lines = text.split(/\r?\n/);
  for (const format of SECRET_FORMATS) {
    const re = new RegExp(format.re.source, format.re.flags.includes("g") ? format.re.flags : `${format.re.flags}g`);
    for (const line of lines) {
      for (const m of line.matchAll(re)) {
        const token = m[0];
        if (format.accept && !format.accept(token)) continue;
        if (format.kind === "Private key block" ? PLACEHOLDER_LINE.test(line) : isPlaceholderToken(token, line)) continue;
        let kind = format.kind;
        let publicByDesign = Boolean(format.publicByDesign);
        if (format.kind === "Google API key" && GOOGLE_AI_CONTEXT.test(line)) {
          kind = "Google AI (Gemini) API key";
          publicByDesign = false;
        }
        if (!byKind.has(kind)) byKind.set(kind, { kind, publicByDesign, redacted: `${token.slice(0, 6)}… (${token.length} chars)` });
      }
    }
  }
  return [...byKind.values()];
}
