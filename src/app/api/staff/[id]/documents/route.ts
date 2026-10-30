/**
 * GET  /api/staff/[id]/documents — the documents on a person's record that the viewer may
 *      see, the required checklist (person and HR), and which types they may add.
 * POST /api/staff/[id]/documents — add a file (multipart: `file`, `type`, `title`,
 *      `expiresOn`, `visibility`). HR adds any type; the person adds a type HR allows or
 *      asked for, and it waits to be checked. Rules: src/lib/hr-documents.ts.
 */

import { apiOk, fromError } from "@/lib/api-response";
import { LAUNCHPAD_FILE_MAX_BYTES } from "@/lib/launchpad/files";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { addDocumentFile, listDocuments } from "@/server/hr/documents";
import { StaffInputError } from "@/server/staff";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    return apiOk(await listDocuments(user, id));
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new StaffInputError("Send the file as multipart/form-data in a `file` field.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new StaffInputError("Missing `file` field in the upload.");
    // Checked on the declared size before buffering, then on the real bytes when classified.
    if (file.size > LAUNCHPAD_FILE_MAX_BYTES) {
      throw new StaffInputError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB; attach a Drive link instead.`);
    }
    const text = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" ? v : undefined;
    };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await addDocumentFile(
      user,
      id,
      { name: file.name, size: bytes.byteLength, bytes },
      { type: text("type"), title: text("title"), expiresOn: text("expiresOn"), visibility: text("visibility") },
    );
    return apiOk(doc, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
