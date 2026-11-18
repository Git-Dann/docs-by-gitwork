/**
 * A card's image on the client's Board: GET, `?thumb=1` for the small version.
 * Same access as the card's thread (resolveBoardWriter → boardCardImage). Served as an image only:
 * nosniff, and a sandboxing CSP in case the stored type is ever wrong.
 */
import { NextRequest, NextResponse } from "next/server";
import { apiError, fromError } from "@/lib/api-response";
import { boardCardImage } from "@/server/wiki-board";
import { boardAccessError, resolveBoardWriter } from "@/server/wiki-board-access";

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
