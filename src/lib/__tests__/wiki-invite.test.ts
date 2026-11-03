/**
 * The sign-in message Dan pastes to a client. The password is only known when it was just
 * set, so the two shapes — with and without it — are both pinned.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { greetingName, wikiInviteText } from "@/lib/wiki-invite";

const base = { clientName: "Big Wedge", link: "https://foundry.gitwork.co.uk/wiki/wedge/tok123", email: "luke@bigwedge.com" };

describe("the sign-in message", () => {
  it("has the link, email and the password when it was just set", () => {
    const t = wikiInviteText({ ...base, name: "Luke Hammond", password: "Ab3dEf9hJk2m" })!;
    expect(t).toContain("Hi Luke,");
    expect(t).toContain("Big Wedge project wiki");
    expect(t).toContain("Link: https://foundry.gitwork.co.uk/wiki/wedge/tok123");
    expect(t).toContain("Email: luke@bigwedge.com");
    expect(t).toContain("Password: Ab3dEf9hJk2m");
  });

  it("⚠️ says the password was sent separately when it isn't known — never a blank", () => {
    const t = wikiInviteText(base)!;
    expect(t).toContain("Password: sent to you separately");
    expect(t).not.toMatch(/Password:\s*$/m);
    expect(wikiInviteText({ ...base, password: "   " })).toContain("sent to you separately");
  });

  it("⚠️ is null when the wiki isn't shared — a message with no link would strand them", () => {
    expect(wikiInviteText({ ...base, link: null, password: "x".repeat(12) })).toBeNull();
  });

  it("greets by first name, or 'there'", () => {
    expect(greetingName("  Priya   Nair ")).toBe("Priya");
    expect(greetingName(null)).toBe("there");
    expect(greetingName("")).toBe("there");
  });
});

describe("Settings", () => {
  const src = readFileSync(join(process.cwd(), "src/components/clients/wiki/wiki-access-settings.tsx"), "utf8");

  it("numbers its cards in render order — no hard-coded numbers to skip or repeat", () => {
    expect(src).toContain("const next = () => String(++n).padStart(2, \"0\");");
    expect(src).not.toMatch(/label--number">0\d</);
    for (const f of ["wiki-intake-categories-panel.tsx", "wiki-linked-clients.tsx"]) {
      const panel = readFileSync(join(process.cwd(), "src/components/clients/wiki", f), "utf8");
      expect(panel, f).not.toMatch(/label--number">0\d</);
    }
  });

  it("hides the per-page list while the whole-wiki link is on", () => {
    expect(src).toContain("Every page is in the wiki link.");
    expect(src).not.toContain("Included in the full-wiki link");
  });

  it("every fold starts closed", () => {
    expect(src).toContain("<details");
    expect(src).not.toMatch(/<details[^>]*\bopen\b/);
  });

  it("API intake and Linked clients sit side by side in one grid", () => {
    const grid = src.slice(src.indexOf("xl:grid-cols-2"), src.indexOf("</div>", src.indexOf("xl:grid-cols-2")));
    expect(grid).toContain("<WikiApiIntakeSettings");
    expect(grid).toContain("<WikiLinkedClients");
  });

  it("the user dialog is the shared Modal, not a hand-rolled overlay", () => {
    expect(src).toContain("<Modal");
    expect(src).not.toContain('className="fixed inset-0 z-50');
  });
});
