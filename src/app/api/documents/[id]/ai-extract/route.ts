import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { assertCan, canManageDocs, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { proposalInclude, serializeProposal } from "@/server/proposals";
import { enableDocumentShare } from "@/server/documents";
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

    // Ensure document sharing is enabled and get public share token
    const { shareToken } = await enableDocumentShare(document.id);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://staging.foundry.gitwork.tech";
    const publicProposalLink = `${baseUrl}/docs/${shareToken}`;

    // Compute Commercial & Cost totals accurately
    const netSubtotal = (serialized.costLineItems || []).reduce((sum, c) => sum + (c.subtotal || 0), 0);
    const grandTotal = netSubtotal > 0 ? netSubtotal * 1.20 : 0;
    const formattedNetTotal = netSubtotal > 0 ? `£${netSubtotal.toLocaleString("en-GB")}` : undefined;
    const formattedGrandTotal = grandTotal > 0 ? `£${Math.round(grandTotal).toLocaleString("en-GB")}` : undefined;

    // Check costing section for milestone payment structure
    const costingSection = (serialized.sections || []).find((s) => s.key === "costing");
    const costingData = costingSection?.data as Record<string, unknown> | undefined;
    const milestones = Array.isArray(costingData?.milestones) ? costingData.milestones : [];
    const hasMilestones = milestones.length > 0;

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

    const fullDocText = `Document Title: ${serialized.title}\nDocument Number: ${serialized.documentNumber || ""}\nPublic Proposal Link: ${publicProposalLink}\nClient Name: ${serialized.clientName || ""}\n\nCommercial Summary:\n- Total Net Contract Value: ${formattedNetTotal || "N/A"}\n- Total Grand Total (incl. VAT): ${formattedGrandTotal || "N/A"}\n- Payment Structure: ${hasMilestones ? `Milestone-based (${milestones.length} milestones)` : "Standard payment terms"}\n\nTimeline & Target Dates:\n${timelineTexts.join("\n")}\n\nCosting Line Items:\n${costTexts.join("\n")}\n\nDocument Sections:\n${sectionTexts.join("\n\n")}`;

    // Default SOW Reference formatted as "SOW-2026-007 (https://staging.foundry.gitwork.tech/docs/shareToken)"
    const rawRef = (serialized.documentNumber || `SOW-${document.id.slice(-6)}`).replace(/^PROP/i, "SOW");
    const defaultSowRef = `${rawRef} (${publicProposalLink})`;

    const extracted = await extractMsaFieldsFromText(fullDocText, defaultSowRef, {
      totalNetValue: formattedNetTotal,
      hasMilestones,
    });

    return apiOk({
      extracted,
      publicProposalLink,
      message: "AI fields extracted successfully",
    });
  } catch (error) {
    return fromError(error);
  }
}
