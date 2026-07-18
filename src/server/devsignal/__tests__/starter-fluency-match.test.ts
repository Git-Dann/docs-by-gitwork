import { describe, expect, it } from "vitest";
import { pickBestStarterFixture } from "../starter-fluency";
import type { StarterListItem, StarterType } from "@/server/starters";

function starter(partial: Partial<StarterListItem> & { id: string; tags: string[] }): StarterListItem {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    slug: partial.slug ?? partial.id,
    summary: partial.summary ?? "",
    type: (partial.type ?? "KIT") as StarterType,
    status: partial.status ?? "PUBLISHED",
    tags: partial.tags,
    featured: partial.featured ?? false,
    isDefault: partial.isDefault ?? false,
    usageCount: partial.usageCount ?? 0,
    lastUsedAt: partial.lastUsedAt ?? null,
    pinned: partial.pinned ?? false,
    curatorState: partial.curatorState ?? "ACTIVE",
    createdAt: partial.createdAt ?? new Date(0).toISOString(),
    updatedAt: partial.updatedAt ?? new Date(0).toISOString(),
    searchText: partial.searchText ?? "",
  };
}

describe("pickBestStarterFixture", () => {
  const catalog = [
    starter({ id: "launch-kit", type: "KIT", tags: ["javascript", "react", "scaffolding"] }),
    starter({ id: "sql-skill", type: "SKILL", tags: ["python", "sql", "data"] }),
    starter({ id: "some-plugin", type: "PLUGIN", tags: ["python", "sql"] }),
    starter({ id: "some-collection", type: "COLLECTION", tags: ["python", "sql"] }),
  ];

  it("returns null when there are no eligible (PROMPT/SKILL/KIT) starters", () => {
    const noneEligible = [starter({ id: "p", type: "PLUGIN", tags: ["python"] })];
    expect(pickBestStarterFixture(noneEligible, { primaryStack: "python" })).toBeNull();
  });

  it("excludes PLUGIN and COLLECTION types even on a strong tag match", () => {
    const picked = pickBestStarterFixture(catalog, { primaryStack: "python, sql" });
    expect(picked?.id).toBe("sql-skill");
  });

  it("matches on tag overlap with the candidate's declared stack", () => {
    const picked = pickBestStarterFixture(catalog, { primaryStack: "React / JavaScript" });
    expect(picked?.id).toBe("launch-kit");
  });

  it("falls back to the first eligible starter when there's no stack signal", () => {
    const picked = pickBestStarterFixture(catalog, {});
    expect(picked?.id).toBe("launch-kit");
  });
});
