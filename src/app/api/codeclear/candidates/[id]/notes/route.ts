import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { candidateNoteSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { workspace, user } = await ensureBaseRecords();
    const { id } = await context.params;
    const body = candidateNoteSchema.parse(await request.json());
    const existing = await prisma.candidate.findFirst({
      where: {
        id,
        workspaceId: workspace.id,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return apiError("Candidate not found.", 404);
    }

    const note = await prisma.note.create({
      data: {
        candidateId: existing.id,
        body: body.body,
        createdBy: user.name ?? user.email,
      },
    });

    await prisma.activityLog.create({
      data: {
        candidateId: existing.id,
        eventType: "NOTE_ADDED",
        metadata: {
          by: user.name ?? user.email,
        },
      },
    });

    return apiOk({
      note: {
        ...note,
        createdAt: note.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
