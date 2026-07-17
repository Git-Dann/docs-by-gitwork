import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import masterPrompt from "@/data/master-build-prompt.json";

// Seeds the "Agency Platform — Master Build Prompt" as a workspace-owned, editable Starter.
// create-only (`update: {}`) so it's created once and NEVER overwrites the owner's edits or its
// version history across boots — unlike the built-in catalog, which re-syncs content on every boot.
export async function seedMasterPromptStarter(workspaceId: string): Promise<void> {
  await prisma.starter.upsert({
    where: { slug: masterPrompt.slug },
    update: {},
    create: {
      workspaceId,
      slug: masterPrompt.slug,
      name: masterPrompt.name,
      summary: masterPrompt.summary,
      description: masterPrompt.description,
      type: "PROMPT",
      status: "PUBLISHED",
      tags: masterPrompt.tags,
      content: { promptText: masterPrompt.promptText } as unknown as Prisma.InputJsonValue,
    },
  });
}
