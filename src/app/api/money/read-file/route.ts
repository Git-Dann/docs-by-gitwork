import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ForbiddenError, canGenerateAi, canViewClientFinancials, requireAuthedUser } from "@/server/auth/effective-user";
import { DealError, readDealFile } from "@/server/money-deals";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** POST multipart `file` — read a PDF or Word file into a deal draft. Saves nothing. */
export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    if (!canViewClientFinancials(user)) throw new ForbiddenError("You don't have access to Money.");
    if (!canGenerateAi(user)) throw new ForbiddenError("Reading files uses AI, which you don't have access to.");
    const size = Number(req.headers.get("content-length") ?? "0");
    if (size > 11 * 1024 * 1024) return apiError("Files up to 10 MB, please.", 413);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return apiError("Choose a file.", 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    return apiOk(await readDealFile(user, { name: file.name, type: file.type, bytes }));
  } catch (err) {
    if (err instanceof DealError) return apiError(err.message, 400);
    return fromError(err);
  }
}
