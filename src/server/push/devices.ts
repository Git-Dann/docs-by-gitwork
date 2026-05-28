// Device token persistence + retrieval. Thin wrapper around Prisma; the
// `failedAt` column is the soft-delete signal used by APNs failure handling
// in notifications.ts (BadDeviceToken / Unregistered → mark failed, don't
// hard-delete so we can debug if a device re-registers).

import { prisma } from "@/lib/prisma";

export type DeviceTokenInput = {
  userId: string;
  token: string;
  environment: "sandbox" | "production";
  appBuild?: string | null;
  appVersion?: string | null;
};

export type DeviceTokenRecord = {
  id: string;
  userId: string;
  token: string;
  environment: "sandbox" | "production";
  platform: string;
  appBuild: string | null;
  appVersion: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  failedAt: Date | null;
};

/**
 * Upsert by token. The (userId, token) pair shouldn't really change on the
 * same device (APNs tokens are stable for the lifetime of an install) but a
 * sign-out + sign-in with a different user on the same device is possible —
 * in that case we move the token to the new user.
 */
export async function registerDeviceToken(input: DeviceTokenInput): Promise<DeviceTokenRecord> {
  const row = await prisma.deviceToken.upsert({
    where: { token: input.token },
    update: {
      userId: input.userId,
      environment: input.environment,
      appBuild: input.appBuild ?? null,
      appVersion: input.appVersion ?? null,
      lastUsedAt: new Date(),
      failedAt: null, // resurrect a previously-failed token if it re-registers
    },
    create: {
      userId: input.userId,
      token: input.token,
      platform: "ios",
      environment: input.environment,
      appBuild: input.appBuild ?? null,
      appVersion: input.appVersion ?? null,
    },
  });
  return row as DeviceTokenRecord;
}

/**
 * Returns active (non-failed) device tokens for a user across all their
 * devices. Used to fan out a push to a single recipient on every device they
 * have the app installed on (iPhone + iPad in future).
 */
export async function listActiveDeviceTokensForUser(userId: string): Promise<DeviceTokenRecord[]> {
  const rows = await prisma.deviceToken.findMany({
    where: { userId, failedAt: null },
    orderBy: { lastUsedAt: "desc" },
  });
  return rows as DeviceTokenRecord[];
}

/**
 * Returns active device tokens for every member of a workspace. Used by
 * monitor-triggered (i.e. system-triggered) pushes that don't have a single
 * recipient.
 */
export async function listActiveDeviceTokensForWorkspace(workspaceId: string): Promise<DeviceTokenRecord[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: { userId: true },
  });
  if (memberships.length === 0) return [];
  const userIds = memberships.map((m) => m.userId);
  const rows = await prisma.deviceToken.findMany({
    where: { userId: { in: userIds }, failedAt: null },
    orderBy: { lastUsedAt: "desc" },
  });
  return rows as DeviceTokenRecord[];
}

/**
 * Soft-delete: mark token as failed without removing the row. Lets us see
 * "this device used to be registered" in admin queries and avoids re-sending
 * to dead tokens. A subsequent register() call (e.g. user reinstalls) wipes
 * `failedAt` and the token is live again.
 */
export async function markDeviceTokenFailed(token: string): Promise<void> {
  await prisma.deviceToken.updateMany({
    where: { token },
    data: { failedAt: new Date() },
  });
}

/**
 * Bump lastUsedAt after a successful send. Helps spot stale tokens in admin.
 */
export async function markDeviceTokenUsed(token: string): Promise<void> {
  await prisma.deviceToken.updateMany({
    where: { token },
    data: { lastUsedAt: new Date() },
  });
}

/**
 * Hard delete — called from DELETE /api/devices/me on explicit user sign-out.
 */
export async function unregisterDeviceToken(userId: string, token: string): Promise<void> {
  await prisma.deviceToken.deleteMany({
    where: { userId, token },
  });
}
