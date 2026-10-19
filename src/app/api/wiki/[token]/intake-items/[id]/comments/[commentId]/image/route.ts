import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import {
  attachWikiIntakeCommentImage,
  getWikiIntakeCommentImageBytes,
  resolveWikiIdByPublicToken,
} from "@/server/wiki";
import { wikiAccessCookieName } from "@/server/wiki-access";
import { publicCommentViewer } from "@/server/wiki-comment-viewer";
import { imageResponse, readReplyImageUpload } from "@/server/wiki-reply-image-upload";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string; id: string; commentId: string }> };

/** Attach a screenshot to your own reply from the shared wiki (multipart `file`, ≤8MB). */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { token, id, commentId } = await params;
    const wikiId = await resolveWikiIdByPublicToken(token);
    if (!wikiId) return apiError("Invalid wiki token or reply", 404);
    const upload = await readReplyImageUpload(req);
    if (!upload.ok) return upload.response;
    const viewer = await publicCommentViewer(wikiId, req.cookies.get(wikiAccessCookieName(wikiId))?.value);
    const comment = await attachWikiIntakeCommentImage(
      { token },
      id,
      commentId,
      viewer,
      upload.bytes,
      upload.mime,
      upload.filename,
    );
    if (!comment) return apiError("Invalid wiki token or reply", 404);
    return apiOk(comment);
  } catch (err) {
    return fromError(err);
  }
}

/** Same exposure as the request's own screenshot: anyone holding the wiki token. */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { token, id, commentId } = await params;
    const thumb = new URL(req.url).searchParams.get("thumb") === "1";
    return imageResponse(await getWikiIntakeCommentImageBytes({ token }, id, commentId, thumb ? "thumb" : "full"));
  } catch (err) {
    return fromError(err);
  }
}
