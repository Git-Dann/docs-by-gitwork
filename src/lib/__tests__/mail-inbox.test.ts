import { describe, expect, it } from "vitest";
import { DEFAULT_INBOX_QUERY, dateIso, gmailThreadLink, parseFrom, safeQuery } from "@/lib/mail-inbox";

describe("mail inbox helpers", () => {
  it("reads a name and address from a From header", () => {
    expect(parseFrom('"Luke McFarland" <Luke@BigWedgeGolf.com>')).toEqual({ name: "Luke McFarland", email: "luke@bigwedgegolf.com" });
    expect(parseFrom("Syed <syed@gitwork.co.uk>")).toEqual({ name: "Syed", email: "syed@gitwork.co.uk" });
    expect(parseFrom("noreply@x.com")).toEqual({ name: "noreply@x.com", email: "noreply@x.com" });
    expect(parseFrom("<a@b.com>")).toEqual({ name: "a@b.com", email: "a@b.com" });
  });

  it("links to the thread in the right account", () => {
    expect(gmailThreadLink("18f2", "dan@gitwork.co.uk")).toBe("https://mail.google.com/mail/?authuser=dan%40gitwork.co.uk#all/18f2");
    expect(gmailThreadLink("18f2", null)).toBe("https://mail.google.com/mail/#all/18f2");
  });

  it("keeps a Gmail search, refuses anything else", () => {
    expect(safeQuery(null)).toBe(DEFAULT_INBOX_QUERY);
    expect(safeQuery("from:luke@bigwedgegolf.com is:unread")).toBe("from:luke@bigwedgegolf.com is:unread");
    expect(safeQuery("in:inbox; drop table")).toBe(DEFAULT_INBOX_QUERY);
    expect(safeQuery("   ")).toBe(DEFAULT_INBOX_QUERY);
  });

  it("reads mail dates or says it couldn't", () => {
    expect(dateIso("Wed, 04 Nov 2026 10:00:00 +0000")).toBe("2026-11-04T10:00:00.000Z");
    expect(dateIso("not a date")).toBeNull();
  });
});
