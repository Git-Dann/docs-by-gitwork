"use client";

import { useMemo } from "react";

/**
 * A small, self-contained confetti burst in the brand blue family (docs/motion.md). Absolutely
 * positioned: put it inside a `relative` box. Hidden under reduced motion. Used by the Morning
 * Brief's all-done card and achievements.
 */
export function Confetti() {
  const pieces = useMemo(() => {
    // Deterministic-ish spread so it doesn't reshuffle on re-render.
    const colors = ["var(--brand-400)", "var(--brand-500)", "var(--brand-600)", "var(--brand-300)"];
    return Array.from({ length: 26 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 26 + (i % 3);
      const dist = 60 + (i % 5) * 26;
      return {
        tx: `${Math.cos(angle) * dist}px`,
        ty: `${Math.sin(angle) * dist - 10}px`,
        rot: `${(i * 47) % 360}deg`,
        color: colors[i % colors.length],
        delay: `${(i % 6) * 0.02}s`,
        dot: i % 2 === 0,
      };
    });
  }, []);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-visible motion-reduce:hidden">
      <style>{`@keyframes briefConfetti{0%{opacity:1;transform:translate(-50%,-50%) rotate(0) scale(1)}100%{opacity:0;transform:translate(calc(-50% + var(--tx)),calc(-50% + var(--ty))) rotate(var(--rot)) scale(0.6)}}`}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={
            {
              position: "absolute",
              left: "50%",
              top: "40%",
              width: p.dot ? 7 : 4,
              height: 7,
              background: p.color,
              borderRadius: p.dot ? "9999px" : "1px",
              "--tx": p.tx,
              "--ty": p.ty,
              "--rot": p.rot,
              animation: `briefConfetti 1.6s cubic-bezier(0.22,0.61,0.36,1) ${p.delay} forwards`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
