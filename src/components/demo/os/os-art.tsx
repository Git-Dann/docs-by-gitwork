"use client";

import { useId } from "react";

/**
 * Gitwork OS — the illustrations used by the celebrations and Easter eggs. Drawn to
 * the same standard as the app icons (os-icons.tsx): lit from above-left, layered
 * gradients, a highlight and a shadow on every form, so nothing here reads as clip-art
 * next to the dock. Ids are namespaced with useId() because several copies can be on
 * screen at once.
 */

function useSvgId() {
  return `osa${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
}

/* The rocket ──────────────────────────────────────────────────────────────── */

export function RocketArt({ width = 64 }: { width?: number }) {
  const id = useSvgId();
  return (
    <svg viewBox="0 0 80 170" width={width} height={(width * 170) / 80} aria-hidden style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`${id}-hull`} x1="0" x2="1">
          <stop offset="0" stopColor="#A5B4FC" />
          <stop offset="0.28" stopColor="#F5F7FF" />
          <stop offset="0.5" stopColor="#FFFFFF" />
          <stop offset="0.78" stopColor="#C7D2FE" />
          <stop offset="1" stopColor="#6366F1" />
        </linearGradient>
        <linearGradient id={`${id}-nose`} x1="0" x2="1">
          <stop offset="0" stopColor="#3730A3" />
          <stop offset="0.45" stopColor="#6366F1" />
          <stop offset="1" stopColor="#1E1B4B" />
        </linearGradient>
        <linearGradient id={`${id}-fin`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#818CF8" />
          <stop offset="1" stopColor="#312E81" />
        </linearGradient>
        <radialGradient id={`${id}-glass`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#E0F2FE" />
          <stop offset="0.45" stopColor="#38BDF8" />
          <stop offset="1" stopColor="#0C4A6E" />
        </radialGradient>
        <linearGradient id={`${id}-nozzle`} x1="0" x2="1">
          <stop offset="0" stopColor="#3F3F46" />
          <stop offset="0.5" stopColor="#A1A1AA" />
          <stop offset="1" stopColor="#27272A" />
        </linearGradient>
        <radialGradient id={`${id}-f1`} cx="0.5" cy="0" r="1">
          <stop offset="0" stopColor="#FFFBEB" />
          <stop offset="0.35" stopColor="#FDE68A" />
          <stop offset="0.7" stopColor="#F59E0B" />
          <stop offset="1" stopColor="#EA580C" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-f2`} cx="0.5" cy="0" r="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.6" stopColor="#BAE6FD" stopOpacity="0.9" />
          <stop offset="1" stopColor="#38BDF8" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}-glow`} x="-100%" y="-50%" width="300%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* exhaust: a soft outer flame, a hot core, a blue-white heart */}
      <g className="os-art-flame" style={{ transformOrigin: "40px 122px" }}>
        <path d="M24 120q16 60 32 0z" fill={`url(#${id}-f1)`} filter={`url(#${id}-glow)`} />
        <path d="M28 120q12 42 24 0z" fill={`url(#${id}-f1)`} />
        <path d="M33 120q7 22 14 0z" fill={`url(#${id}-f2)`} />
      </g>

      {/* fins, behind the hull */}
      <path d="M22 78C12 88 6 104 6 120l18-8z" fill={`url(#${id}-fin)`} />
      <path d="M58 78c10 10 16 26 16 42l-18-8z" fill={`url(#${id}-fin)`} />
      <path d="M6 120l18-8" stroke="#C7D2FE" strokeOpacity="0.5" strokeWidth="1" />

      {/* nozzle */}
      <path d="M28 112h24l-3 10H31z" fill={`url(#${id}-nozzle)`} />

      {/* hull */}
      <path d="M40 4C58 22 62 56 58 114H22C18 56 22 22 40 4z" fill={`url(#${id}-hull)`} />
      {/* nose cone */}
      <path d="M40 4c8 8 13 18 15.5 29h-31C27 22 32 12 40 4z" fill={`url(#${id}-nose)`} />
      <path d="M24.5 33h31" stroke="#1E1B4B" strokeOpacity="0.35" strokeWidth="1.2" />
      {/* panel lines and rivets */}
      <path d="M22.4 98h35.2" stroke="#6366F1" strokeOpacity="0.35" strokeWidth="1" />
      {[30, 36, 44, 50].map((x) => (
        <circle key={x} cx={x} cy="102" r="0.9" fill="#4338CA" fillOpacity="0.5" />
      ))}
      {/* porthole: rim, glass, reflection */}
      <circle cx="40" cy="56" r="11" fill="#E0E7FF" stroke="#4338CA" strokeWidth="2.5" />
      <circle cx="40" cy="56" r="7.6" fill={`url(#${id}-glass)`} />
      <path d="M35 52.5a6 6 0 0 1 6.5-3" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      {/* the mark */}
      <text x="40" y="88" textAnchor="middle" fontSize="13" fill="#4338CA" fontFamily="'DM Serif Display', Georgia, serif">
        G.
      </text>
      {/* specular streak down the hull */}
      <path d="M33 18c-4 14-5.5 40-4.5 90" stroke="#fff" strokeOpacity="0.7" strokeWidth="2.2" strokeLinecap="round" fill="none" />

      <style>{`
        .os-art-flame { animation: os-art-flame .07s linear infinite alternate; }
        @keyframes os-art-flame { from { transform: scale(.92, .9) } to { transform: scale(1.06, 1.18) } }
        @media (prefers-reduced-motion: reduce) { .os-art-flame { animation: none } }
      `}</style>
    </svg>
  );
}

/* A billowing smoke cloud for the launch pad ─────────────────────────────── */

export function SmokeArt({ width = 260 }: { width?: number }) {
  const id = useSvgId();
  const puffs = [
    { x: 40, y: 64, r: 30 },
    { x: 84, y: 54, r: 36 },
    { x: 130, y: 48, r: 42 },
    { x: 176, y: 54, r: 36 },
    { x: 220, y: 64, r: 30 },
    { x: 104, y: 76, r: 30 },
    { x: 156, y: 76, r: 30 },
  ];
  return (
    <svg viewBox="0 0 260 110" width={width} height={(width * 110) / 260} aria-hidden style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={`${id}-puff`} cx="0.4" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.6" stopColor="#E4E4E7" />
          <stop offset="1" stopColor="#A1A1AA" />
        </radialGradient>
        <filter id={`${id}-soft`}>
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>
      <g filter={`url(#${id}-soft)`}>
        {puffs.map((p, i) => (
          <circle
            key={i}
            className="os-art-puff"
            cx={p.x}
            cy={p.y}
            r={p.r}
            fill={`url(#${id}-puff)`}
            style={{ transformOrigin: `${p.x}px ${p.y}px`, animationDelay: `${i * 0.05}s` }}
          />
        ))}
      </g>
      <style>{`
        .os-art-puff { animation: os-art-puff 1.5s cubic-bezier(.2,.8,.3,1) both; }
        @keyframes os-art-puff { 0% { transform: scale(.1); opacity: .95 } 60% { opacity: .85 } 100% { transform: scale(1.35) translateY(-6px); opacity: 0 } }
        @media (prefers-reduced-motion: reduce) { .os-art-puff { animation: none; opacity: 0 } }
      `}</style>
    </svg>
  );
}

/* The disco ball ─────────────────────────────────────────────────────────── */

export function DiscoBallArt({ size = 84 }: { size?: number }) {
  const id = useSvgId();
  // Mirror tiles on a sphere: rows of rectangles squeezed toward the poles and the
  // edges, each with its own brightness so the ball catches light unevenly.
  const tiles: { x: number; y: number; w: number; h: number; l: number }[] = [];
  const R = 40;
  for (let row = -6; row <= 6; row++) {
    const lat = (row / 7) * (Math.PI / 2);
    const y = 50 + Math.sin(lat) * R;
    const ringR = Math.cos(lat) * R;
    const h = 6.2 * Math.cos(lat) + 1;
    const cols = Math.max(4, Math.round(14 * Math.cos(lat)));
    for (let c = 0; c < cols; c++) {
      const lon = ((c + 0.5) / cols) * Math.PI - Math.PI / 2;
      const x = 50 + Math.sin(lon) * ringR;
      const w = Math.max(1.2, ((Math.PI * ringR) / cols) * Math.cos(lon) - 0.9);
      // Lit from the upper left.
      const light = 0.5 + 0.5 * (-Math.sin(lon) * 0.6 - Math.sin(lat) * 0.6);
      const jitter = ((row * 31 + c * 17) % 10) / 30;
      tiles.push({ x: x - w / 2, y: y - h / 2, w, h, l: Math.min(1, Math.max(0.12, light + jitter - 0.12)) });
    }
  }
  return (
    <svg viewBox="0 -40 100 140" width={size} height={(size * 140) / 100} aria-hidden style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={`${id}-base`} cx="0.35" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#C7D2FE" />
          <stop offset="0.55" stopColor="#4338CA" />
          <stop offset="1" stopColor="#0F0A2E" />
        </radialGradient>
        <radialGradient id={`${id}-sheen`} cx="0.32" cy="0.28" r="0.35">
          <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-clip`}>
          <circle cx="50" cy="50" r={R} />
        </clipPath>
      </defs>
      {/* the chain and the cap */}
      <path d="M50 -40V8" stroke="#71717A" strokeWidth="1.4" strokeDasharray="2.2 1.4" />
      <rect x="45" y="6" width="10" height="6" rx="1.5" fill="#A1A1AA" />
      <circle cx="50" cy="50" r={R} fill={`url(#${id}-base)`} />
      <g clipPath={`url(#${id}-clip)`} className="os-art-tiles">
        {tiles.map((t, i) => (
          <rect key={i} x={t.x} y={t.y} width={t.w} height={t.h} rx="0.4" fill={`hsl(${232 + t.l * 20}, ${60 - t.l * 30}%, ${30 + t.l * 62}%)`} />
        ))}
      </g>
      <circle cx="50" cy="50" r={R} fill={`url(#${id}-sheen)`} />
      <circle cx="50" cy="50" r={R} fill="none" stroke="#1E1B4B" strokeOpacity="0.6" />
      {/* glints that twinkle */}
      {[
        { x: 33, y: 30, s: 1 },
        { x: 64, y: 40, s: 0.7 },
        { x: 44, y: 66, s: 0.6 },
      ].map((g, i) => (
        <g key={i} className="os-art-glint" style={{ transformOrigin: `${g.x}px ${g.y}px`, animationDelay: `${i * 0.45}s` }}>
          <path d={`M${g.x} ${g.y - 7 * g.s}L${g.x + 1.4 * g.s} ${g.y}L${g.x} ${g.y + 7 * g.s}L${g.x - 1.4 * g.s} ${g.y}z`} fill="#fff" />
          <path d={`M${g.x - 7 * g.s} ${g.y}L${g.x} ${g.y + 1.4 * g.s}L${g.x + 7 * g.s} ${g.y}L${g.x} ${g.y - 1.4 * g.s}z`} fill="#fff" />
        </g>
      ))}
      <style>{`
        .os-art-tiles { animation: os-art-tiles 2.4s linear infinite; }
        @keyframes os-art-tiles { 50% { filter: hue-rotate(40deg) brightness(1.15) } }
        .os-art-glint { animation: os-art-glint 1.4s ease-in-out infinite; }
        @keyframes os-art-glint { 0%,100% { transform: scale(.2); opacity: 0 } 50% { transform: scale(1) rotate(45deg); opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .os-art-tiles, .os-art-glint { animation: none } }
      `}</style>
    </svg>
  );
}

/* The medal for a found secret ──────────────────────────────────────────── */

export function MedalArt({ size = 36, dim = false }: { size?: number; dim?: boolean }) {
  const id = useSvgId();
  return (
    <svg
      viewBox="0 0 48 56"
      width={size}
      height={(size * 56) / 48}
      aria-hidden
      style={{ opacity: dim ? 0.4 : 1, filter: dim ? "grayscale(1)" : "drop-shadow(0 2px 3px rgba(0,0,0,0.35))", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={`${id}-ribbonL`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#818CF8" />
          <stop offset="1" stopColor="#3730A3" />
        </linearGradient>
        <linearGradient id={`${id}-ribbonR`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="1" stopColor="#1E1B4B" />
        </linearGradient>
        <radialGradient id={`${id}-gold`} cx="0.35" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#FFFBEB" />
          <stop offset="0.3" stopColor="#FDE047" />
          <stop offset="0.7" stopColor="#EAB308" />
          <stop offset="1" stopColor="#854D0E" />
        </radialGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FEF9C3" />
          <stop offset="0.5" stopColor="#CA8A04" />
          <stop offset="1" stopColor="#FEF08A" />
        </linearGradient>
      </defs>
      {/* ribbon tails, crossed */}
      <path d="M12 0h10l6 20h-10z" fill={`url(#${id}-ribbonL)`} />
      <path d="M36 0H26l-6 20h10z" fill={`url(#${id}-ribbonR)`} />
      <path d="M16 0h2l6 20h-2z" fill="#E0E7FF" fillOpacity="0.55" />
      {/* the disc: a reeded rim, a face, an inner ring */}
      <circle cx="24" cy="35" r="17" fill={`url(#${id}-rim)`} />
      {Array.from({ length: 36 }).map((_, i) => (
        <path key={i} d="M24 18.4v1.6" stroke="#A16207" strokeOpacity="0.45" strokeWidth="0.8" transform={`rotate(${i * 10} 24 35)`} />
      ))}
      <circle cx="24" cy="35" r="14" fill={`url(#${id}-gold)`} />
      <circle cx="24" cy="35" r="11" fill="none" stroke="#A16207" strokeOpacity="0.45" strokeWidth="0.9" />
      {/* embossed G: a dark offset under a light letter */}
      <text x="24.6" y="40.6" textAnchor="middle" fontSize="15" fill="#713F12" fillOpacity="0.55" fontFamily="'DM Serif Display', Georgia, serif">
        G
      </text>
      <text x="24" y="40" textAnchor="middle" fontSize="15" fill="#FEF3C7" fontFamily="'DM Serif Display', Georgia, serif">
        G
      </text>
      {/* sheen */}
      <path d="M14.5 28a11 11 0 0 1 9-6" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/* A stuck agency habit, for Force Quit: a greyed app tile with a stalled loader ── */

export function StuckAppArt({ size = 22, seed = 0 }: { size?: number; seed?: number }) {
  const id = useSvgId();
  const hues = [0, 28, 200, 260, 330];
  const hue = hues[seed % hues.length];
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id={`${id}-t`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`hsl(${hue}, 25%, 72%)`} />
          <stop offset="1" stopColor={`hsl(${hue}, 18%, 42%)`} />
        </linearGradient>
      </defs>
      <path d="M9 0h22c7 0 9 2 9 9v22c0 7-2 9-9 9H9c-7 0-9-2-9-9V9c0-7 2-9 9-9z" fill={`url(#${id}-t)`} />
      <path d="M9 0h22c7 0 9 2 9 9v6H0V9c0-7 2-9 9-9z" fill="#fff" fillOpacity="0.18" />
      {/* a loader that stopped turning */}
      <g transform="translate(20 21)">
        {Array.from({ length: 8 }).map((_, i) => (
          <rect key={i} x="-1.3" y="-10" width="2.6" height="6" rx="1.3" fill="#fff" fillOpacity={0.25 + (i / 8) * 0.6} transform={`rotate(${i * 45})`} />
        ))}
      </g>
    </svg>
  );
}

/* A crumpled sheet, for the Trash ───────────────────────────────────────── */

export function CrumpledArt({ size = 26, seed = 0 }: { size?: number; seed?: number }) {
  const id = useSvgId();
  const tilt = ((seed * 37) % 30) - 15;
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden style={{ transform: `rotate(${tilt}deg)` }}>
      <defs>
        <radialGradient id={`${id}-p`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.7" stopColor="#E4E4E7" />
          <stop offset="1" stopColor="#A1A1AA" />
        </radialGradient>
      </defs>
      <path d="M8 12l9-6 7 3 8-2 3 9-3 7 4 7-8 5-7-3-8 3-5-8 2-7-4-5z" fill={`url(#${id}-p)`} stroke="#A1A1AA" strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M17 6l-2 9 9 2 8-10M15 15l-7 7 10 3 5 10M24 17l11 6M18 25l13 2" stroke="#A1A1AA" strokeOpacity="0.7" strokeWidth="0.8" fill="none" />
      <path d="M11 13l5-3" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/* Dust for the Poof ─────────────────────────────────────────────────────── */

export function DustCloudArt({ size = 120 }: { size?: number }) {
  const id = useSvgId();
  const blobs = [
    { x: 30, y: 62, r: 20, d: 0 },
    { x: 52, y: 52, r: 24, d: 0.03 },
    { x: 76, y: 56, r: 21, d: 0.06 },
    { x: 92, y: 66, r: 15, d: 0.08 },
    { x: 44, y: 72, r: 16, d: 0.05 },
    { x: 68, y: 74, r: 17, d: 0.07 },
  ];
  const debris = [
    { x: 20, y: 40, dx: -22, dy: -26 },
    { x: 96, y: 40, dx: 24, dy: -24 },
    { x: 60, y: 30, dx: 3, dy: -36 },
    { x: 14, y: 70, dx: -30, dy: 4 },
    { x: 106, y: 72, dx: 28, dy: 6 },
  ];
  return (
    <svg viewBox="0 0 120 100" width={size} height={(size * 100) / 120} aria-hidden style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={`${id}-d`} cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#FAFAFA" />
          <stop offset="0.65" stopColor="#D4D4D8" />
          <stop offset="1" stopColor="#71717A" />
        </radialGradient>
      </defs>
      {blobs.map((b, i) => (
        <circle
          key={i}
          className="os-art-dust"
          cx={b.x}
          cy={b.y}
          r={b.r}
          fill={`url(#${id}-d)`}
          style={{ transformOrigin: `${b.x}px ${b.y}px`, animationDelay: `${b.d}s` }}
        />
      ))}
      {debris.map((d, i) => (
        <rect
          key={`d${i}`}
          className="os-art-debris"
          x={d.x}
          y={d.y}
          width="4"
          height="3"
          rx="0.6"
          fill="#A1A1AA"
          style={{ "--dx": `${d.dx}px`, "--dy": `${d.dy}px` } as React.CSSProperties}
        />
      ))}
      <style>{`
        .os-art-dust { animation: os-art-dust .7s cubic-bezier(.2,.8,.3,1) both; }
        @keyframes os-art-dust { 0% { transform: scale(.15); opacity: 1 } 70% { opacity: .9 } 100% { transform: scale(1.25) translateY(-8px); opacity: 0 } }
        .os-art-debris { animation: os-art-debris .7s cubic-bezier(.2,.8,.3,1) both; }
        @keyframes os-art-debris { to { transform: translate(var(--dx), var(--dy)) rotate(180deg); opacity: 0 } }
        @media (prefers-reduced-motion: reduce) { .os-art-dust, .os-art-debris { animation: none; opacity: 0 } }
      `}</style>
    </svg>
  );
}
