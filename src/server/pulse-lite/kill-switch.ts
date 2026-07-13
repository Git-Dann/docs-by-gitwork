import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";

/** Error carrying a 503 so `fromError` maps it cleanly. */
export class PulseEmbedDisabledError extends Error {
  status = 503;
  constructor(message = "The Pulse scanner is temporarily unavailable.") {
    super(message);
    this.name = "PulseEmbedDisabledError";
  }
}

/** Throws if the workspace has turned off the public Pulse embed. Cheapest possible
 * check — call this first in both public routes, before honeypot/Turnstile/rate-limit. */
export async function assertPulseEmbedEnabled(): Promise<void> {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: { pulseEmbedEnabled: true },
  });
  if (workspace && !workspace.pulseEmbedEnabled) throw new PulseEmbedDisabledError();
}
