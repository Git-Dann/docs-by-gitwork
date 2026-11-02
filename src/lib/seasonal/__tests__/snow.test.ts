import { describe, expect, it } from "vitest";
import { COL_W, MAX_PILE, flakeCount, pileFor, settle, step, type Flake, type Piles, type Surface } from "../snow";

const fixed = () => 0.5;
const card = (over: Partial<Surface> = {}): Surface => ({ key: {}, left: 100, top: 300, width: 200, ...over });

function flakeAt(x: number, y: number): Flake {
  return { x, y, r: 2, vy: 100, sway: 0, phase: 0 };
}

describe("snow on cards", () => {
  it("a flake that reaches a card's top lands there and starts again from the top", () => {
    const piles: Piles = new WeakMap();
    const s = card();
    const flakes = [flakeAt(200, 295)];
    step(flakes, [s], piles, 0.1, 0, { width: 800, height: 600 }, fixed);
    const pile = pileFor(piles, s);
    expect(Math.max(...pile)).toBeGreaterThan(0);
    expect(flakes[0].y).toBeLessThan(0); // respawned above the screen
  });

  it("a flake that misses every card keeps falling, and nothing piles up", () => {
    const piles: Piles = new WeakMap();
    const s = card();
    const flakes = [flakeAt(500, 295)];
    step(flakes, [s], piles, 0.1, 0, { width: 800, height: 600 }, fixed);
    expect(Math.max(...pileFor(piles, s))).toBe(0);
    expect(flakes[0].y).toBeGreaterThan(295);
  });

  it("a flake already below a card's top doesn't land on it (it fell past its edge)", () => {
    const piles: Piles = new WeakMap();
    const s = card();
    const flakes = [flakeAt(200, 320)];
    step(flakes, [s], piles, 0.1, 0, { width: 800, height: 600 }, fixed);
    expect(Math.max(...pileFor(piles, s))).toBe(0);
  });

  it("piles stop at MAX_PILE, thinner at the card's edges", () => {
    const s = card();
    const piles: Piles = new WeakMap();
    const pile = pileFor(piles, s);
    for (let i = 0; i < 500; i++) {
      settle(pile, 0, 2);
      settle(pile, Math.floor(pile.length / 2), 2);
    }
    expect(Math.max(...pile)).toBeLessThanOrEqual(MAX_PILE);
    expect(pile[0]).toBeLessThan(pile[Math.floor(pile.length / 2)]);
  });

  it("piles melt over time", () => {
    const s = card();
    const piles: Piles = new WeakMap();
    const pile = pileFor(piles, s);
    settle(pile, 10, 4);
    const before = pile[10];
    step([], [s], piles, 1, 0, { width: 800, height: 600 }, fixed);
    expect(pile[10]).toBeLessThan(before);
  });

  it("a card that changes width keeps its snow (resampled, not lost)", () => {
    const key = {};
    const piles: Piles = new WeakMap();
    const pile = pileFor(piles, card({ key, width: 200 }));
    pile.fill(5);
    const wider = pileFor(piles, card({ key, width: 400 }));
    expect(wider.length).toBe(Math.ceil(400 / COL_W));
    expect(Math.min(...wider)).toBe(5);
  });

  it("flake count scales with the screen, within bounds", () => {
    expect(flakeCount(390, 844)).toBeGreaterThanOrEqual(30);
    expect(flakeCount(3840, 2160)).toBeLessThanOrEqual(160);
  });
});
