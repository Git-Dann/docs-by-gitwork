// PATCH /api/settings/docs-backup → { docsBackupEnabled: boolean }
// Master switch (Super Admin only) for backing up Docs + client archives to the connected
// backup Google account's Drive. When off, the daily docs-gdrive-backup cron and the client
// "Archive to Drive" job both no-op. Mirrors /api/settings/dev-rates.

import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser, assertSuperAdmin } from "@/server/auth/effective-user";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";

export const dynamic = "force-dynamic";

const patchSchema = z.object({ docsBackupEnabled: z.boolean() });

export async function PATCH(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    assertSuperAdmin(user);
    const { docsBackupEnabled } = patchSchema.parse(await req.json());
    await prisma.workspace.update({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      data: { docsBackupEnabled },
    });
    return apiOk({ docsBackupEnabled });
  } catch (e) {
    return fromError(e);
  }
}
