"use client";

/**
 * Plays a Lottie animation (docs/motion.md). The one Lottie player in Foundry: use it rather
 * than importing lottie-web anywhere else.
 *
 * - **Cheap until used.** lottie-web's light build (SVG only, ~45KB gzipped) is fetched the
 *   first time one of these mounts, and the animation JSON is fetched from `src` (keep files in
 *   `public/motion/`), so neither is in any page's bundle.
 * - **Stops when nobody can see it.** Paused while off-screen or in a background tab, and
 *   destroyed on unmount, so a page full of these costs nothing while you're elsewhere.
 * - **Reduced motion:** shows one still frame (`stillFrame`, default the first) and never plays.
 * - **Never breaks the page.** A failed fetch, a bad file or no SVG support renders nothing and
 *   logs once; the box keeps its size so the layout doesn't jump.
 * - **Recolour without editing the file:** `color` replaces every solid fill and stroke, so a
 *   black silhouette can sit on a dark ground.
 *
 * Decorative by default (`aria-hidden`). Pass `label` when the animation carries meaning.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/format";

type LottieData = Record<string, unknown>;
interface LottiePlayer {
  play: () => void;
  pause: () => void;
  destroy: () => void;
  goToAndStop: (frame: number, isFrame: boolean) => void;
  setSpeed: (speed: number) => void;
}

const dataCache = new Map<string, Promise<LottieData>>();

/** One fetch per file, shared by every player that shows it (a sky full of bats is one request). */
export function loadLottieData(src: string): Promise<LottieData> {
  let hit = dataCache.get(src);
  if (!hit) {
    hit = fetch(src).then((r) => {
      if (!r.ok) throw new Error(`${src}: HTTP ${r.status}`);
      return r.json() as Promise<LottieData>;
    });
    // A failure is not cached, so the next mount can try again.
    hit.catch(() => dataCache.delete(src));
    dataCache.set(src, hit);
  }
  return hit;
}

/** "#RRGGBB" → Lottie's [r, g, b, a] in 0–1, or null for anything else. */
export function hexToLottieColor(hex: string): [number, number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}

/**
 * A copy of `data` with every static solid fill (`fl`) and stroke (`st`) colour replaced.
 * Never mutates the input: the parsed file is cached and shared between players.
 */
export function recolorLottie(data: LottieData, hex: string): LottieData {
  const rgba = hexToLottieColor(hex);
  if (!rgba) return data;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const obj = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = walk(v);
    const c = obj.c as { a?: number; k?: unknown } | undefined;
    if ((obj.ty === "fl" || obj.ty === "st") && c && c.a === 0) out.c = { ...c, k: rgba };
    return out;
  };
  return walk(data) as LottieData;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export interface LottieProps {
  /** URL of the animation JSON, normally `/motion/<name>.json`. */
  src: string;
  loop?: boolean;
  autoplay?: boolean;
  speed?: number;
  /** Replace every solid fill and stroke with this hex colour. */
  color?: string;
  /** The frame shown when motion is reduced. */
  stillFrame?: number;
  /** Accessible name. Omit for decoration (the default), which hides it from assistive tech. */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Lottie({ src, loop = true, autoplay = true, speed = 1, color, stillFrame = 0, label, className, style }: LottieProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let player: LottiePlayer | null = null;
    let cancelled = false;
    let visible = true;
    let observer: IntersectionObserver | null = null;
    const still = prefersReducedMotion();

    const sync = () => {
      if (!player || still || !autoplay) return;
      if (visible && document.visibilityState === "visible") player.play();
      else player.pause();
    };

    void Promise.all([import("lottie-web/build/player/lottie_light"), loadLottieData(src)])
      .then(([mod, raw]) => {
        if (cancelled) return;
        const lottie = (mod as unknown as { default: { loadAnimation: (o: Record<string, unknown>) => LottiePlayer } }).default;
        player = lottie.loadAnimation({
          container: el,
          renderer: "svg",
          loop,
          autoplay: false,
          animationData: color ? recolorLottie(raw, color) : raw,
          rendererSettings: { preserveAspectRatio: "xMidYMid meet", progressiveLoad: true },
        });
        player.setSpeed(speed);
        if (still || !autoplay) player.goToAndStop(stillFrame, true);
        if (typeof IntersectionObserver !== "undefined") {
          observer = new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? true;
            sync();
          });
          observer.observe(el);
        }
        sync();
      })
      .catch((err) => {
        console.warn("[lottie] not shown:", err instanceof Error ? err.message : err);
      });

    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", sync);
      observer?.disconnect();
      player?.destroy();
      player = null;
    };
  }, [src, loop, autoplay, speed, color, stillFrame]);

  return (
    <div
      ref={ref}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("pointer-events-none [&_svg]:block", className)}
      style={style}
    />
  );
}
