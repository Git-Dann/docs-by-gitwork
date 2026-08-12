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
  projectName?: string;
  founderName?: string;
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

Here are the section components in the ${documentType} template (with index numbers and titles):
${JSON.stringify(
  blueprintSummaries.map((b, idx) => ({
    index: idx,
    sectionKey: `section_${idx}`,
    key: b.key,
    title: b.title,
    titleSlug: b.title.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
    description: b.description,
  })),
  null,
  2,
)}

Extract and generate structured JSON strictly matching this interface:
{
  "title": "Document Title",
  "clientName": "Exact Client Organisation Name",
  "projectName": "Project Working Name or Subject Matter",
  "founderName": "Key Founder / Client Representative Name",
  "clientEmail": "client.contact@example.com",
  "clientAddress": "Client Registered Address or Location",
  "gitworkSignatoryName": "${actor?.name || "Gitwork Director"}",
  "gitworkSignatoryEmail": "${actor?.email || "legal@gitwork.tech"}",
  "gitworkSignatoryRole": "Director",
  "clientSignatoryName": "Authorised Client Signatory",
  "clientSignatoryEmail": "signer@client.com",
  "clientSignatoryRole": "CEO / Director / VP",
  "summaryText": "Detailed 2-3 sentence executive summary of the project scope, background, technology, and objectives from the reference document",
  "clauses": [
    { "title": "Clause Title", "body": "Clause detailed text..." }
  ],
  "sectionData": {
    "section_0": {
      "title": "Tailored Title",
      "content": "Tailored full body text or markdown text incorporating specific facts, methodology, requirements, and deliverables from the uploaded reference material..."
    },
    "purpose": {
      "content": "Tailored purpose text incorporating the specific project scope and client background..."
    }
  }
}

Important Instructions:
1. Extract the exact client/company name for clientName (e.g. "Still We Grow" or "Still We Grow Ltd").
2. Extract the exact project name or subject matter for projectName (e.g. "SWG Brain – AI Powered Advisory Platform").
3. For sectionData, key entries using section indices ("section_0", "section_1", "section_2"...) or title slugs ("purpose", "the_project", "what_counts_as_confidential_information"...).
4. For every text/prose section, provide customized, detailed content inside "content" incorporating specific facts, scope points, methodology, dates, and technical requirements found in the reference material.
5. Return JSON only. No markdown fences outside the JSON object.`;

  const userPrompt = `Document Type: ${documentType}
${customTitle ? `Requested Title: ${customTitle}` : ""}
${inputClientName ? `Provided Client Name: ${inputClientName}` : ""}

Uploaded Reference Material:
${extractedText.slice(0, 18_000)}`;

  console.log(
    `[AI Generator] Starting generation for documentType="${documentType}" using provider="${aiConfig.provider}" model="${aiConfig.model}" extractedTextLength=${extractedText.length}`,
  );

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
    if (extractedData) {
      console.log(
        `[AI Generator] Successfully parsed AI response. Title="${extractedData.title}" client="${extractedData.clientName}" project="${extractedData.projectName}" sectionsCount=${
          Object.keys(extractedData.sectionData ?? {}).length
        }`,
      );
    } else {
      console.warn("[AI Generator] AI completed response but JSON parsing returned null. Fallback blueprints will be used.");
    }
  } catch (err) {
    console.warn("[AI Generator] AI extraction warning, falling back to default template blueprints:", err);
  }

  const resolvedClientName = inputClientName?.trim() || extractedData?.clientName?.trim() || "Client Organisation";
  const docTitle = customTitle?.trim() || extractedData?.title?.trim() || `${documentType} — ${resolvedClientName}`;
  const projectName = extractedData?.projectName?.trim() || extractedData?.title?.trim() || "the Project";
  const founderName = extractedData?.founderName?.trim() || extractedData?.clientSignatoryName?.trim() || "Authorised Signatory";
  const clientAddress = extractedData?.clientAddress?.trim() || "Registered Address";
  const summaryText = extractedData?.summaryText?.trim() || "";

  const replacements: Record<string, string> = {
    "{{client_name}}": resolvedClientName,
    "{{date}}": new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    "Client Organisation": resolvedClientName,
    "Client organisation": resolvedClientName,
    "client organisation": resolvedClientName,
    "[client_name]": resolvedClientName,
    "[project working name]": projectName,
    "[project_working_name]": projectName,
    "[individual name]": founderName,
    "[individual_name]": founderName,
    "[company number]": "Pending Incorporation",
    "[registered office address]": clientAddress,
    "[address for correspondence]": clientAddress,
    "[REVIEW] Authorised client signatory": extractedData?.clientSignatoryName || "Authorised Client Signatory",
    "[REVIEW] signatory email": extractedData?.clientSignatoryEmail || "signatory@client.com",
    "[REVIEW] Authorised Gitwork signatory": actor?.name || extractedData?.gitworkSignatoryName || "Director of Operations",
  };

  // 3. Populate section blueprints with AI-generated section data + metadata
  const sectionsPayload = baseBlueprints.map((blueprint, index) => {
    let sectionData = JSON.parse(JSON.stringify(blueprint.data));

    // Flexible multi-strategy matching for sectionData from AI
    const titleSlug = blueprint.title.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const titleLower = blueprint.title.toLowerCase();
    const secIndexKey = `section_${index}`;

    const aiSec =
      extractedData?.sectionData?.[secIndexKey] ||
      extractedData?.sectionData?.[titleSlug] ||
      extractedData?.sectionData?.[titleLower] ||
      extractedData?.sectionData?.[blueprint.title] ||
      (baseBlueprints.filter((b) => b.key === blueprint.key).length === 1 ? extractedData?.sectionData?.[blueprint.key] : undefined);

    if (aiSec) {
      if (typeof aiSec === "string") {
        sectionData.content = aiSec;
      } else if (typeof aiSec === "object" && aiSec !== null) {
        const customContent = (aiSec.content as string) || (aiSec.body as string) || (aiSec.text as string);
        if (customContent && typeof customContent === "string" && customContent.trim()) {
          sectionData.content = customContent.trim();
        }
        if (aiSec.title && typeof aiSec.title === "string") {
          sectionData.title = aiSec.title;
        }
        // Merge remaining metadata keys if sectionData is a primitive record
        for (const [k, v] of Object.entries(aiSec)) {
          if (k !== "content" && k !== "body" && k !== "text") {
            sectionData[k] = v;
          }
        }
      }
    }

    // Special customization for NDA Purpose & Project sections to incorporate extracted scope
    if (documentType === "NDA") {
      if (blueprint.title.toLowerCase() === "purpose") {
        const customPurposeText = typeof aiSec === "object" && aiSec?.content ? (aiSec.content as string) : undefined;
        if (customPurposeText && customPurposeText.length > 50) {
          sectionData.content = customPurposeText;
        } else if (extractedData?.summaryText) {
          sectionData.content = [
            `The parties intend to discuss and evaluate possible software design, development, and delivery work across two workstreams (together the "Purpose"):`,
            `  work relating to the existing platform, systems, and operations of ${resolvedClientName}; and`,
            `  ${projectName}, being a new platform and business that is not yet incorporated.`,
            ``,
            `The Purpose includes evaluating, auditing, scoping, technical review, proposal, design, or pilot work for ${projectName} (${extractedData.summaryText}).`,
            `Confidential Information may only be used for the Purpose. It may not be used for any other commercial or personal advantage.`,
          ].join("\n");
        }
      }

      if (blueprint.title.toLowerCase() === "the project") {
        if (projectName && projectName !== "the Project") {
          const projectIntro = `The "Project" means the proposed platform, product, and business currently referred to by the working name ${projectName}. It includes the name itself, the concept, the product and feature design, the mechanics, the commercial model, the branding, the target market, and any prototype, wireframe, prompt, or code relating to it.`;
          const currentContent = typeof sectionData.content === "string" ? sectionData.content : "";
          const lines = currentContent.split("\n");
          if (lines.length > 0) {
            lines[0] = projectIntro;
            sectionData.content = lines.join("\n");
          }
        }
      }
    }

    // Perform recursive placeholder replacement across the whole section JSON
    sectionData = replacePlaceholdersInJson(sectionData, replacements);

    // ── Cover section ─────────────────────────────────────────────────────────────────────────
    if (blueprint.key === "cover" && typeof sectionData === "object" && sectionData) {
      sectionData.title = docTitle;
      sectionData.clientName = resolvedClientName;
      if (summaryText) {
        sectionData.subtitle = summaryText.slice(0, 200);
      }
    }


    // ── Parties section — preserving structure for UI & DocuSeal compatibility ─────────────────
    if (blueprint.key === "parties" && typeof sectionData === "object" && sectionData) {
      if (Array.isArray(sectionData.parties)) {
        sectionData.parties = sectionData.parties.map((party: Record<string, unknown>, pIndex: number) => {
          if (pIndex === 0) return party; // Keep Gitwork as Party A — never touched
          if (pIndex === 1) {
            return {
              ...party,
              name: resolvedClientName,
              organization: party.organization
                ? (replacePlaceholdersInJson(party.organization, replacements) as string)
                : party.organization,
              email: party.email
                ? (replacePlaceholdersInJson(party.email, replacements) as string)
                : party.email,
            };
          }
          if (pIndex === 2) {
            return {
              ...party,
              name: founderName !== "Authorised Signatory" ? founderName : party.name,
              organization: party.organization
                ? (replacePlaceholdersInJson(party.organization, replacements) as string)
                : party.organization,
              email: party.email
                ? (replacePlaceholdersInJson(party.email, replacements) as string)
                : party.email,
            };
          }
          return party;
        });
      }
    }

    // ── Signatures section — preserving structure for UI & DocuSeal compatibility ─────────────
    if (blueprint.key === "signatures" && typeof sectionData === "object" && sectionData) {
      if (Array.isArray(sectionData.blocks)) {
        sectionData.blocks = sectionData.blocks.map((block: Record<string, unknown>, bIndex: number) => {
          const isGitwork = block.type === "gitwork" || bIndex === 0;
          return {
            ...block,
            type: isGitwork ? "gitwork" : "client",
            // Preserve existing variableName — DocuSeal relies on these for field mapping
            variableName: block.variableName || (isGitwork ? "gitwork_signature" : `client_signature${bIndex > 1 ? `_${bIndex}` : ""}`),
            partyName: isGitwork ? "Gitwork Group Ltd" : resolvedClientName,
            signatoryName: isGitwork
              ? actor?.name || extractedData?.gitworkSignatoryName || block.signatoryName || ""
              : extractedData?.clientSignatoryName || block.signatoryName || "",
            signatoryEmail: isGitwork
              ? actor?.email || extractedData?.gitworkSignatoryEmail || block.signatoryEmail || ""
              : extractedData?.clientSignatoryEmail || block.signatoryEmail || "",
            signatoryRole: isGitwork
              ? extractedData?.gitworkSignatoryRole || block.signatoryRole || "Director"
              : extractedData?.clientSignatoryRole || block.signatoryRole || "Director",
            details: Array.isArray(block.details)
              ? block.details.map((d: unknown) =>
                  typeof d === "string" ? (replacePlaceholdersInJson(d, replacements) as string) : d,
                )
              : block.details,
          };
        });
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
