"use client";

/**
 * The Christmas theme's decoration (Settings → Appearance; colours in globals.css under
 * `[data-christmas]`): a tree on the logo, and snow that falls over the page and settles on
 * the tops of cards. The physics are in src/lib/seasonal/snow.ts; this file only measures the
 * cards and draws.
 *
 * Rules it keeps, like the Halloween layers:
 *  - never takes a click (`pointer-events: none`), sits under dialogs (z-45), hidden in print;
 *  - snow piles sit on a card's top EDGE, above it, so they never cover content;
 *  - only cards you can actually see get snow — one hidden behind a sticky header or another
 *    layer is left out (checked with elementFromPoint on each refresh);
 *  - nothing moves under `prefers-reduced-motion`, and nothing runs in a background tab.
 */

import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import christmasTree from "@iconify-icons/fluent-emoji-flat/christmas-tree";
import { useTheme } from "@/components/providers/theme-provider";
import {
  flakeCount,
  newFlake,
  pileFor,
  pileOutline,
  step,
  type Flake,
  type Piles,
  type Surface,
} from "@/lib/seasonal/snow";

/** The setting lives in the browser, so the server always renders "off"; match it until mounted. */
function useChristmasShown(): boolean {
  const { christmas } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && christmas;
}

/** A small tree on the bottom-right of the logo. Place inside a `relative` wrapper. */
export function ChristmasLogoBadge() {
  if (!useChristmasShown()) return null;
  return (
    <Icon
      icon={christmasTree}
      aria-hidden
      className="pointer-events-none absolute -bottom-1.5 -right-4 h-7 w-7 drop-shadow-[0_0_8px_rgba(34,197,94,0.45)]"
    />
  );
}

/** Snow over the whole app. Mount once in the shell. */
export function ChristmasSnow() {
  if (!useChristmasShown()) return null;
  return <SnowCanvas />;
}

/** What counts as something snow can land on. */
const SURFACE_SELECTOR = ".widget-card, [data-snow-surface]";
const MIN_SURFACE_WIDTH = 140;
/** How often the list of visible cards is re-read. Their positions are read every frame. */
const REFRESH_MS = 600;

function SnowCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rand = Math.random;
    const piles: Piles = new WeakMap();
    let width = 0;
    let height = 0;
    let flakes: Flake[] = [];
    let cards: Element[] = [];
    let lastRefresh = -Infinity;
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const want = flakeCount(width, height);
      if (flakes.length < want) {
        for (let i = flakes.length; i < want; i++) flakes.push(newFlake(width, rand, false, height));
      } else flakes = flakes.slice(0, want);
    };

    /** Cards whose top edge is on screen and not covered by something else. */
    const refresh = () => {
      const found: Element[] = [];
      document.querySelectorAll(SURFACE_SELECTOR).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < MIN_SURFACE_WIDTH || r.top < 8 || r.top > height - 4) return;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 3);
        if (hit && (hit === el || el.contains(hit))) found.push(el);
      });
      cards = found;
    };

    const draw = (surfaces: Surface[]) => {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      ctx.clearRect(0, 0, width, height);

      // Piles: a white mound along each card's top edge.
      ctx.fillStyle = dark ? "rgba(248,250,252,0.92)" : "#F8FAFD";
      ctx.strokeStyle = dark ? "rgba(255,255,255,0.35)" : "rgba(148,163,184,0.75)";
      ctx.lineWidth = 1;
      for (const s of surfaces) {
        const pile = pileFor(piles, s);
        let any = false;
        for (let i = 0; i < pile.length; i++) if (pile[i] > 0.4) { any = true; break; }
        if (!any) continue;
        const pts = pileOutline(pile, s);
        ctx.beginPath();
        ctx.moveTo(s.left, s.top);
        ctx.lineTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i].x + pts[i + 1].x) / 2;
          const my = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.lineTo(s.left + s.width, s.top);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Flakes. On a light page a white dot is invisible, so they're a pale icy slate there.
      ctx.fillStyle = dark ? "rgba(255,255,255,0.85)" : "rgba(186,200,218,0.9)";
      for (const f of flakes) {
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (now - lastRefresh > REFRESH_MS) {
        refresh();
        lastRefresh = now;
      }
      const surfaces: Surface[] = [];
      for (const el of cards) {
        if (!el.isConnected) continue;
        const r = el.getBoundingClientRect();
        if (r.top < 8 || r.top > height) continue;
        surfaces.push({ key: el, left: r.left, top: r.top, width: r.width });
      }
      step(flakes, surfaces, piles, dt, now / 1000, { width, height }, rand);
      draw(surfaces);
      raf = requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame((t) => {
      last = t;
      frame(t);
    });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      data-christmas-snow
      className="pointer-events-none fixed inset-0 z-[45] print:hidden"
    />
  );
}
