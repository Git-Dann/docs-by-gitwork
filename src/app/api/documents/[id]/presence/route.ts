/**
 * Lightweight "who's editing this doc right now" presence (P1.8).
 *
 *   POST  /api/documents/[id]/presence   — heartbeat from the editor every ~8s. Body:
 *                                          { sessionId, userName }. Upserts the row + updates
 *                                          lastSeenAt.
 *   GET   /api/documents/[id]/presence   — list operators seen in the last 30s (avatar bubbles).
 *
 * Not real-time collaboration. Just a "saw you" log so workspace operators know when a teammate
 * has the doc open.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const heartbeatSchema = z.object({
  sessionId: z.string().min(1).max(80),
  userName: z.string().min(1).max(120).optional(),
});

const PRESENCE_TTL_MS = 30_000;

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = heartbeatSchema.parse(await request.json());

    // Identify the real signed-in operator so "editing now" shows the actual teammate, not the
    // bootstrap workspace-owner placeholder. Falls back to ensureBaseRecords() only for requests
    // with no session at all (e.g. a direct API-key call with no user context).
    const actor = await getEffectiveUserOrNull(request);
    const user = actor ?? (await ensureBaseRecords()).user;

    const userName = body.userName?.trim() || user.name || user.email;

    await prisma.editorPresence.upsert({
      where: { documentId_sessionId: { documentId: id, sessionId: body.sessionId } },
      update: { userName, lastSeenAt: new Date() },
      create: {
        documentId: id,
        sessionId: body.sessionId,
        userName,
        userId: user.id,
      },
    });

    return apiOk({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.issues.map((i) => i.message).join(", "), 400);
    }
    return fromError(error);
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const cutoff = new Date(Date.now() - PRESENCE_TTL_MS);

    const active = await prisma.editorPresence.findMany({
      where: { documentId: id, lastSeenAt: { gte: cutoff } },
      orderBy: { lastSeenAt: "desc" },
      select: { sessionId: true, userName: true, userId: true, lastSeenAt: true },
    });

    // Dedupe by userName so two tabs from the same person collapse into one bubble.
    const seen = new Set<string>();
    const dedup = active.filter((p) => {
      const key = p.userName.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return apiOk({ active: dedup });
  } catch (error) {
    return fromError(error);
  }
}
