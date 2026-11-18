/**
 * The team adds a key date to a client's Board Schedule from the internal wiki: a developer or
 * above who can open this client (src/server/wiki-board-access.ts). CLAUDE.md §128.
 */
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { createKeyDate } from "@/server/wiki-board-key-dates";
import { resolveInternalBoardWriter } from "@/server/wiki-board-access";
import { boardKeyDateCreateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const writer = await resolveInternalBoardWriter(req, slug, "write");
    const body = boardKeyDateCreateSchema.parse(await req.json());
    return apiOk({ keyDate: await createKeyDate(writer, body) });
  } catch (err) {
    return fromError(err);
  }
}
