/**
 * AI chat session persistence.
 *
 *   GET /api/documents/[id]/ai/session  → load the persisted chat (or { messages: [] })
 *   PUT /api/documents/[id]/ai/session  → upsert the chat with the full message array
 *
 * One session per document — the model is `@unique` on documentId. The PUT body replaces the
 * stored messages wholesale rather than appending; the AiChatPanel is the source of truth for
 * the conversation shape and just round-trips the array on each turn.
 *
 * We don't persist proposal diffs — those are already applied (accepted) or discarded
 * (rejected) by the time the next turn fires. Only the prose user / assistant text is kept so
 * the model has context on subsequent turns.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const messageSchema = z.object({
  id: z.string().min(1).max(64),
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(20_000),
  createdAt: z.string().optional(),
});

const putSchema = z.object({
  messages: z.array(messageSchema).max(200),
});

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const doc = await prisma.document.findUnique({ where: { id }, select: { id: true } });
    if (!doc) return apiError("Document not found", 404);

    const session = await prisma.documentAiSession.findUnique({
      where: { documentId: id },
      select: { messages: true, updatedAt: true },
    });

    return apiOk({
      messages: (session?.messages as unknown) ?? [],
      updatedAt: session?.updatedAt?.toISOString() ?? null,
    });
  } catch (error) {
    return fromError(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const doc = await prisma.document.findUnique({ where: { id }, select: { id: true } });
    if (!doc) return apiError("Document not found", 404);

    const body = putSchema.parse(await request.json());

    const session = await prisma.documentAiSession.upsert({
      where: { documentId: id },
      create: {
        documentId: id,
        messages: body.messages as never,
      },
      update: {
        messages: body.messages as never,
      },
      select: { updatedAt: true },
    });

    return apiOk({ updatedAt: session.updatedAt.toISOString() });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.issues.map((i) => i.message).join(", "), 400);
    }
    return fromError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    await prisma.documentAiSession.deleteMany({ where: { documentId: id } });
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
