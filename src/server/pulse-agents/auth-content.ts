export interface AuthenticatedPageSignals {
  pageTitle: string | null;
  h1: string | null;
  navItems: string[];
  authenticatedUrl: string;
}

const REDACTIONS: ReadonlyArray<[RegExp, string]> = [
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]"],
  [/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, "[REDACTED_PHONE]"],
  [/\b(?:\d[ -]*?){13,19}\b/g, "[REDACTED_PAYMENT_CARD]"],
  [/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED_TOKEN]"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]"],
  [/\b(?:sk|pk|api|key|token|secret)[_-][A-Za-z0-9_-]{12,}\b/gi, "[REDACTED_SECRET]"],
  [/\b(password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED_SECRET]"],
];

export function redactAuthenticatedText(value: string, maxLength = 240): string {
  let redacted = value.replace(/\s+/g, " ").trim();
  for (const [pattern, replacement] of REDACTIONS) redacted = redacted.replace(pattern, replacement);
  return redacted.slice(0, maxLength);
}

function sanitiseAuthenticatedUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "[REDACTED_URL]";
  }
}

/**
 * Reduce an authenticated page to bounded classification signals. Raw body text,
 * form values, query strings and fragments never leave the browser process.
 */
export function summariseAuthenticatedPage(signals: AuthenticatedPageSignals): AuthenticatedPageSignals {
  return {
    pageTitle: signals.pageTitle ? redactAuthenticatedText(signals.pageTitle, 160) : null,
    h1: signals.h1 ? redactAuthenticatedText(signals.h1, 160) : null,
    navItems: signals.navItems
      .map((item) => redactAuthenticatedText(item, 80))
      .filter(Boolean)
      .slice(0, 10),
    authenticatedUrl: sanitiseAuthenticatedUrl(signals.authenticatedUrl),
  };
}
