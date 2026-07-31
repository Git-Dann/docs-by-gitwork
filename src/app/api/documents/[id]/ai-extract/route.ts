import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { assertCan, canManageDocs, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { proposalInclude, serializeProposal } from "@/server/proposals";
import { extractMsaFieldsFromText } from "@/server/ai/extract-msa-fields";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageDocs, "extract document AI fields");

    const { id } = await context.params;
    if (!id) return apiError("Missing document id", 400);

    const document = await prisma.document.findUnique({
      where: { id },
      include: proposalInclude,
    });

    if (!document) return apiError("Document not found", 404);

    const serialized = serializeProposal(document);

    // Build the proposal link URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://staging.foundry.gitwork.tech";
    const proposalLink = `${baseUrl}/docs/${document.shareToken || document.id}`;

    // Concatenate document title, document number, timeline phases, and section texts
    const sectionTexts = (serialized.sections || []).map((s) => {
      const dataStr = JSON.stringify(s.data || {});
      return `Section: ${s.title}\nDescription: ${s.description || ""}\nContent: ${dataStr}`;
    });

    const costTexts = (serialized.costLineItems || []).map(
      (c) => `${c.itemName} (${c.category}): £${c.subtotal} ${c.description ? `- ${c.description}` : ""}`
    );

    const timelineTexts = (serialized.timelinePhases || []).map(
      (tp) => `Phase: ${tp.name} | Duration: ${tp.duration} | Summary: ${tp.summary}`
    );

    const fullDocText = `Document Title: ${serialized.title}\nDocument Number: ${serialized.documentNumber || ""}\nProposal Link: ${proposalLink}\nClient Name: ${serialized.clientName || ""}\n\nTimeline & Target Dates:\n${timelineTexts.join("\n")}\n\nCosting Line Items:\n${costTexts.join("\n")}\n\nDocument Sections:\n${sectionTexts.join("\n\n")}`;

    // Default SOW Reference formatted as "SOW-2026-007 (URL)"
    const rawRef = (serialized.documentNumber || `SOW-${document.id.slice(-6)}`).replace(/^PROP/i, "SOW");
    const defaultSowRef = `${rawRef} (${proposalLink})`;

    const extracted = await extractMsaFieldsFromText(fullDocText, defaultSowRef);

    return apiOk({
      extracted,
      message: "AI fields extracted successfully",
    });
  } catch (error) {
    return fromError(error);
  }
}
