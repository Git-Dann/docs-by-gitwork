import { NextRequest } from "next/server";
import { apiError, fromError } from "@/lib/api-response";
import { getDocumentFileByToken } from "@/server/wiki-documents";

export const maxDuration = 60;

// Public download of an uploaded wiki document — the share token in the URL is
// the auth (validated server-side: the doc must belong to that wiki). Under
// /api/wiki, which is a PUBLIC_API_PATH.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  try {
    const { token, id } = await params;
    const file = await getDocumentFileByToken(token, id);
    if (!file) return apiError("File not found", 404);
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.fileName)}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (err) {
    return fromError(err);
  }
}
