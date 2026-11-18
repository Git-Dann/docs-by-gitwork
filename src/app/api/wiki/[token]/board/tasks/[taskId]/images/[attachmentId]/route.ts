/**
 * A card's image on the client's Board.
 *   GET    the image, `?thumb=1` for the small version.
 *   DELETE takes it off the card (resolveBoardWriter + the write rate limit → removeBoardCardImage:
 *          the image must be on THIS card, the card one the client may act on).
 * Same access as the card's thread (resolveBoardWriter → boardCardImage). Served as an image only:
 * nosniff, and a sandboxing CSP in case the stored type is ever wrong.
 */
import { NextRequest, NextResponse } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { boardCardImage, removeBoardCardImage } from "@/server/wiki-board";
import { assertBoardWriteRate, boardAccessError, resolveBoardWriter } from "@/server/wiki-board-access";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; taskId: string; attachmentId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { token, taskId, attachmentId } = await params;
    const access = await resolveBoardWriter(req, token);
    if (!access.ok) {
      const { message, status } = boardAccessError(access.reason);
      return apiError(message, status);
    }
    const thumb = req.nextUrl.searchParams.get("thumb") === "1";
    const { bytes, mime } = await boardCardImage(access.writer, taskId, attachmentId, thumb ? "thumb" : "full");
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { token, taskId, attachmentId } = await params;
    const access = await resolveBoardWriter(req, token);
    if (!access.ok) {
      const { message, status } = boardAccessError(access.reason);
      return apiError(message, status);
    }
    await assertBoardWriteRate(req);
    return apiOk({ card: await removeBoardCardImage(access.writer, taskId, attachmentId) });
  } catch (err) {
    return fromError(err);
  }
}
