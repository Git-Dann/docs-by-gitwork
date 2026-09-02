import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { addWikiIntakeComment } from "@/server/wiki";

const bodySchema = z.object({ body: z.string().trim().min(1).max(10_000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const { body } = bodySchema.parse(await req.json());
    const comment = await addWikiIntakeComment(
      id,
      { userId: user.id, name: user.name ?? user.email },
      body,
    );
    return apiOk(comment, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
