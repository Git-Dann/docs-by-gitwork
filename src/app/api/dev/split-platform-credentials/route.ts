/**
 * POST /api/dev/split-platform-credentials — one-shot, super-admin only, idempotent.
 *
 * Splits platform credential blobs that landed merged in passwordCipher (email + password
 * together, from the legacy free-text field) into separate usernameCipher + passwordCipher.
 * Only touches rows with no username yet and only when the split is unambiguous (an email plus a
 * single-token password); multi-value blobs are left intact for manual review. Safe to re-run.
 */

import { apiOk, fromError } from "@/lib/api-response";
import { assertSuperAdmin, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { splitPlatformCredentials } from "@/server/clients";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    assertSuperAdmin(await getEffectiveUserOrNull(req));
    const result = await splitPlatformCredentials();
    return apiOk(result);
  } catch (e) {
    return fromError(e);
  }
}
