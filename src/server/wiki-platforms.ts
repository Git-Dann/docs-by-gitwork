/**
 * wiki-platforms.ts — the client's platforms from Portal, as links in their wiki.
 *
 * ⚠️ Links only. `ClientPlatform` also carries logins (encrypted usernames and passwords)
 * and internal notes. Neither is selected here, so neither can reach the wiki DTO: a share
 * link is a token in a URL, and passwords on that page would be one forwarded email away
 * from anyone. Dan's call (Oct 2026): logins stay in Portal.
 */

import { prisma } from "@/lib/prisma";
import { EMPTY_PLATFORMS, toWikiPlatform, type WikiPlatformsSection } from "@/lib/wiki-platforms";

export async function loadWikiPlatforms(clientId: string): Promise<WikiPlatformsSection> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: { platformsEnabled: true },
  });
  if (!wiki?.platformsEnabled) return EMPTY_PLATFORMS;

  const rows = await prisma.clientPlatform.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
    // An explicit select — never an include — so logins, credential ciphers and notes are
    // not even loaded. A test pins this.
    select: {
      id: true,
      name: true,
      platformType: true,
      url: true,
      stagingUrl: true,
      repoUrl: true,
      links: true,
      renewsOn: true,
      renewalNote: true,
    },
  });
  return { enabled: true, platforms: rows.map(toWikiPlatform) };
}

export async function setWikiPlatformsEnabled(clientId: string, enabled: boolean): Promise<void> {
  await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId, platformsEnabled: enabled },
    update: { platformsEnabled: enabled },
    select: { id: true },
  });
}
