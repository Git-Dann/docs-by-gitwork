/**
 * Server-only DB access for the public Pulse embed config. Kept separate from
 * pulse-embed-config.ts (pure resolvers/defaults, safe to import client-side from
 * pulse-embed-settings.tsx) so that file never pulls in prisma/encryption for the
 * client bundle.
 */

import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { decryptNullable } from "@/lib/encryption";
import { resolveEmbedCheckKeys, resolveBookingUrl } from "@/server/pulse-embed-config";

export interface PulseEmbedWorkspaceConfig {
  enabled: boolean;
  checkKeys: string[];
  bookingUrl: string;
  turnstileSiteKey: string | null;
  turnstileSecretKey: string | null;
}

/** One fetch, used by both public routes + the visitor-email sender — avoids repeating
 * the same workspace lookup per request. */
export async function getPulseEmbedWorkspaceConfig(): Promise<PulseEmbedWorkspaceConfig> {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: {
      pulseEmbedEnabled: true,
      pulseEmbedCheckKeys: true,
      pulseEmbedBookingUrl: true,
      turnstileSiteKey: true,
      turnstileSecretKeyEncrypted: true,
    },
  });
  return {
    enabled: workspace?.pulseEmbedEnabled ?? true,
    checkKeys: resolveEmbedCheckKeys(workspace?.pulseEmbedCheckKeys),
    bookingUrl: resolveBookingUrl(workspace?.pulseEmbedBookingUrl),
    turnstileSiteKey: workspace?.turnstileSiteKey || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null,
    turnstileSecretKey: decryptNullable(workspace?.turnstileSecretKeyEncrypted ?? null) || process.env.TURNSTILE_SECRET_KEY || null,
  };
}
