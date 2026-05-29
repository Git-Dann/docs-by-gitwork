/**
 * GET /api/internal/resolve-host?hostname=docs.example.com
 *
 * Internal helper called by middleware to find out whether a given hostname is a verified
 * custom share domain. Returns `{ match: true | false }`.
 *
 * Public-readable but useless without knowing what to do with the answer — it doesn't leak
 * workspace identity or any sensitive data, only the boolean. We don't gate it on API_KEY
 * because the middleware itself doesn't have access to that header path (it's the auth
 * mechanism, not a caller).
 */

import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { findWorkspaceByVerifiedHostname } from "@/server/custom-hostname";

export async function GET(request: NextRequest) {
  try {
    const hostname = request.nextUrl.searchParams.get("hostname")?.trim().toLowerCase();
    if (!hostname) return apiOk({ match: false });

    const ws = await findWorkspaceByVerifiedHostname(hostname);
    return apiOk({ match: Boolean(ws) });
  } catch (error) {
    return fromError(error);
  }
}
