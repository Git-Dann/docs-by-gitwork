/**
 * POST /api/docs/[token]/events
 *
 * Public, token-gated. Ingests a batch of per-section dwell deltas for a visit (resolved by the
 * sessionId the view beacon already established). The public page accumulates time-on-section via
 * an IntersectionObserver and flushes here on pagehide / tab-hide (sendBeacon → JSON body).
 *
 * dwellMs values are DELTAS since the last flush (server increments); maxScrollPct is the
 * cumulative deepest scroll (server overwrites). durationMs is the cumulative total visible time.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { recordSectionDwell } from "@/server/document-analytics";

const eventsSchema = z.object({
  sessionId: z.string().min(8).max(64),
  durationMs: z.number().int().nonnegative().max(86_400_000).optional(), // cap at 24h of noise
  sections: z
    .array(
      z.object({
        sectionKey: z.string().min(1).max(80),
        sectionTitle: z.string().max(200).nullish(),
        dwellMs: z.number().int().nonnegative().max(86_400_000),
        maxScrollPct: z.number().min(0).max(100).nullish(),
      }),
    )
    .max(100)
    .default([]),
});

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    if (!token || token.length < 16) return apiError("Bad token", 400);

    const doc = await prisma.document.findFirst({
      where: { shareToken: token, isShared: true, archivedAt: null },
      select: { id: true },
    });
    if (!doc) return apiError("Not shared", 404);

    const payload = eventsSchema.parse(await request.json());

    await recordSectionDwell({
      documentId: doc.id,
      sessionId: payload.sessionId,
      durationMs: payload.durationMs ?? null,
      sections: payload.sections.map((s) => ({
        sectionKey: s.sectionKey,
        sectionTitle: s.sectionTitle ?? null,
        dwellMs: s.dwellMs,
        maxScrollPct: s.maxScrollPct ?? null,
      })),
    });

    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
