import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StarterType, StarterContent } from "@/server/starters";
import DATING_1 from "@/data/design-starters-dating-1.json";
import DATING_2 from "@/data/design-starters-dating-2.json";
import FINANCE_1 from "@/data/design-starters-finance-1.json";
import FINANCE_2 from "@/data/design-starters-finance-2.json";
import FINANCE_3 from "@/data/design-starters-finance-3.json";
import FITNESS_1 from "@/data/design-starters-fitness-1.json";
import FITNESS_2 from "@/data/design-starters-fitness-2.json";
import FITNESS_3 from "@/data/design-starters-fitness-3.json";
import FOOD_1 from "@/data/design-starters-food-1.json";
import FOOD_2 from "@/data/design-starters-food-2.json";
import MESSAGING_1 from "@/data/design-starters-messaging-1.json";
import MESSAGING_2 from "@/data/design-starters-messaging-2.json";
import MISC_1 from "@/data/design-starters-misc-1.json";
import MISC_2 from "@/data/design-starters-misc-2.json";
import MISC_3 from "@/data/design-starters-misc-3.json";
import MUSIC_1 from "@/data/design-starters-music-1.json";
import MUSIC_2 from "@/data/design-starters-music-2.json";
import PRODUCTIVITY_1 from "@/data/design-starters-productivity-1.json";
import PRODUCTIVITY_2 from "@/data/design-starters-productivity-2.json";
import PRODUCTIVITY_3 from "@/data/design-starters-productivity-3.json";
import SOCIAL_1 from "@/data/design-starters-social-1.json";
import SOCIAL_2 from "@/data/design-starters-social-2.json";
import SOCIAL_3 from "@/data/design-starters-social-3.json";
import TRAVEL_1 from "@/data/design-starters-travel-1.json";
import TRAVEL_2 from "@/data/design-starters-travel-2.json";
import TRAVEL_3 from "@/data/design-starters-travel-3.json";
import VIDEO_1 from "@/data/design-starters-video-1.json";
import VIDEO_2 from "@/data/design-starters-video-2.json";

interface DesignSystemStarter {
  slug: string;
  name: string;
  summary: string;
  description: string;
  type: StarterType;
  tags: string[];
  content: StarterContent;
}

// iOS design-system Starters, one per app, reverse-engineered from the MIT-licensed
// Meliwat/awesome-ios-design-md repo (design-md/<category>/<app>/DESIGN.md +
// DESIGN-swiftui.md — the iOS-specific pair; Android/Expo variants in that repo were not
// used). Every promptText is original Gitwork wording built to the Starters 5-part depth
// standard (CLAUDE.md §8) — only factual data points (hex codes, font/type specs,
// spacing/radius values, named UI patterns) were extracted from the source files, never
// copied or lightly paraphrased prose. App names are kept visible per Dan's explicit call.
// Kept in src/data/design-starters-<category>-<batch>.json (small per-batch files) and
// seeded here as a standalone, upsert-only step — deliberately NOT folded into
// STARTER_BUILT_INS/seedBuiltInStarters (src/server/starters-catalog.ts), same reasoning as
// starters-additions-seed.ts: isDefault: false keeps these immune to that function's
// stale-slug cleanup, which only targets isDefault: true rows outside its own catalog.
const DESIGN_SYSTEM_STARTERS: DesignSystemStarter[] = [
  ...(DATING_1 as unknown as DesignSystemStarter[]),
  ...(DATING_2 as unknown as DesignSystemStarter[]),
  ...(FINANCE_1 as unknown as DesignSystemStarter[]),
  ...(FINANCE_2 as unknown as DesignSystemStarter[]),
  ...(FINANCE_3 as unknown as DesignSystemStarter[]),
  ...(FITNESS_1 as unknown as DesignSystemStarter[]),
  ...(FITNESS_2 as unknown as DesignSystemStarter[]),
  ...(FITNESS_3 as unknown as DesignSystemStarter[]),
  ...(FOOD_1 as unknown as DesignSystemStarter[]),
  ...(FOOD_2 as unknown as DesignSystemStarter[]),
  ...(MESSAGING_1 as unknown as DesignSystemStarter[]),
  ...(MESSAGING_2 as unknown as DesignSystemStarter[]),
  ...(MISC_1 as unknown as DesignSystemStarter[]),
  ...(MISC_2 as unknown as DesignSystemStarter[]),
  ...(MISC_3 as unknown as DesignSystemStarter[]),
  ...(MUSIC_1 as unknown as DesignSystemStarter[]),
  ...(MUSIC_2 as unknown as DesignSystemStarter[]),
  ...(PRODUCTIVITY_1 as unknown as DesignSystemStarter[]),
  ...(PRODUCTIVITY_2 as unknown as DesignSystemStarter[]),
  ...(PRODUCTIVITY_3 as unknown as DesignSystemStarter[]),
  ...(SOCIAL_1 as unknown as DesignSystemStarter[]),
  ...(SOCIAL_2 as unknown as DesignSystemStarter[]),
  ...(SOCIAL_3 as unknown as DesignSystemStarter[]),
  ...(TRAVEL_1 as unknown as DesignSystemStarter[]),
  ...(TRAVEL_2 as unknown as DesignSystemStarter[]),
  ...(TRAVEL_3 as unknown as DesignSystemStarter[]),
  ...(VIDEO_1 as unknown as DesignSystemStarter[]),
  ...(VIDEO_2 as unknown as DesignSystemStarter[]),
];

export async function seedDesignSystemStarters(workspaceId: string): Promise<number> {
  for (const s of DESIGN_SYSTEM_STARTERS) {
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
  return DESIGN_SYSTEM_STARTERS.length;
}
