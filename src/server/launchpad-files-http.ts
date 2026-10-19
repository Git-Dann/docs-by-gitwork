/**
 * The HTTP edges of Launchpad file uploads, shared by the internal (slug) and the
 * client-facing (token) routes so the two can never disagree about what a valid
 * upload is or how a download is served.
 *
 * Validation itself lives in `classifyLaunchpadUpload` and runs inside
 * `attachLaunchpadItemFile`; this only reads the multipart body (refusing an
 * oversized one BEFORE buffering it) and shapes the download.
 */

import { NextResponse } from "next/server";
import {
  attachmentDisposition,
  LAUNCHPAD_FILE_MAX_BYTES,
  LaunchpadUploadError,
} from "@/lib/launchpad/files";

/** Read the `file` field of a multipart upload. Every failure is a 400. */
export async function readLaunchpadUpload(
  req: Request,
): Promise<{ filename: string | null; bytes: Uint8Array }> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new LaunchpadUploadError("Send the file as multipart/form-data in a `file` field.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new LaunchpadUploadError("Missing `file` field in the upload.");
  }
  // Checked on the declared size before buffering, then again on the real bytes
  // inside `classifyLaunchpadUpload` — a client can lie about the first.
  if (file.size > LAUNCHPAD_FILE_MAX_BYTES) {
    throw new LaunchpadUploadError(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 10 MB. Share a link instead for anything larger.`,
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { filename: file.name || null, bytes };
}

/**
 * Serve one file. Always an ATTACHMENT, with `nosniff` and a sandboxing CSP, so even
 * a file that somehow got past the sniff can never render as a page on our origin.
 */
export function launchpadFileResponse(file: {
  bytes: Buffer;
  mime: string;
  filename: string;
}): NextResponse {
  const body = file.bytes.buffer.slice(
    file.bytes.byteOffset,
    file.bytes.byteOffset + file.bytes.byteLength,
  ) as ArrayBuffer;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.bytes.byteLength),
      "Content-Disposition": attachmentDisposition(file.filename),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
