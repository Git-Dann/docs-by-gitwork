"use client";

/**
 * Vendored from EasyUI — https://github.com/Surajmaurya1/easyui
 *   src/lib/chart-primitives.tsx (only the pieces FunnelChart + ActivityHeatmap use)
 *   src/lib/dashboard-chart-utils.ts (`pctText`)
 * MIT License, Copyright (c) 2026 Suraj Maurya — full text in docs/third-party-ui.md.
 *
 * Foundry changes, and only these:
 *  - `cx` is Foundry's `cn` (`@/lib/format`), same contract.
 *  - Colours are Foundry tokens (`--surface-*`, `--text-*`, `--border-*`) instead of fixed
 *    neutral/white/black values, so the tooltip reads correctly in light AND dark mode.
 *  - Numbers format as en-GB.
 * Behaviour (sizing, dismissal, the spring-following tooltip) is unchanged.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { motion, useSpring } from "framer-motion";
import { cn } from "@/lib/format";

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
export const cx = cn;

export const fullFmt = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
export const defaultFormat = (n: number) => fullFmt.format(n);
export const pctText = (x: number) => `${Math.abs(x) >= 10 ? Math.round(x) : x.toFixed(1)}%`;

export const ring = "ring-1 ring-[var(--border-2)]";
export const muted = "text-[var(--text-4)]";

/** Container width via ResizeObserver (initial value keeps SSR output sensible) */
export function useElementWidth<T extends HTMLElement>(initial: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.round(el.clientWidth) || initial);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return [ref, width] as const;
}

/** Clear a hover/tap selection when the user taps outside the chart (touch) */
export function useDismissOutside(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [ref, open, close]);
}

/* ---------------------------------- Tooltip -------------------------------- */

export function Tooltip({
  pos,
  boundsWidth,
  children,
}: {
  pos: { x: number; y: number } | null;
  boundsWidth: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(false);
  const x = useSpring(0, { stiffness: 520, damping: 42, mass: 0.6 });
  const y = useSpring(0, { stiffness: 520, damping: 42, mass: 0.6 });

  useLayoutEffect(() => {
    if (!pos) {
      seen.current = false;
      return;
    }
    const w = ref.current?.offsetWidth ?? 130;
    const h = ref.current?.offsetHeight ?? 60;
    const tx = clamp(pos.x - w / 2, 0, Math.max(0, boundsWidth - w));
    let ty = pos.y - h - 12;
    if (ty < 0) ty = pos.y + 18;
    if (!seen.current) {
      x.jump(tx);
      y.jump(ty);
      seen.current = true;
    } else {
      x.set(tx);
      y.set(ty);
    }
  }, [pos, boundsWidth, x, y]);

  return (
    <motion.div
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute left-0 top-0 z-20 min-w-[112px] rounded-xl bg-[var(--surface-0)] px-3 py-2 text-[12px] text-[var(--text-2)] shadow-lg ${ring}`}
      style={{ x, y }}
      initial={false}
      animate={{ opacity: pos ? 1 : 0 }}
      transition={{ duration: 0.14, ease: EASE_OUT }}
      data-easyui-tooltip=""
    >
      {children}
    </motion.div>
  );
}
