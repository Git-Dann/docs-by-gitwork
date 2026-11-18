/** The team adds screenshots to a card on a client's Board (multipart, `file` fields). */
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { addBoardCardImages } from "@/server/wiki-board";
import { readBoardImageForm, resolveInternalBoardWriter } from "@/server/wiki-board-access";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; taskId: string }> }) {
  try {
    const { slug, taskId } = await params;
    const writer = await resolveInternalBoardWriter(req, slug, "write");
    const files = await readBoardImageForm(req);
    return apiOk({ card: await addBoardCardImages(writer, taskId, files) }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
