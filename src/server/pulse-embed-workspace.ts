/**
 * Server-only DB access for the public Pulse embed config. Kept separate from
 * pulse-embed-config.ts (pure resolvers/defaults, safe to import client-side from
 * pulse-embed-settings.tsx) so that file never pulls in prisma/encryption for the
 * client bundle.
 */

import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { decryptNullable } from "@/lib/encryption";
import { resolveBookingUrl } from "@/server/pulse-embed-config";
import { CHECKS_REGISTRY } from "@/server/checks-registry";
import { normaliseFreeKeys } from "@/lib/pulse-free-tier";

const KNOWN_CHECK_KEYS: ReadonlySet<string> = new Set(CHECKS_REGISTRY.map((c) => c.key));

export interface PulseEmbedWorkspaceConfig {
  enabled: boolean;
  bookingUrl: string;
  turnstileSiteKey: string | null;
  turnstileSecretKey: string | null;
  /**
   * Checks shown in full on the free tier. `null` = no limit. See lib/pulse-free-tier.ts.
   */
  freeCheckKeys: string[] | null;
}

/** One fetch, used by both public routes + the visitor-email sender — avoids repeating
 * the same workspace lookup per request. */
export async function getPulseEmbedWorkspaceConfig(): Promise<PulseEmbedWorkspaceConfig> {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: {
      pulseEmbedEnabled: true,
      pulseEmbedBookingUrl: true,
      turnstileSiteKey: true,
      turnstileSecretKeyEncrypted: true,
      pulseEmbedCheckKeys: true,
    },
  });
  return {
    enabled: workspace?.pulseEmbedEnabled ?? true,
    bookingUrl: resolveBookingUrl(workspace?.pulseEmbedBookingUrl),
    turnstileSiteKey: workspace?.turnstileSiteKey || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null,
    freeCheckKeys: normaliseFreeKeys(workspace?.pulseEmbedCheckKeys, KNOWN_CHECK_KEYS),
    turnstileSecretKey: decryptNullable(workspace?.turnstileSecretKeyEncrypted ?? null) || process.env.TURNSTILE_SECRET_KEY || null,
  };
}
