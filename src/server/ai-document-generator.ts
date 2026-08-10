/**
 * AI-Powered Document Generation Engine.
 *
 * Takes reference intake text + document type, calls AI to extract key facts and generate
 * tailored content for EVERY section blueprint in the chosen template, and creates the
 * populated document in PostgreSQL.
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
  sectionData?: Record<string, Record<string, unknown>>;
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

  // 1. Resolve AI provider config (Anthropic Claude 3.5 Sonnet / Groq / OpenAI compatible)
  const aiConfig = resolveAiConfig(workspace);

  // 2. Load base section blueprints for this document type
  const baseBlueprints = getTemplateBlueprintsForType(documentType);
  const blueprintSummaries = baseBlueprints.map((b) => ({
    key: b.key,
    title: b.title,
    description: b.description,
    dataKeys: Object.keys((b.data as unknown as Record<string, unknown>) ?? {}),
  }));

  const systemPrompt = `You are an expert commercial and legal document processing AI for Gitwork.
Your task is to analyze reference documents or briefs and generate fully populated, tailored section contents for a ${documentType} template.

Here are the section components in the ${documentType} template:
${JSON.stringify(blueprintSummaries, null, 2)}

Extract and generate structured JSON strictly matching this interface:
{
  "title": "Document Title",
  "clientName": "Client Organisation Name",
  "clientEmail": "client.contact@example.com",
  "clientAddress": "Client Registered Address",
  "gitworkSignatoryName": "${actor?.name || "Gitwork Director"}",
  "gitworkSignatoryEmail": "${actor?.email || "legal@gitwork.tech"}",
  "gitworkSignatoryRole": "Director",
  "clientSignatoryName": "Authorised Client Signatory",
  "clientSignatoryEmail": "signer@client.com",
  "clientSignatoryRole": "CEO / Director / VP",
  "summaryText": "Executive summary of the agreement or project scope",
  "clauses": [
    { "title": "Clause Title", "body": "Clause detailed text..." }
  ],
  "sectionData": {
    "key_name": {
      "title": "Tailored Section Title",
      "description": "Tailored Section Overview",
      "content": "Tailored body text or markdown paragraph based on the uploaded document...",
      "body": "Tailored body paragraph text..."
    }
  }
}

Important Instructions:
1. For every section key in the template (e.g. cover, introduction, objectives, scope, cost_breakdown, terms, cta, clauses), generate customized content inside sectionData under that exact key.
2. Incorporate specific facts, scope points, dates, deliverables, and requirements found in the reference material.
3. Return JSON only. No markdown fences outside the JSON object.`;

  const userPrompt = `Document Type: ${documentType}
${customTitle ? `Requested Title: ${customTitle}` : ""}
${inputClientName ? `Provided Client Name: ${inputClientName}` : ""}

Uploaded Reference Material:
${extractedText.slice(0, 18_000)}`;

  let extractedData: ExtractedDocMetadata | null = null;
  try {
    const rawAiResponse = await completeText({
      config: aiConfig,
      system: systemPrompt,
      user: userPrompt,
      tier: "standard",
      maxTokens: 4000,
    });
    extractedData = parseJsonObject<ExtractedDocMetadata>(rawAiResponse);
  } catch (err) {
    console.warn("AI extraction warning, falling back to default template blueprints:", err);
  }

  const resolvedClientName = inputClientName?.trim() || extractedData?.clientName?.trim() || "Client Organisation";
  const docTitle = customTitle?.trim() || extractedData?.title?.trim() || `${documentType} — ${resolvedClientName}`;

  const replacements: Record<string, string> = {
    "{{client_name}}": resolvedClientName,
    "Client organisation": resolvedClientName,
    "[client_name]": resolvedClientName,
    "[REVIEW] Authorised client signatory": extractedData?.clientSignatoryName || "Authorised Client Signatory",
    "[REVIEW] signatory email": extractedData?.clientSignatoryEmail || "signatory@client.com",
    "[REVIEW] Authorised Gitwork signatory": actor?.name || extractedData?.gitworkSignatoryName || "Director of Operations",
  };

  // 3. Populate section blueprints with AI-generated section data + metadata
  const sectionsPayload = baseBlueprints.map((blueprint, index) => {
    let sectionData = JSON.parse(JSON.stringify(blueprint.data));

    // Merge AI generated sectionData if present for this section key
    if (extractedData?.sectionData?.[blueprint.key]) {
      const aiSec = extractedData.sectionData[blueprint.key];
      sectionData = {
        ...sectionData,
        ...aiSec,
      };
    }

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
              signatoryName: actor?.name || extractedData?.gitworkSignatoryName || block.signatoryName || "Director",
              signatoryEmail: actor?.email || extractedData?.gitworkSignatoryEmail || block.signatoryEmail || "legal@gitwork.tech",
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
              ? actor?.name || extractedData?.gitworkSignatoryName || block.signatoryName || "Director"
              : extractedData?.clientSignatoryName || block.signatoryName || "Authorised Signatory",
            signatoryEmail: isGitwork
              ? actor?.email || extractedData?.gitworkSignatoryEmail || block.signatoryEmail || "legal@gitwork.tech"
              : extractedData?.clientSignatoryEmail || block.signatoryEmail || "signer@client.com",
            signatoryRole: isGitwork
              ? extractedData?.gitworkSignatoryRole || block.signatoryRole || "Director"
              : extractedData?.clientSignatoryRole || block.signatoryRole || "Director",
          };
        });
      }
    }

    // Inject AI extracted clauses into clause / legal sections
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
      title: (extractedData?.sectionData?.[blueprint.key]?.title as string) || blueprint.title,
      description: (extractedData?.sectionData?.[blueprint.key]?.description as string) || blueprint.description,
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
