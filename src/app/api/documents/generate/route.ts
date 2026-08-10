/**
 * AI Document Generator API Endpoint.
 *
 *   POST /api/documents/generate -> Uploads reference document/brief, extracts facts via AI,
 *                                  maps to selected document type template, and creates document.
 */

import { NextRequest } from "next/server";
import type { DocumentType } from "@prisma/client";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { generateDocumentFromIntake } from "@/server/ai-document-generator";
import { assertCan, canManageDocs, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { extractIntakeText } from "@/server/file-intake";

export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const actor = await getEffectiveUserOrNull(request);
    assertCan(actor, canManageDocs, "create AI documents");

    const contentType = request.headers.get("content-type") || "";

    let documentType: DocumentType = "NDA";
    let title: string | undefined;
    let briefText: string | undefined;
    let fileBuffer: Buffer | undefined;
    let filename: string | undefined;
    let mimeType: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      documentType = ((formData.get("documentType") as string) || "NDA") as DocumentType;
      title = (formData.get("title") as string) || undefined;
      briefText = (formData.get("brief") as string) || undefined;

      const file = formData.get("file") as File | null;
      if (file && file.size > 0) {
        filename = file.name;
        mimeType = file.type;
        const arrayBuffer = await file.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuffer);
      }
    } else {
      const json = await request.json();
      documentType = (json.documentType || "NDA") as DocumentType;
      title = json.title || undefined;
      briefText = json.brief || undefined;
    }

    // Extract text from intake input
    const intakeResult = extractIntakeText({
      filename,
      mimeType,
      buffer: fileBuffer,
      textBrief: briefText,
    });

    if (!intakeResult.extractedText && !briefText) {
      return apiError("Please provide a text brief or upload a reference document.", 400);
    }

    // Load workspace with AI provider fields
    const workspace = await prisma.workspace.findFirstOrThrow({
      select: {
        id: true,
        aiProvider: true,
        anthropicApiKey: true,
        anthropicModel: true,
        openaiApiKey: true,
        openaiModel: true,
        geminiApiKey: true,
        geminiModel: true,
        localLlmUrl: true,
        localLlmModel: true,
      },
    });

    // Generate document via AI engine
    const result = await generateDocumentFromIntake({
      extractedText: intakeResult.extractedText,
      documentType,
      workspace,
      actor,
      customTitle: title,
    });

    return apiOk(result, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
