import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { syncPendingDocusealSubmissions } from "@/server/docuseal-sync";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const documentId = typeof body.documentId === "string" ? body.documentId : undefined;
    const updated = await syncPendingDocusealSubmissions(documentId ? [documentId] : undefined);
    return apiOk({ updated });
  } catch (error) {
    return fromError(error);
  }
}
