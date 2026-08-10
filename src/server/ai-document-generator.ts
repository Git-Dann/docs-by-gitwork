/**
 * AI-Powered Document Generation Engine.
 *
 * Takes reference intake text + document type, calls AI to extract key facts,
 * maps extracted entities into structured section blueprints, and creates
 * the document in PostgreSQL.
 */

import type { DocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getTemplateBlueprintsForType } from "@/lib/templates";
import { completeText, parseJsonObject, resolveAiConfig, type WorkspaceAiFields } from "@/server/ai-provider";
import type { EffectiveUser } from "@/server/auth/effective-user";

export interface GenerateDocumentInput {
  extractedText: string;
  documentType: DocumentType;
  workspace: WorkspaceAiFields & { id: string };
  actor?: EffectiveUser | null;
  customTitle?: string;
}

export interface ExtractedDocMetadata {
  title: string;
  clientName: string;
  clientEmail?: string;
  clientAddress?: string;
  gitworkSignatoryName?: string;
  gitworkSignatoryEmail?: string;
  gitworkSignatoryRole?: string;
  clientSignatoryName?: string;
  clientSignatoryEmail?: string;
  clientSignatoryRole?: string;
  summaryText?: string;
  clauses?: Array<{ title: string; body: string }>;
}

export async function generateDocumentFromIntake(input: GenerateDocumentInput) {
  const { extractedText, documentType, workspace, actor, customTitle } = input;

  // 1. Resolve AI provider config (Anthropic Claude 3.5 Sonnet default, Groq / OpenAI compatible fallback)
  const aiConfig = resolveAiConfig(workspace);

  const systemPrompt = `You are a legal and commercial document processing AI for Gitwork.
Your task is to analyze reference documents or briefs and extract key facts to populate a ${documentType} template.

Extract structured JSON strictly matching this interface:
{
  "title": "Document Title",
  "clientName": "Client Organisation Name",
  "clientEmail": "client.contact@example.com",
  "clientAddress": "Client Registered Address",
  "gitworkSignatoryName": "Gitwork Director Name",
  "gitworkSignatoryEmail": "director@gitwork.io",
  "gitworkSignatoryRole": "Director",
  "clientSignatoryName": "Authorized Client Name",
  "clientSignatoryEmail": "signer@client.com",
  "clientSignatoryRole": "CEO / Director / VP",
  "summaryText": "Executive summary of the agreement or scope",
  "clauses": [
    { "title": "Clause Title", "body": "Clause detailed text..." }
  ]
}

Return JSON only. No markdown fences outside the JSON object.`;

  const userPrompt = `Document Type: ${documentType}
${customTitle ? `Requested Title: ${customTitle}` : ""}

Reference Material:
${extractedText.slice(0, 15_000)}`;

  let extractedData: ExtractedDocMetadata | null = null;
  try {
    const rawAiResponse = await completeText({
      config: aiConfig,
      system: systemPrompt,
      user: userPrompt,
      tier: "standard",
      maxTokens: 2500,
    });
    extractedData = parseJsonObject<ExtractedDocMetadata>(rawAiResponse);
  } catch (err) {
    console.warn("AI extraction warning, using default template mapping:", err);
  }

  const clientName = extractedData?.clientName?.trim() || "Client Organisation";
  const docTitle = customTitle?.trim() || extractedData?.title?.trim() || `${documentType} — ${clientName}`;

  // 2. Load section blueprints for this document type
  const baseBlueprints = getTemplateBlueprintsForType(documentType);

  // 3. Map extracted metadata into section component data
  const sectionsPayload = baseBlueprints.map((blueprint, index) => {
    const sectionData = JSON.parse(JSON.stringify(blueprint.data));

    // Fill cover section
    if (blueprint.key === "cover" && typeof sectionData === "object" && sectionData) {
      sectionData.title = docTitle;
      sectionData.clientName = clientName;
    }

    // Fill parties section
    if (blueprint.key === "parties" && typeof sectionData === "object" && sectionData) {
      if (Array.isArray(sectionData.blocks)) {
        sectionData.blocks = sectionData.blocks.map((block: Record<string, unknown>) => {
          if (block.type === "client" || block.partyName?.toString().toLowerCase().includes("client")) {
            return {
              ...block,
              partyName: clientName,
              signatoryName: extractedData?.clientSignatoryName || block.signatoryName,
              signatoryEmail: extractedData?.clientSignatoryEmail || block.signatoryEmail,
              signatoryRole: extractedData?.clientSignatoryRole || block.signatoryRole,
            };
          }
          if (block.type === "gitwork" || block.partyName?.toString().toLowerCase().includes("gitwork")) {
            return {
              ...block,
              signatoryName: extractedData?.gitworkSignatoryName || block.signatoryName,
              signatoryEmail: extractedData?.gitworkSignatoryEmail || block.signatoryEmail,
              signatoryRole: extractedData?.gitworkSignatoryRole || block.signatoryRole,
            };
          }
          return block;
        });
      }
    }

    // Fill signatures section
    if (blueprint.key === "signatures" && typeof sectionData === "object" && sectionData) {
      if (Array.isArray(sectionData.blocks)) {
        sectionData.blocks = sectionData.blocks.map((block: Record<string, unknown>, bIndex: number) => {
          const isGitwork = block.type === "gitwork" || bIndex === 0;
          return {
            ...block,
            type: isGitwork ? "gitwork" : "client",
            variableName: block.variableName || (isGitwork ? "gitwork_signature" : `client_signature${bIndex > 1 ? `_${bIndex}` : ""}`),
            partyName: isGitwork ? "Gitwork Group Ltd" : clientName,
            signatoryName: isGitwork
              ? extractedData?.gitworkSignatoryName || block.signatoryName
              : extractedData?.clientSignatoryName || block.signatoryName,
            signatoryEmail: isGitwork
              ? extractedData?.gitworkSignatoryEmail || block.signatoryEmail
              : extractedData?.clientSignatoryEmail || block.signatoryEmail,
            signatoryRole: isGitwork
              ? extractedData?.gitworkSignatoryRole || block.signatoryRole
              : extractedData?.clientSignatoryRole || block.signatoryRole,
          };
        });
      }
    }

    // Inject AI extracted clauses if prose section
    if (blueprint.key.includes("clause") || blueprint.key.includes("scope") || blueprint.key === "prose") {
      if (extractedData?.clauses?.length && typeof sectionData === "object" && sectionData) {
        sectionData.clauses = extractedData.clauses.map((c, cIdx) => ({
          number: `${cIdx + 1}`,
          title: c.title,
          body: c.body,
        }));
      }
    }

    return {
      key: blueprint.key,
      title: blueprint.title,
      description: blueprint.description,
      sortOrder: (index + 1) * 10,
      data: sectionData,
    };
  });

  // 4. Find creator user
  const creatorId = actor?.id ?? workspace.id;

  // 5. Create Document record in PostgreSQL
  const document = await prisma.document.create({
    data: {
      workspaceId: workspace.id,
      ownerId: creatorId,
      documentType,
      title: docTitle,
      clientName,
      status: "DRAFT",
      sections: {
        create: sectionsPayload.map((s) => ({
          key: s.key,
          title: s.title,
          description: s.description,
          sortOrder: s.sortOrder,
          data: s.data,
        })),
      },
    },
  });

  return {
    documentId: document.id,
    title: document.title,
    documentType: document.documentType,
  };
}
