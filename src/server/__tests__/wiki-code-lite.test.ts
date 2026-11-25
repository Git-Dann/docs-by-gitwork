/**
 * The wiki sends Code Handover without file contents (CLAUDE.md §155): PollenIQ's code was 1 MB on
 * every wiki load. The light copy must keep everything else, so the dashboard card and the
 * client-visibility check read the same as before.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { liteCodeHandover, type WikiCodeHandoverSection } from "../wiki-code";

const section = {
  enabled: true,
  modules: [
    {
      id: "m1",
      name: "Sender",
      versions: [
        { id: "v1", label: "v1.0", isCurrent: true, files: [{ id: "f1", filename: "sender.ino", language: "cpp", content: "x".repeat(535_000) }] },
      ],
    },
  ],
} as unknown as WikiCodeHandoverSection;

describe("liteCodeHandover", () => {
  it("drops every file's contents and nothing else", () => {
    const lite = liteCodeHandover(section);
    expect(lite.lite).toBe(true);
    const file = lite.modules[0].versions[0].files[0];
    expect(file).toEqual({ id: "f1", filename: "sender.ino", language: "cpp", content: "" });
    expect(lite.modules[0].versions[0]).toMatchObject({ id: "v1", label: "v1.0", isCurrent: true });
    expect(JSON.stringify(lite).length).toBeLessThan(500);
  });

  it("leaves the original alone", () => {
    liteCodeHandover(section);
    expect(section.modules[0].versions[0].files[0].content.length).toBe(535_000);
  });
});
