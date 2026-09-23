/**
 * The client summary board.
 *
 * ⚠️ `summary` is a STATIC segment and therefore wins over `/api/clients/[slug]` in
 * Next's routing — the same precedence `/api/documents/analytics` relies on (§17). A
 * client slugged "summary" would be unreachable through the slug route, which is why
 * `RESERVED_CLIENT_SLUGS` in `server/clients.ts` refuses that name at creation.
 *
 * Scoping is inherited from `listDerivedClients`, so a restricted developer sees their
 * own clients here and no others.
 */
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { loadClientSummaryBoard } from "@/server/client-summary";

export async function GET(req: NextRequest) {
  try {
    const user = await getEffectiveUserOrNull(req);
    return apiOk(await loadClientSummaryBoard(user));
  } catch (err) {
    return fromError(err);
  }
}
