/**
 * POST /api/dev/encrypt-platform-credentials — one-shot, super-admin only, idempotent.
 *
 * Encrypts any ClientPlatform still holding a plaintext `credentials` blob into the
 * encrypted passwordCipher column and nulls the plaintext. Safe to re-run (a no-op once
 * everything is migrated). Run once after deploying the platform-credential encryption.
 */

import { apiOk, fromError } from "@/lib/api-response";
import { assertSuperAdmin, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { encryptLegacyPlatformCredentials } from "@/server/clients";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    assertSuperAdmin(await getEffectiveUserOrNull(req));
    const result = await encryptLegacyPlatformCredentials();
    return apiOk(result);
  } catch (e) {
    return fromError(e);
  }
}
