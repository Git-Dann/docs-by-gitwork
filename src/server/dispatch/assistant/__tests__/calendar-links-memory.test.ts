import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/stored-secret", () => ({ readSecret: () => null }));
import { cleanMemory, MAX_MEMORY_CHARS } from "../memory";
import { linksText } from "../link-check";
import { chatContext, noClientContext } from "@/lib/dispatch/prompt";

const tools = readFileSync(join(process.cwd(), "src/server/dispatch/assistant/tools.ts"), "utf8");
const body = (name: string) => tools.slice(tools.indexOf(`name: "${name}"`), tools.indexOf("\nconst ", tools.indexOf(`name: "${name}"`)));

describe("memory across chats (§173)", () => {
  it("a note is one tidy line, capped", () => {
    expect(cleanMemory("  Prefers\n bullet   points ")).toBe("Prefers bullet points");
    expect(cleanMemory("x".repeat(500))).toHaveLength(MAX_MEMORY_CHARS);
    expect(cleanMemory("   ")).toBe("");
  });

  it("is read into a new chat, and into a chat with no client", () => {
    const memories = ["Works on iOS for Wedge.", "Prefers bullet points."];
    expect(chatContext({ askerName: "Nasir Javed", roleLabel: "Developer", clientName: "Wedge", today: "2026-11-26", memories })).toContain(
      "What Nasir asked you to remember:\n- Works on iOS for Wedge.\n- Prefers bullet points.",
    );
    expect(noClientContext({ askerName: "Nasir Javed", roleLabel: "Developer", today: "2026-11-26", where: "channel", memories })).toContain("Prefers bullet points.");
  });

  it("never stores something that looks like a password or key", () => {
    expect(body("remember")).toContain("findSecrets(note).length");
  });
});

describe("the calendar (§173)", () => {
  it("is the asker's own, and never read in a channel", () => {
    const b = body("my_calendar");
    expect(b).toContain("if (scope.inChannel) return");
    expect(b).toContain("where: { id: scope.user.id }, select: { googleOAuthRefreshToken: true }");
  });
});

describe("the link check (§173)", () => {
  it("says what opens, what doesn't and the fix", () => {
    const text = linksText({
      clientId: "c1",
      clientName: "Wedge",
      clientSlug: "wedge",
      links: [
        { kind: "design", name: "Wedge App UI Design System", url: "https://figma.com/design/abc", ok: true, problem: null, fix: null },
        { kind: "design", name: "Full Design", url: "https://figma.com/design/def", ok: false, problem: "Foundry's Figma account can't open this file.", fix: "Share it." },
      ],
      gaps: ["No GitHub repository linked on any platform in Portal → Platforms."],
    });
    expect(text).toContain("Design: Wedge App UI Design System: opens.");
    expect(text).toContain("Design: Full Design: doesn't open. Foundry's Figma account can't open this file. Fix: Share it.");
    expect(text).toContain("No GitHub repository linked");
  });
});
