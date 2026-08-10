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
  clientName?: string;
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

function replacePlaceholdersInJson(obj: unknown, replacements: Record<string, string>): unknown {
  if (typeof obj === "string") {
    let res = obj;
    for (const [key, val] of Object.entries(replacements)) {
      if (val) {
        res = res.replaceAll(key, val);
      }
    }
    return res;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => replacePlaceholdersInJson(item, replacements));
  }
  if (typeof obj === "object" && obj !== null) {
    const newObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      newObj[k] = replacePlaceholdersInJson(v, replacements);
    }
    return newObj;
  }
  return obj;
}

export async function generateDocumentFromIntake(input: GenerateDocumentInput) {
  const { extractedText, documentType, workspace, actor, customTitle, clientName: inputClientName } = input;

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
${inputClientName ? `Provided Client Name: ${inputClientName}` : ""}

Reference Material:
${extractedText.slice(0, 18_000)}`;

  let extractedData: ExtractedDocMetadata | null = null;
  try {
    const rawAiResponse = await completeText({
      config: aiConfig,
      system: systemPrompt,
      user: userPrompt,
      tier: "standard",
      maxTokens: 3000,
    });
    extractedData = parseJsonObject<ExtractedDocMetadata>(rawAiResponse);
  } catch (err) {
    console.warn("AI extraction warning, using default template mapping:", err);
  }

  const resolvedClientName = inputClientName?.trim() || extractedData?.clientName?.trim() || "Client Organisation";
  const docTitle = customTitle?.trim() || extractedData?.title?.trim() || `${documentType} — ${resolvedClientName}`;

  // 2. Load section blueprints for this document type
  const baseBlueprints = getTemplateBlueprintsForType(documentType);

  const replacements: Record<string, string> = {
    "{{client_name}}": resolvedClientName,
    "Client organisation": resolvedClientName,
    "[client_name]": resolvedClientName,
    "[REVIEW] Authorised client signatory": extractedData?.clientSignatoryName || "Authorised Client Signatory",
    "[REVIEW] signatory email": extractedData?.clientSignatoryEmail || "signatory@client.com",
    "[REVIEW] Authorised Gitwork signatory": extractedData?.gitworkSignatoryName || "Director of Operations",
  };

  // 3. Map extracted metadata into section component data
  const sectionsPayload = baseBlueprints.map((blueprint, index) => {
    let sectionData = JSON.parse(JSON.stringify(blueprint.data));

    // Perform recursive placeholder replacement across the whole section JSON
    sectionData = replacePlaceholdersInJson(sectionData, replacements);

    // Fill cover section
    if (blueprint.key === "cover" && typeof sectionData === "object" && sectionData) {
      sectionData.title = docTitle;
      sectionData.clientName = resolvedClientName;
      if (extractedData?.summaryText) {
        sectionData.subtitle = extractedData.summaryText.slice(0, 140);
      }
    }

    // Fill parties section
    if (blueprint.key === "parties" && typeof sectionData === "object" && sectionData) {
      if (Array.isArray(sectionData.blocks)) {
        sectionData.blocks = sectionData.blocks.map((block: Record<string, unknown>) => {
          if (block.type === "client" || block.partyName?.toString().toLowerCase().includes("client")) {
            return {
              ...block,
              partyName: resolvedClientName,
              signatoryName: extractedData?.clientSignatoryName || block.signatoryName || "Authorised Signatory",
              signatoryEmail: extractedData?.clientSignatoryEmail || block.signatoryEmail || "signer@client.com",
              signatoryRole: extractedData?.clientSignatoryRole || block.signatoryRole || "Director",
            };
          }
          if (block.type === "gitwork" || block.partyName?.toString().toLowerCase().includes("gitwork")) {
            return {
              ...block,
              signatoryName: extractedData?.gitworkSignatoryName || block.signatoryName || "Director",
              signatoryEmail: extractedData?.gitworkSignatoryEmail || block.signatoryEmail || "hello@gitwork.io",
              signatoryRole: extractedData?.gitworkSignatoryRole || block.signatoryRole || "Director",
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
            partyName: isGitwork ? "Gitwork Group Ltd" : resolvedClientName,
            signatoryName: isGitwork
              ? extractedData?.gitworkSignatoryName || block.signatoryName || "Director"
              : extractedData?.clientSignatoryName || block.signatoryName || "Authorised Signatory",
            signatoryEmail: isGitwork
              ? extractedData?.gitworkSignatoryEmail || block.signatoryEmail || "hello@gitwork.io"
              : extractedData?.clientSignatoryEmail || block.signatoryEmail || "signer@client.com",
            signatoryRole: isGitwork
              ? extractedData?.gitworkSignatoryRole || block.signatoryRole || "Director"
              : extractedData?.clientSignatoryRole || block.signatoryRole || "Director",
          };
        });
      }
    }

    // Inject AI extracted clauses into prose/clause sections
    if (blueprint.key.includes("clause") || blueprint.key.includes("scope") || blueprint.key === "prose") {
      if (extractedData?.clauses?.length && typeof sectionData === "object" && sectionData) {
        sectionData.clauses = extractedData.clauses.map((c, cIdx) => ({
          number: `${cIdx + 1}`,
          title: c.title,
          body: c.body,
        }));
        // Also build readable markdown content if content string exists
        if (typeof sectionData.content === "string") {
          const formattedClauses = extractedData.clauses
            .map((c, cIdx) => `### ${cIdx + 1}. ${c.title}\n\n${c.body}`)
            .join("\n\n");
          sectionData.content = `${formattedClauses}\n\n${sectionData.content}`;
        }
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
      clientName: resolvedClientName,
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
