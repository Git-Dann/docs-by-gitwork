import { describe, expect, it } from "vitest";
import { cardProgress, isProductCard, linkProblem, type LinkCandidate } from "../product-cards";

const card: LinkCandidate = { id: "card", clientId: "wedge", itemType: "feature", productCardId: null };

describe("product cards", () => {
  it("a task is a card when it has a known item type", () => {
    expect(isProductCard({ itemType: "feature" })).toBe(true);
    expect(isProductCard({ itemType: "bug" })).toBe(true);
    expect(isProductCard({ itemType: null })).toBe(false);
    expect(isProductCard({ itemType: "epic" })).toBe(false);
  });

  it("progress counts linked dev tasks; nothing linked is null, not 0%", () => {
    expect(cardProgress([])).toBeNull();
    expect(cardProgress(["DONE", "DOING", "IN_REVIEW", "TODO"])).toEqual({ linked: 4, done: 1, doing: 2 });
  });
});

describe("linking a dev task to a card", () => {
  const dev = { id: "dev", clientId: "wedge", isCard: false };

  it("allows a dev task on the same client to deliver a card", () => {
    expect(linkProblem(dev, card)).toBeNull();
    expect(linkProblem({ ...dev, id: null }, card)).toBeNull();
  });

  it("refuses a missing card, itself, another client, and a plain task", () => {
    expect(linkProblem(dev, null)).toMatch(/doesn't exist/);
    expect(linkProblem({ ...dev, id: "card" }, card)).toMatch(/itself/);
    expect(linkProblem(dev, { ...card, clientId: "fellas" })).toMatch(/same client/);
    expect(linkProblem(dev, { ...card, itemType: null })).toMatch(/product card/);
  });

  it("is one level: no linking to a card that links on, and a card can't deliver a card", () => {
    expect(linkProblem(dev, { ...card, productCardId: "other" })).toMatch(/itself linked/);
    expect(linkProblem({ ...dev, isCard: true }, card)).toMatch(/can't deliver another card/);
  });
});
