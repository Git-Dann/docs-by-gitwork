import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StarterType, StarterContent } from "@/server/starters";
import ADDITIONS_1 from "@/data/starters-additions-1.json";
import ADDITIONS_2 from "@/data/starters-additions-2.json";
import ADDITIONS_3 from "@/data/starters-additions-3.json";
import ADDITIONS_4 from "@/data/starters-additions-4.json";
import ADDITIONS_5 from "@/data/starters-additions-5.json";

interface StarterAddition {
  slug: string;
  name: string;
  summary: string;
  description: string;
  type: StarterType;
  tags: string[];
  content: StarterContent;
}

// Net-new Prompt starters added after a gap analysis against a third-party "100 AI prompts"
// topic list — original Gitwork-authored wording throughout, only the topic list served as
// inspiration. Kept in src/data/starters-additions-{1..5}.json (small files, one per authoring
// batch) and seeded here as a standalone, upsert-only step — deliberately NOT folded into
// STARTER_BUILT_INS/seedBuiltInStarters (src/server/starters-catalog.ts), so this addition never
// needed to touch that large file. Seeded with isDefault: false so seedBuiltInStarters' own
// stale-slug cleanup (which only targets isDefault: true rows not in its own catalog) never
// touches these; isDefault otherwise only affects default sort order, not editability/deletability
// (see listStarters / deleteStarter in starters.ts).
const STARTER_ADDITIONS: StarterAddition[] = [
  ...(ADDITIONS_1 as unknown as StarterAddition[]),
  ...(ADDITIONS_2 as unknown as StarterAddition[]),
  ...(ADDITIONS_3 as unknown as StarterAddition[]),
  ...(ADDITIONS_4 as unknown as StarterAddition[]),
  ...(ADDITIONS_5 as unknown as StarterAddition[]),
];

export async function seedStarterAdditions(workspaceId: string): Promise<number> {
  for (const s of STARTER_ADDITIONS) {
    const content = s.content as unknown as Prisma.InputJsonValue;
    await prisma.starter.upsert({
      where: { slug: s.slug },
      update: {
        name: s.name,
        summary: s.summary,
        description: s.description,
        type: s.type,
        tags: s.tags,
        content,
        isArchived: false,
      },
      create: {
        workspaceId,
        slug: s.slug,
        name: s.name,
        summary: s.summary,
        description: s.description,
        type: s.type,
        status: "PUBLISHED",
        tags: s.tags,
        content,
        isDefault: false,
      },
    });
  }
  return STARTER_ADDITIONS.length;
}
