import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { attachWikiIntakeCommentImage, getWikiIntakeCommentImageBytes } from "@/server/wiki";
import { internalCommentViewer } from "@/server/wiki-comment-viewer";
import { imageResponse, readReplyImageUpload } from "@/server/wiki-reply-image-upload";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string; id: string; commentId: string }> };

/** Attach a screenshot to your own reply (multipart `file`, ≤8MB). */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuthedUser(req);
    const { slug, id, commentId } = await params;
    const upload = await readReplyImageUpload(req);
    if (!upload.ok) return upload.response;
    const comment = await attachWikiIntakeCommentImage(
      { slug },
      id,
      commentId,
      internalCommentViewer(user),
      upload.bytes,
      upload.mime,
      upload.filename,
    );
    if (!comment) return apiError("Reply not found", 404);
    return apiOk(comment);
  } catch (err) {
    return fromError(err);
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { slug, id, commentId } = await params;
    const thumb = new URL(req.url).searchParams.get("thumb") === "1";
    return imageResponse(await getWikiIntakeCommentImageBytes({ slug }, id, commentId, thumb ? "thumb" : "full"));
  } catch (err) {
    return fromError(err);
  }
}
