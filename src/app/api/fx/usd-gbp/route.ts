import { apiError, apiOk, fromError } from "@/lib/api-response";
import { getUsdToGbpRate } from "@/server/fx";

export const dynamic = "force-dynamic";

/**
 * GET /api/fx/usd-gbp
 *
 * Returns the latest USD → GBP rate (ECB via Frankfurter). The upstream is
 * cached server-side for 12 hours, so this endpoint stays cheap even under
 * polling. Returns 503 when the source is unreachable so the client can
 * fall back to "USD only" instead of rendering a stale guess.
 */
export async function GET() {
  try {
    const rate = await getUsdToGbpRate();
    if (!rate) return apiError("Exchange rate unavailable", 503);
    return apiOk(rate);
  } catch (error) {
    return fromError(error);
  }
}
