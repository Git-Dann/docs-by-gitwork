/**
 * client-devices.ts — a CLIENT's phones.
 *
 * The twin of `devices.ts`, which holds the Gitwork team's. See the note on
 * `ClientDeviceToken` in the schema for why these are two tables and not one
 * nullable column, and `push/transport.ts` for the half that IS shared.
 */

import { prisma } from "@/lib/prisma";
import type { DeviceStore } from "./transport";

export type ClientDeviceTokenInput = {
  clientWikiUserId: string;
  wikiId: string;
  token: string;
  environment: "sandbox" | "production";
  appBuild?: string | null;
  appVersion?: string | null;
};

export type ClientDeviceTokenRecord = {
  id: string;
  clientWikiUserId: string;
  wikiId: string;
  token: string;
  environment: string;
  platform: string;
  createdAt: Date;
  lastUsedAt: Date;
  failedAt: Date | null;
};

/**
 * Upsert by token.
 *
 * ⚠️ The owner AND the wiki are both rewritten on conflict, and that pairing is
 * the security property. One phone can be handed between people, and a client
 * user who signs out and a different one who signs in on the same device must not
 * share an inbox — re-registering MOVES the token rather than adding a second row,
 * so the previous owner's wiki stops reaching that handset the moment someone else
 * signs in on it.
 */
export async function registerClientDeviceToken(
  input: ClientDeviceTokenInput,
): Promise<ClientDeviceTokenRecord> {
  const row = await prisma.clientDeviceToken.upsert({
    where: { token: input.token },
    update: {
      clientWikiUserId: input.clientWikiUserId,
      wikiId: input.wikiId,
      environment: input.environment,
      appBuild: input.appBuild ?? null,
      appVersion: input.appVersion ?? null,
      lastUsedAt: new Date(),
      failedAt: null, // a re-registered device is alive again
    },
    create: {
      clientWikiUserId: input.clientWikiUserId,
      wikiId: input.wikiId,
      token: input.token,
      platform: "ios",
      environment: input.environment,
      appBuild: input.appBuild ?? null,
      appVersion: input.appVersion ?? null,
    },
  });
  return row as ClientDeviceTokenRecord;
}

/**
 * Every live phone belonging to anyone signed in to this wiki.
 *
 * ⚠️ Scoped by `wikiId`, never by client name or slug. One wiki is one client's
 * portal, and a push that leaked across that boundary would show one client another
 * client's delivery update — the single worst thing this feature could do.
 */
export async function listActiveClientDevices(wikiId: string): Promise<ClientDeviceTokenRecord[]> {
  const rows = await prisma.clientDeviceToken.findMany({
    where: { wikiId, failedAt: null },
    orderBy: { lastUsedAt: "desc" },
  });
  return rows as ClientDeviceTokenRecord[];
}

/**
 * One client PERSON's devices in one wiki.
 *
 * ⚠️ Scoped to the user, not the wiki, and that is the whole point of having it.
 * `listActiveClientDevices` returns every phone on the client — correct for a
 * standup, which is addressed to the client as a whole, and wrong for a mention,
 * which is addressed to one named person. Fanning a mention out to the wiki would
 * ring a colleague's phone to tell them someone else was mentioned, and would
 * leak who is talking to whom inside the client's own team.
 */
export async function listActiveClientDevicesForUser(
  wikiId: string,
  clientWikiUserId: string,
): Promise<ClientDeviceTokenRecord[]> {
  const rows = await prisma.clientDeviceToken.findMany({
    where: { wikiId, clientWikiUserId, failedAt: null },
    orderBy: { lastUsedAt: "desc" },
  });
  return rows as ClientDeviceTokenRecord[];
}

export async function markClientDeviceFailed(token: string): Promise<void> {
  await prisma.clientDeviceToken.updateMany({ where: { token }, data: { failedAt: new Date() } });
}

export async function markClientDeviceUsed(token: string): Promise<void> {
  await prisma.clientDeviceToken.updateMany({ where: { token }, data: { lastUsedAt: new Date() } });
}

export async function correctClientDeviceEnvironment(
  token: string,
  environment: string,
): Promise<void> {
  await prisma.clientDeviceToken.updateMany({
    where: { token },
    data: { environment, failedAt: null },
  });
}

/**
 * Hard delete on explicit sign-out.
 *
 * Scoped to the owner so one client user cannot unregister another's device by
 * guessing a token, and so a stale call after a handover cannot silence the phone's
 * new owner.
 */
export async function unregisterClientDeviceToken(
  clientWikiUserId: string,
  token: string,
): Promise<void> {
  await prisma.clientDeviceToken.deleteMany({ where: { clientWikiUserId, token } });
}

/** The client audience's write-backs, for `fanOutToDevices`. */
export const clientDeviceStore: DeviceStore = {
  markUsed: markClientDeviceUsed,
  markFailed: markClientDeviceFailed,
  correctEnvironment: correctClientDeviceEnvironment,
};
