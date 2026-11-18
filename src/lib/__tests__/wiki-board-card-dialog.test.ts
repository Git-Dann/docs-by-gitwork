/**
 * The card dialog's rules (src/lib/wiki-board-card-dialog.ts): who may change what on an open
 * card, how its activity is ordered, and which links and images it takes.
 */
import { describe, expect, it } from "vitest";
import { addCardLink, addedSubItemId, cardActivity, cardEditing, indexAfterRemoval, linkLabel, pickCardImages, showsPeople } from "@/lib/wiki-board-card-dialog";
import { BOARD_LIMITS } from "@/lib/wiki-board";
import type { WikiBoardFeedback } from "@/types/wiki-board";

const productCard = { isCard: true, addedByClient: false };
const clientAdded = { isCard: false, addedByClient: true };
const devTask = { isCard: false, addedByClient: false };

describe("what the viewer may change on an open card", () => {
  it("lets the client edit and move their own cards", () => {
    expect(cardEditing(productCard, "client", false)).toEqual({ fields: true, move: true });
    expect(cardEditing(clientAdded, "client", false)).toEqual({ fields: true, move: true });
  });

  it("never lets the client touch a team dev task", () => {
    expect(cardEditing(devTask, "client", false)).toEqual({ fields: false, move: false });
  });

  it("lets the team move a dev task but edit its fields only on the task board", () => {
    expect(cardEditing(devTask, "team", false)).toEqual({ fields: false, move: true });
    expect(cardEditing(productCard, "team", false)).toEqual({ fields: true, move: true });
  });

  it("changes nothing while the team previews the client's view", () => {
    expect(cardEditing(productCard, "team", true)).toEqual({ fields: false, move: false });
  });
});

describe("who works on a card", () => {
  it("is shown to the team only, and not while previewing", () => {
    expect(showsPeople("team", false)).toBe(true);
    expect(showsPeople("team", true)).toBe(false);
    expect(showsPeople("client", false)).toBe(false);
  });
});

describe("the card's activity", () => {
  const fb = (id: string, at: string): WikiBoardFeedback => ({
    id,
    kind: "comment",
    body: id,
    authorName: "Luke M.",
    side: "client",
    createdAt: at,
  });

  it("puts the thread and the imported stage dates on one line of time, oldest first", () => {
    const items = cardActivity(
      [fb("late", "2026-11-10T09:00:00Z"), fb("early", "2026-09-01T09:00:00Z")],
      [{ label: "In Development", date: "2026-10-01" }],
    );
    expect(items.map((i) => (i.kind === "stage" ? i.label : i.feedback.id))).toEqual(["early", "In Development", "late"]);
  });

  it("keeps a stage with an unreadable date rather than dropping it", () => {
    const items = cardActivity([fb("a", "2026-11-10T09:00:00Z")], [{ label: "Triage", date: "someday" }]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "stage", label: "Triage" });
  });
});

describe("adding a link", () => {
  it("takes a web link", () => {
    expect(addCardLink([], " https://example.com/a ")).toEqual({ ok: true, links: ["https://example.com/a"] });
  });

  it("refuses anything that isn't a web link", () => {
    expect(addCardLink([], "javascript:alert(1)").ok).toBe(false);
    expect(addCardLink([], "data:text/html,hi").ok).toBe(false);
    expect(addCardLink([], "").ok).toBe(false);
  });

  it("refuses a duplicate and one past the card's limit", () => {
    expect(addCardLink(["https://example.com/a"], "https://example.com/a").ok).toBe(false);
    const full = Array.from({ length: BOARD_LIMITS.links }, (_, i) => `https://example.com/${i}`);
    expect(addCardLink(full, "https://example.com/new").ok).toBe(false);
    expect(addCardLink(full.slice(1), "https://example.com/new").ok).toBe(true);
  });

  it("labels a link by its site and path", () => {
    expect(linkLabel("https://www.figma.com/file/abc")).toBe("figma.com/file/abc");
    expect(linkLabel("https://example.com/")).toBe("example.com");
  });
});

describe("picking images for a card", () => {
  const png = (name: string, size = 1000) => ({ name, type: "image/png", size });

  it("takes images the board accepts", () => {
    expect(pickCardImages(0, 0, [png("a.png")])).toEqual({ ok: true });
  });

  it("refuses an SVG, a non-image and an oversized file", () => {
    expect(pickCardImages(0, 0, [{ name: "x.svg", type: "image/svg+xml", size: 10 }]).ok).toBe(false);
    expect(pickCardImages(0, 0, [{ name: "x.pdf", type: "application/pdf", size: 10 }]).ok).toBe(false);
    expect(pickCardImages(0, 0, [png("big.png", BOARD_LIMITS.imageBytes + 1)]).ok).toBe(false);
  });

  it("counts what the card has and what's already queued against its room", () => {
    expect(pickCardImages(BOARD_LIMITS.images - 1, 0, [png("a.png")]).ok).toBe(true);
    expect(pickCardImages(BOARD_LIMITS.images - 1, 1, [png("a.png")]).ok).toBe(false);
  });
});

describe("which sub-item an add created", () => {
  const sub = (id: string, isItem = true) => ({ id, title: id, done: false, isItem });
  it("is the product sub-item that wasn't in the list before", () => {
    expect(addedSubItemId(new Set(["a"]), { subtasks: [sub("a"), sub("b")] })).toBe("b");
  });
  it("never a team checklist item, and null when nothing new shows", () => {
    expect(addedSubItemId(new Set(["a"]), { subtasks: [sub("a"), sub("k", false)] })).toBeNull();
    expect(addedSubItemId(new Set(["a"]), { subtasks: [sub("a")] })).toBeNull();
  });
});

describe("the lightbox after a screenshot is removed", () => {
  it("stays in place, steps back from the end, and closes when none are left", () => {
    expect(indexAfterRemoval(1, 3)).toBe(1);
    expect(indexAfterRemoval(3, 3)).toBe(2);
    expect(indexAfterRemoval(0, 0)).toBeNull();
  });
});
