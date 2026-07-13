/**
 * Cloudflare Turnstile verification for the public Pulse scan/unlock endpoints.
 *
 * Requires TURNSTILE_SECRET_KEY (server-only) + NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * (client-side widget) — set up in Cloudflare dashboard → Turnstile → Add widget,
 * allow-listing gitwork.co.uk / www.gitwork.co.uk / foundry.gitwork.co.uk.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Error carrying a 400 so `fromError` maps it cleanly. */
export class TurnstileError extends Error {
  status = 400;
  constructor(message = "Verification failed — please try again.") {
    super(message);
    this.name = "TurnstileError";
  }
}

/**
 * Throws if the token is missing/invalid. Fails OPEN (logs a warning, allows the
 * request through) when TURNSTILE_SECRET_KEY isn't configured — so local dev works
 * without real Cloudflare keys, but a missing key in production is noticeable in logs.
 */
export async function assertValidTurnstileToken(token: string | undefined, ip: string | null): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn("[turnstile] TURNSTILE_SECRET_KEY not set — skipping verification (fail-open).");
    return;
  }
  if (!token) throw new TurnstileError();

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch(SITEVERIFY_URL, { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    if (!data.success) throw new TurnstileError();
  } catch (error) {
    if (error instanceof TurnstileError) throw error;
    // Network/parse failure talking to Cloudflare — don't silently let bots through,
    // but don't crash the request path with an opaque 500 either.
    throw new TurnstileError("Couldn't verify you're human — please try again.");
  }
}
