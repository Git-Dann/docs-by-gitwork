/**
 * POST /api/dev/migrate-platform-logins — one-shot, super-admin only, idempotent.
 *
 * Moves each platform's row-level credentials (usernameCipher/passwordCipher, or the legacy
 * plaintext blob) into a single ClientPlatformLogin, then nulls the row-level fields. Only touches
 * platforms with no logins yet. Run once after deploying the multi-login feature. Safe to re-run.
 */

import { apiOk, fromError } from "@/lib/api-response";
import { assertSuperAdmin, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { migratePlatformLogins } from "@/server/clients";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    assertSuperAdmin(await getEffectiveUserOrNull(req));
    const result = await migratePlatformLogins();
    return apiOk(result);
  } catch (e) {
    return fromError(e);
  }
}
