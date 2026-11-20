"use client";

/**
 * Two columns of cards that end level, whatever the cards are.
 *
 * Each card goes in whichever column is shorter at the point it is placed (in order), so a tall
 * card on one side is answered by the next few on the other instead of leaving a gap under the
 * short side. That is the rule two fixed lists of cards could never keep: which cards a page shows
 * depends on who is looking, and a list that suited one viewer left a big empty column for another.
 *
 * Cards are absolutely positioned inside one parent, so moving a card between columns never
 * remounts it (an open form or an upload keeps its state). A card's own height can change
 * (editing, data arriving); it stays where it is and only the cards after it move. Below
 * `minWidth` it is one ordinary column in order.
 *
 * The placement maths is pure (`placeCards`) and tested.
 */
import { Children, isValidElement, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type CardPlacement = { column: 0 | 1; top: number };

/** Place cards in order, each in the shorter column (left on a tie). */
export function placeCards(heights: number[], gap: number): { placements: CardPlacement[]; height: number } {
  const cols: [number, number] = [0, 0];
  const placements = heights.map((h) => {
    const column: 0 | 1 = cols[1] < cols[0] ? 1 : 0;
    const top = cols[column];
    cols[column] += h + gap;
    return { column, top };
  });
  const tallest = Math.max(cols[0], cols[1]);
  return { placements, height: Math.max(0, tallest - (heights.length ? gap : 0)) };
}

function useWide(minWidth: number): boolean {
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, [minWidth]);
  return wide;
}

export function BalancedColumns({
  children,
  gap = 20,
  minWidth = 1024,
}: {
  children: ReactNode;
  gap?: number;
  /** Viewport width (px) from which there are two columns. Matches Tailwind's `lg`. */
  minWidth?: number;
}) {
  const items = Children.toArray(children).filter(isValidElement);
  const keys = items.map((c, i) => String(c.key ?? i));
  const wide = useWide(minWidth);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const [heights, setHeights] = useState<Record<string, number>>({});

  const measure = useCallback(() => {
    const next: Record<string, number> = {};
    refs.current.forEach((el, key) => {
      next[key] = el.getBoundingClientRect().height;
    });
    setHeights((prev) => {
      const same = Object.keys(next).length === Object.keys(prev).length && Object.entries(next).every(([k, v]) => Math.abs((prev[k] ?? -1) - v) < 0.5);
      return same ? prev : next;
    });
  }, []);

  const keyList = keys.join("|");
  // Measure before paint when the set of cards changes, then follow every height change.
  useLayoutEffect(() => {
    if (!wide) return;
    measure();
    const cleanups: (() => void)[] = [];
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => measure());
      refs.current.forEach((el) => ro.observe(el));
      cleanups.push(() => ro.disconnect());
    }
    // Content arriving inside a card (a query resolving, a section opening) also changes the DOM.
    // ResizeObserver only reports when the page is drawing frames, and a background tab isn't,
    // so this catches the change either way and the cards never sit on top of each other.
    if (typeof MutationObserver !== "undefined") {
      const mo = new MutationObserver(() => measure());
      refs.current.forEach((el) => mo.observe(el, { childList: true, subtree: true, characterData: true }));
      cleanups.push(() => mo.disconnect());
    }
    return () => cleanups.forEach((c) => c());
  }, [wide, keyList, measure]);

  const { placements, height } = placeCards(
    keys.map((k) => heights[k] ?? 0),
    gap,
  );

  return (
    <div className={wide ? "relative" : "space-y-5"} style={wide ? { height } : undefined} data-balanced-columns>
      {items.map((child, i) => {
        const key = keys[i];
        const place = placements[i];
        return (
          <div
            key={key}
            ref={(el) => {
              if (el) refs.current.set(key, el);
              else refs.current.delete(key);
            }}
            // A menu that drops out of a card must sit over the card placed below it.
            className="min-w-0 focus-within:z-10"
            style={
              wide
                ? {
                    position: "absolute",
                    top: place.top,
                    left: place.column === 0 ? 0 : `calc(50% + ${gap / 2}px)`,
                    width: `calc(50% - ${gap / 2}px)`,
                  }
                : undefined
            }
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
