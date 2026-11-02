/**
 * Snow that settles on the tops of cards (the Christmas theme). Pure: no DOM, no canvas — the
 * component feeds it card rectangles and draws what it returns, so the physics can be tested.
 *
 * The approach is bounding-box collision: each flake falls until it reaches the top edge of a
 * card (plus whatever snow is already piled there), then joins that card's pile and a new flake
 * starts at the top of the screen. Piles live in columns `COL_W` pixels wide, capped at
 * `MAX_PILE`, and melt slowly so they never grow into a wall.
 *
 * Piles sit ABOVE a card's top edge, in the gap between cards, so snow never covers content.
 */

export const COL_W = 4;
export const MAX_PILE = 9;
/** Pixels of pile lost per second, so a long session doesn't end in a uniform white strip. */
export const MELT_PER_SEC = 0.12;

export interface Flake {
  x: number;
  y: number;
  r: number;
  /** Fall speed, px/s. */
  vy: number;
  /** Sideways sway: amplitude (px/s) and phase. */
  sway: number;
  phase: number;
}

export interface Surface {
  /** Stable key for the card (the component maps elements to these). */
  key: object;
  left: number;
  top: number;
  width: number;
}

export type Piles = WeakMap<object, Float32Array>;

export function flakeCount(width: number, height: number): number {
  return Math.max(30, Math.min(160, Math.round((width * height) / 11000)));
}

export function newFlake(width: number, rand: () => number, atTop = true, height = 0): Flake {
  const r = 1 + rand() * 2.2;
  return {
    x: rand() * width,
    y: atTop ? -10 - rand() * 40 : rand() * height,
    r,
    vy: 22 + r * 14 + rand() * 18,
    sway: 6 + rand() * 14,
    phase: rand() * Math.PI * 2,
  };
}

/** The pile for a card, resized (by resampling) if the card changed width. */
export function pileFor(piles: Piles, s: Surface): Float32Array {
  const cols = Math.max(1, Math.ceil(s.width / COL_W));
  const old = piles.get(s.key);
  if (old && old.length === cols) return old;
  const next = new Float32Array(cols);
  if (old) {
    for (let i = 0; i < cols; i++) next[i] = old[Math.min(old.length - 1, Math.floor((i / cols) * old.length))];
  }
  piles.set(s.key, next);
  return next;
}

/** Add a landed flake to a pile, spreading it over its neighbours so piles are mounds, not spikes. */
export function settle(pile: Float32Array, col: number, amount: number): void {
  const spread = [0.25, 0.6, 1, 0.6, 0.25];
  for (let k = 0; k < spread.length; k++) {
    const i = col + k - 2;
    if (i < 0 || i >= pile.length) continue;
    // Thinner towards the card's edges, like snow sliding off.
    const edge = Math.min(i, pile.length - 1 - i);
    const edgeCap = edge < 2 ? MAX_PILE * 0.35 : edge < 5 ? MAX_PILE * 0.7 : MAX_PILE;
    pile[i] = Math.min(edgeCap, pile[i] + amount * spread[k]);
  }
}

/**
 * Advance every flake by `dt` seconds. A flake that reaches the top of a surface (above its
 * pile) lands there and starts again from the top of the screen.
 */
export function step(
  flakes: Flake[],
  surfaces: readonly Surface[],
  piles: Piles,
  dt: number,
  t: number,
  view: { width: number; height: number },
  rand: () => number,
): void {
  for (const s of surfaces) {
    const pile = pileFor(piles, s);
    const melt = MELT_PER_SEC * dt;
    for (let i = 0; i < pile.length; i++) if (pile[i] > 0) pile[i] = Math.max(0, pile[i] - melt);
  }

  for (let n = 0; n < flakes.length; n++) {
    const f = flakes[n];
    const prevY = f.y;
    f.y += f.vy * dt;
    f.x += Math.sin(t * 0.9 + f.phase) * f.sway * dt;

    let landed = false;
    for (const s of surfaces) {
      if (f.x < s.left || f.x > s.left + s.width) continue;
      const pile = pileFor(piles, s);
      const col = Math.min(pile.length - 1, Math.max(0, Math.floor((f.x - s.left) / COL_W)));
      const ground = s.top - pile[col];
      // Crossed the surface this step (from above it): land.
      if (prevY + f.r <= ground && f.y + f.r >= ground) {
        settle(pile, col, f.r * 0.9);
        landed = true;
        break;
      }
    }

    if (landed || f.y - f.r > view.height || f.x < -20 || f.x > view.width + 20) {
      flakes[n] = newFlake(view.width, rand);
    }
  }
}

/** The outline of a pile as points along the card's top edge (left to right), for drawing. */
export function pileOutline(pile: Float32Array, s: Pick<Surface, "left" | "top">): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < pile.length; i++) pts.push({ x: s.left + i * COL_W + COL_W / 2, y: s.top - pile[i] });
  return pts;
}
