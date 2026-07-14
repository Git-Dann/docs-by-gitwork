import { apiOk, fromError } from "@/lib/api-response";
import { getPulseEmbedWorkspaceConfig } from "@/server/pulse-embed-workspace";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/pulse/config  (PUBLIC — no API key)
 * What the /embed/pulse widget needs before it can render its forms: the Turnstile
 * site key (public, safe to expose) and the "Book a call" CTA link. Never returns
 * the Turnstile secret or `enabled` — the widget finds out about the kill-switch
 * from the scan/unlock routes' own 503, not by pre-checking here.
 */
export async function GET() {
  try {
    const config = await getPulseEmbedWorkspaceConfig();
    return apiOk({
      turnstileSiteKey: config.turnstileSiteKey,
      bookingUrl: config.bookingUrl,
    });
  } catch (error) {
    return fromError(error);
  }
}
