/**
 * Recording a deal from outside Docs (rules in src/lib/money-deals.ts). Saved as an accepted
 * document with cost lines, labelled "Recorded deal", so Money counts it like any other win and
 * it can be found, opened and archived in Docs. Only call for a viewer who passes
 * canViewClientFinancials; the routes check.
 */

import { prisma } from "@/lib/prisma";
import { fuzzySearch } from "@/lib/fuzzy-search";
import { extractIntakeText } from "@/server/file-intake";
import { completeText, parseJsonObject, resolveAiConfig } from "@/server/ai-provider";
import {
  DEAL_LABEL,
  DEAL_READER_SYSTEM,
  dealCostLines,
  dealProblems,
  parseDealDraft,
  type DealDraft,
  type DealInput,
} from "@/lib/money-deals";
import type { EffectiveUser } from "@/server/auth/effective-user";

export class DealError extends Error {
  status = 400;
}

export async function recordDeal(user: EffectiveUser, input: DealInput): Promise<{ id: string }> {
  const problems = dealProblems(input);
  if (problems.length) throw new DealError(problems.join(" "));
  const client = await prisma.workspaceClient.findFirst({
    where: { id: input.clientId, workspaceId: user.workspaceId },
    select: { id: true, name: true },
  });
  if (!client) throw new DealError("That client isn't in this workspace.");

  const wonAt = new Date(`${input.wonOn}T12:00:00Z`);
  const doc = await prisma.document.create({
    data: {
      workspaceId: user.workspaceId,
      ownerId: user.id,
      documentType: "PROPOSAL",
      status: "ACCEPTED",
      acceptedAt: wonAt,
      title: input.title.trim(),
      clientId: client.id,
      clientName: client.name,
      labels: [DEAL_LABEL],
      metadata: {
        recordedDeal: {
          source: input.source.kind,
          fileName: input.source.kind === "file" ? input.source.fileName.slice(0, 200) : null,
          recordedBy: user.name ?? user.email,
          recordedAt: new Date().toISOString(),
        },
      },
      sections: {
        create: [{ key: "costing", title: "Costing", sortOrder: 0, data: { currency: input.currency, discount: 0, taxRate: 0 } }],
      },
      costLineItems: { create: dealCostLines(input) },
    },
    select: { id: true },
  });
  return doc;
}

const FILE_LIMIT = 10 * 1024 * 1024;
const TEXT_LIMIT = 40_000;

/**
 * Reads a file into a draft for a person to check. Nothing is saved here. The file itself is not
 * kept: only the figures the person confirms are.
 */
export async function readDealFile(
  user: EffectiveUser,
  file: { name: string; type: string; bytes: Buffer },
): Promise<DealDraft & { clientId: string | null }> {
  if (file.bytes.length === 0) throw new DealError("That file is empty.");
  if (file.bytes.length > FILE_LIMIT) throw new DealError("Files up to 10 MB, please.");
  const lower = file.name.toLowerCase();
  if (!/\.(pdf|docx|txt|md)$/.test(lower)) throw new DealError("Use a PDF, Word (.docx) or text file.");

  const { extractedText } = await extractIntakeText({ filename: file.name, mimeType: file.type, buffer: file.bytes });
  const text = extractedText.slice(0, TEXT_LIMIT);
  if (text.trim().length < 20) {
    throw new DealError("No readable text in that file. A scanned PDF needs the figures typing in by hand.");
  }

  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { id: user.workspaceId },
    select: {
      aiProvider: true,
      anthropicApiKey: true,
      platformAiKeysAllowed: true,
      anthropicModel: true,
      openaiApiKey: true,
      openaiModel: true,
      geminiApiKey: true,
      geminiModel: true,
      localLlmUrl: true,
      localLlmModel: true,
    },
  });
  const config = resolveAiConfig(ws);
  if (!config.apiKey && config.provider !== "LOCAL") {
    throw new DealError("No AI provider is set up, so the file can't be read. Type the figures in instead.");
  }

  const raw = await completeText({
    config,
    system: DEAL_READER_SYSTEM,
    user: `File: ${file.name}\n\n${text}`,
    maxTokens: 1500,
    usageContext: { module: "OTHER", workspaceId: user.workspaceId, userId: user.id, operation: "money.read_deal" },
  });
  const draft = parseDealDraft(parseJsonObject<unknown>(raw), text);

  // Match the client by name among this workspace's clients; never guess between two.
  let clientId: string | null = null;
  if (draft.clientName) {
    const clients = await prisma.workspaceClient.findMany({
      where: { workspaceId: user.workspaceId, hidden: false },
      select: { id: true, name: true },
    });
    const hits = fuzzySearch(clients, draft.clientName, (c) => [c.name]);
    if (hits.length === 1 || (hits.length > 1 && hits[0].name.toLowerCase() === draft.clientName.toLowerCase())) clientId = hits[0].id;
  }
  return { ...draft, clientId };
}
