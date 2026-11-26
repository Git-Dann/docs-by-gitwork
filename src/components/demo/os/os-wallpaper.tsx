"use client";

import { cn } from "@/lib/format";

export type WallpaperId = "indigo" | "dusk" | "cream";

export const WALLPAPERS: { id: WallpaperId; label: string; css: string; dark: boolean }[] = [
  {
    id: "indigo",
    label: "Production",
    css: "radial-gradient(60% 55% at 18% 20%,#4338CA 0%,transparent 70%),radial-gradient(55% 60% at 85% 85%,#7E22CE 0%,transparent 70%),radial-gradient(45% 45% at 10% 95%,#0E7490 0%,transparent 70%),#07070C",
    dark: true,
  },
  {
    id: "dusk",
    label: "Late deploy",
    css: "radial-gradient(70% 60% at 80% 10%,#F97316 0%,transparent 65%),radial-gradient(70% 70% at 15% 90%,#4F46E5 0%,transparent 70%),#140A1F",
    dark: true,
  },
  {
    id: "cream",
    label: "Gitwork cream",
    css: "radial-gradient(60% 60% at 80% 20%,#E0E7FF 0%,transparent 70%),radial-gradient(60% 60% at 10% 90%,#EDE9FE 0%,transparent 70%),#ECEAE3",
    dark: false,
  },
];

export function wallpaperById(id: WallpaperId) {
  return WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0];
}

/**
 * The desktop picture: a gradient field plus slow light-trail waves, the shape of
 * vorssaint.com's wallpaper in Gitwork's indigo. Motion is CSS-only and stops under
 * prefers-reduced-motion.
 */
export function Wallpaper({ id, party }: { id: WallpaperId; party: boolean }) {
  const w = wallpaperById(id);
  const stroke = w.dark ? "rgba(199,210,254," : "rgba(79,70,229,";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: w.css }}>
      <svg
        className={cn("os-waves absolute -left-[10%] top-[18%] h-[90%] w-[120%]", party && "os-party")}
        viewBox="0 0 1600 900"
        preserveAspectRatio="none"
      >
        {Array.from({ length: 9 }).map((_, i) => {
          const y = 230 + i * 44;
          const amp = 90 + i * 6;
          return (
            <path
              key={i}
              d={`M0 ${y} C 300 ${y - amp}, 600 ${y + amp}, 900 ${y} S 1400 ${y - amp * 0.7}, 1600 ${y + 20}`}
              fill="none"
              stroke={`${stroke}${0.06 + (i === 4 ? 0.32 : i % 3 === 0 ? 0.14 : 0.07)})`}
              strokeWidth={i === 4 ? 2.2 : 1.2}
              style={{ animationDelay: `${-i * 1.7}s` }}
            />
          );
        })}
      </svg>
      <style>{`
        .os-waves path { animation: os-wave 18s ease-in-out infinite alternate; transform-origin: center; }
        @keyframes os-wave { from { transform: translateY(-14px) scaleY(0.96); } to { transform: translateY(14px) scaleY(1.04); } }
        .os-party { animation: os-hue 3s linear infinite; }
        @keyframes os-hue { to { filter: hue-rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .os-waves path, .os-party { animation: none; } }
      `}</style>
    </div>
  );
}
