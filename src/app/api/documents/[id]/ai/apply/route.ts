/**
 * POST /api/documents/[id]/ai/apply
 *
 * Apply an AI-proposed change after the user clicks Accept. Body: { sectionKey, after }.
 * The `after` value must structurally match the current section's shape — same conservative
 * mergeShape logic the chat endpoint uses.
 *
 * Separate from /ai/chat so the user can review the diff before anything is persisted.
 */

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { proposalInclude, serializeProposal } from "@/server/proposals";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const schema = z.object({
  sectionKey: z.string().min(1),
  after: z.unknown(),
});

function mergeShape(original: unknown, candidate: unknown): unknown | null {
  if (Array.isArray(original)) return Array.isArray(candidate) ? candidate : null;
  if (original !== null && typeof original === "object") {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const result: Record<string, unknown> = { ...(original as Record<string, unknown>) };
    for (const [k, v] of Object.entries(original as Record<string, unknown>)) {
      const next = (candidate as Record<string, unknown>)[k];
      if (next === undefined) {
        result[k] = v;
        continue;
      }
      const merged = mergeShape(v, next);
      result[k] = merged ?? v;
    }
    return result;
  }
  if (candidate === null) return original;
  return typeof candidate === typeof original ? candidate : original;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = schema.parse(await request.json());

    const section = await prisma.documentSection.findFirst({
      where: { documentId: id, key: body.sectionKey },
    });
    if (!section) return apiError("Section not found on document", 404);

    const merged = mergeShape(section.data, body.after);
    if (merged === null) return apiError("Proposed shape is incompatible with current section", 422);

    await prisma.documentSection.update({
      where: { id: section.id },
      data: { data: merged as Prisma.InputJsonValue },
    });

    const fresh = await prisma.document.findUniqueOrThrow({
      where: { id },
      include: proposalInclude,
    });
    return apiOk({ proposal: serializeProposal(fresh) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.issues.map((i) => i.message).join(", "), 400);
    }
    return fromError(error);
  }
}
