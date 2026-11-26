"use client";

import { useId, type ReactNode } from "react";
import type { OsApp } from "@/lib/demo/os/window-manager";

/**
 * Gitwork OS app icons, drawn at 100×100 and scaled.
 *
 * Built the way macOS icons are built, so they sit right in a Mac-shaped dock: the
 * continuous-corner squircle, a top-lit base gradient, a soft top gloss, a hairline
 * inner edge (light above, dark below) and a contact shadow under the glyph. The
 * glyphs are Gitwork's own — Apple's icons are its trademarks and are not copied.
 *
 * Every gradient id is namespaced with useId(): the same icon appears in the dock,
 * on the desktop and in Spotlight at once, and SVG ids are document-global, so
 * shared ids would make one copy borrow (or lose) another's paint.
 */

// Flat sides, continuous corners (~22.5% radius with long Bezier handles), the
// macOS Big Sur outline. A plain circle-ish squircle reads as an iOS blob.
const SQUIRCLE = "M23 0h54C94 0 100 6 100 23v54c0 17-6 23-23 23H23C6 100 0 94 0 77V23C0 6 6 0 23 0z";
// A slightly inset copy, for the inner edge stroke.
const SQUIRCLE_IN = "M23 .6h54c16.6 0 22.4 5.8 22.4 22.4v54c0 16.6-5.8 22.4-22.4 22.4H23C6.4 99.4.6 93.6.6 77V23C.6 6.4 6.4.6 23 .6z";

function Tile({
  id,
  from,
  to,
  mid,
  children,
  gloss = 0.32,
}: {
  id: string;
  from: string;
  to: string;
  mid?: string;
  children: ReactNode;
  gloss?: number;
}) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={from} />
          {mid ? <stop offset="0.55" stopColor={mid} /> : null}
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={gloss} />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="1" stopColor="#000" stopOpacity="0.25" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <path d={SQUIRCLE} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <path d={SQUIRCLE} fill={`url(#${id}-bg)`} />
        {children}
        <path d={SQUIRCLE} fill={`url(#${id}-gloss)`} />
      </g>
      <path d={SQUIRCLE_IN} fill="none" stroke={`url(#${id}-edge)`} strokeWidth="1.2" />
    </>
  );
}

/** A soft shadow under a glyph, so it reads as sitting on the tile. */
function Shadow({ id }: { id: string }) {
  return (
    <filter id={`${id}-sh`} x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2.2" stdDeviation="2.4" floodColor="#000" floodOpacity="0.28" />
    </filter>
  );
}

export function AppIcon({ app, size = 52 }: { app: OsApp; size?: number }) {
  const raw = useId();
  const id = `osi${raw.replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className="block shrink-0 overflow-visible"
      // The dock shadow: a tight contact shadow plus a long soft one, as macOS draws it.
      style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.25)) drop-shadow(0 5px 9px rgba(0,0,0,0.3))" }}
    >
      {renderIcon(app, id)}
    </svg>
  );
}

function renderIcon(app: OsApp, id: string): ReactNode {
  switch (app) {
    case "foundry":
      return (
        <Tile id={id} from="#7C83FF" mid="#4F46E5" to="#1E1B4B" gloss={0.28}>
          <defs>
            <Shadow id={id} />
            <radialGradient id={`${id}-glow`} cx="0.3" cy="0.15" r="0.9">
              <stop offset="0" stopColor="#C7D2FE" stopOpacity="0.55" />
              <stop offset="0.6" stopColor="#C7D2FE" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${id}-f`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFFFFF" />
              <stop offset="1" stopColor="#E0E7FF" />
            </linearGradient>
            <radialGradient id={`${id}-dot`} cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#E0E7FF" />
              <stop offset="0.5" stopColor="#A5B4FC" />
              <stop offset="1" stopColor="#6366F1" />
            </radialGradient>
          </defs>
          <rect width="100" height="100" fill={`url(#${id}-glow)`} />
          {/* Fine rings: the forge, quietly. */}
          <circle cx="50" cy="52" r="34" fill="none" stroke="#fff" strokeOpacity="0.08" strokeWidth="1" />
          <circle cx="50" cy="52" r="26" fill="none" stroke="#fff" strokeOpacity="0.06" strokeWidth="1" />
          <g filter={`url(#${id}-sh)`}>
            <text
              x="45"
              y="71"
              textAnchor="middle"
              fontSize="58"
              fill={`url(#${id}-f)`}
              fontFamily="'DM Serif Display', 'Times New Roman', Georgia, serif"
            >
              F
            </text>
            <circle cx="70" cy="66.5" r="6" fill={`url(#${id}-dot)`} />
          </g>
        </Tile>
      );

    case "finder":
      return (
        <Tile id={id} from="#E0F2FE" to="#93C5FD" gloss={0.4}>
          <defs>
            <Shadow id={id} />
            <linearGradient id={`${id}-back`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3B82F6" />
              <stop offset="1" stopColor="#1D4ED8" />
            </linearGradient>
            <linearGradient id={`${id}-front`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#7DD3FC" />
              <stop offset="1" stopColor="#38BDF8" />
            </linearGradient>
          </defs>
          <g filter={`url(#${id}-sh)`}>
            {/* back of the folder, with its tab */}
            <path d="M18 30a5 5 0 0 1 5-5h17l6 6h31a5 5 0 0 1 5 5v40a5 5 0 0 1-5 5H23a5 5 0 0 1-5-5z" fill={`url(#${id}-back)`} />
            {/* papers peeking out */}
            <rect x="25" y="33" width="50" height="34" rx="2.5" fill="#F8FAFC" />
            <rect x="29" y="38" width="26" height="2.6" rx="1.3" fill="#CBD5E1" />
            <rect x="29" y="43" width="36" height="2.6" rx="1.3" fill="#E2E8F0" />
            {/* front panel */}
            <path d="M16 44a5 5 0 0 1 5-5h58a5 5 0 0 1 5 5l-2 31a5 5 0 0 1-5 5H23a5 5 0 0 1-5-5z" fill={`url(#${id}-front)`} />
            <path d="M16 44a5 5 0 0 1 5-5h58a5 5 0 0 1 5 5v1H16z" fill="#fff" fillOpacity="0.45" />
            {/* embossed G. */}
            <text x="50" y="70" textAnchor="middle" fontSize="20" fill="#0369A1" fillOpacity="0.55" fontFamily="'DM Serif Display', Georgia, serif">
              G.
            </text>
          </g>
        </Tile>
      );

    case "services":
      return (
        <Tile id={id} from="#FFFFFF" to="#E4E4EC" gloss={0.5}>
          <defs>
            <Shadow id={id} />
            <linearGradient id={`${id}-c1`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#818CF8" />
              <stop offset="1" stopColor="#4338CA" />
            </linearGradient>
            <linearGradient id={`${id}-c2`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#C4B5FD" />
              <stop offset="1" stopColor="#7C3AED" />
            </linearGradient>
            <linearGradient id={`${id}-c3`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#A7F3D0" />
              <stop offset="1" stopColor="#10B981" />
            </linearGradient>
          </defs>
          <g filter={`url(#${id}-sh)`}>
            {/* three plan cards, fanned */}
            <rect x="30" y="24" width="40" height="54" rx="6" fill={`url(#${id}-c3)`} transform="rotate(-16 50 51)" />
            <rect x="30" y="24" width="40" height="54" rx="6" fill={`url(#${id}-c2)`} transform="rotate(-6 50 51)" />
            <rect x="30" y="22" width="40" height="56" rx="6" fill={`url(#${id}-c1)`} transform="rotate(6 50 50)" />
            <g transform="rotate(6 50 50)">
              <text x="50" y="56" textAnchor="middle" fontSize="28" fill="#fff" fontFamily="'DM Serif Display', Georgia, serif">
                £
              </text>
              <rect x="38" y="64" width="24" height="2.6" rx="1.3" fill="#fff" fillOpacity="0.6" />
              <rect x="42" y="69" width="16" height="2.6" rx="1.3" fill="#fff" fillOpacity="0.4" />
            </g>
          </g>
        </Tile>
      );

    case "notes":
      return (
        <Tile id={id} from="#FFFFFF" to="#F1F1F3" gloss={0.2}>
          <defs>
            <linearGradient id={`${id}-y`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FDE68A" />
              <stop offset="1" stopColor="#FACC15" />
            </linearGradient>
            <linearGradient id={`${id}-ys`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#000" stopOpacity="0.14" />
              <stop offset="1" stopColor="#000" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect width="100" height="30" fill={`url(#${id}-y)`} />
          {/* the binding: a row of perforations */}
          {Array.from({ length: 10 }).map((_, i) => (
            <circle key={i} cx={14 + i * 8} cy="30" r="1.5" fill="#E5E7EB" />
          ))}
          <rect y="30" width="100" height="6" fill={`url(#${id}-ys)`} />
          {[46, 58, 70, 82].map((y) => (
            <rect key={y} x="12" y={y} width="76" height="1.1" fill="#D4D4D8" />
          ))}
          <rect x="14" y="40" width="40" height="3" rx="1.5" fill="#71717A" />
          <rect x="14" y="51" width="56" height="2.6" rx="1.3" fill="#A1A1AA" />
          <rect x="14" y="63" width="46" height="2.6" rx="1.3" fill="#A1A1AA" />
        </Tile>
      );

    case "calendar": {
      const now = new Date();
      const weekday = now.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();
      return (
        <Tile id={id} from="#FFFFFF" to="#F0F0F2" gloss={0.25}>
          <text x="50" y="30" textAnchor="middle" fontSize="15" fontWeight="600" letterSpacing="0.5" fill="#EF4444" fontFamily="-apple-system, 'Inter Variable', Inter, sans-serif">
            {weekday}
          </text>
          <text x="50" y="80" textAnchor="middle" fontSize="50" fontWeight="300" fill="#1C1C1E" letterSpacing="-1.5" fontFamily="-apple-system, 'Inter Variable', Inter, sans-serif">
            {now.getDate()}
          </text>
        </Tile>
      );
    }

    case "mail":
      return (
        <Tile id={id} from="#6AB4FF" mid="#2F8BF5" to="#1366E0" gloss={0.3}>
          <defs>
            <Shadow id={id} />
            <linearGradient id={`${id}-env`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFFFFF" />
              <stop offset="1" stopColor="#E6EEF8" />
            </linearGradient>
            <linearGradient id={`${id}-flap`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F1F5FB" />
              <stop offset="1" stopColor="#D5E0EE" />
            </linearGradient>
          </defs>
          <g filter={`url(#${id}-sh)`}>
            <rect x="16" y="28" width="68" height="46" rx="5" fill={`url(#${id}-env)`} />
            {/* lower folds */}
            <path d="M16.5 72l24-20M83.5 72l-24-20" stroke="#C9D6E6" strokeWidth="1.6" />
            {/* the flap */}
            <path d="M17 31l30 24a5 5 0 0 0 6 0l30-24a5 5 0 0 0-4-3H21a5 5 0 0 0-4 3z" fill={`url(#${id}-flap)`} />
            <path d="M17 31l30 24a5 5 0 0 0 6 0l30-24" fill="none" stroke="#BFCDE0" strokeWidth="1" />
          </g>
        </Tile>
      );

    case "terminal":
      return (
        <Tile id={id} from="#52525B" to="#18181B" gloss={0.22}>
          <defs>
            <linearGradient id={`${id}-scr`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0B0B0F" />
              <stop offset="1" stopColor="#1A1A22" />
            </linearGradient>
            <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* the screen, set into a bezel */}
          <rect x="11" y="13" width="78" height="74" rx="10" fill={`url(#${id}-scr)`} stroke="#000" strokeOpacity="0.6" />
          <rect x="11" y="13" width="78" height="10" rx="5" fill="#fff" fillOpacity="0.06" />
          <g filter={`url(#${id}-glow)`}>
            <path d="M24 42l11 8-11 8" fill="none" stroke="#E4E4E7" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="41" y="56" width="20" height="5" rx="2.5" fill="#A5B4FC" />
          </g>
        </Tile>
      );

    case "settings":
      return (
        <Tile id={id} from="#D4D4D8" mid="#9CA3AF" to="#52525B" gloss={0.35}>
          <defs>
            <Shadow id={id} />
            <linearGradient id={`${id}-cog`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F4F4F5" />
              <stop offset="1" stopColor="#A1A1AA" />
            </linearGradient>
            <radialGradient id={`${id}-hub`} cx="0.5" cy="0.4" r="0.6">
              <stop offset="0" stopColor="#71717A" />
              <stop offset="1" stopColor="#27272A" />
            </radialGradient>
          </defs>
          <g filter={`url(#${id}-sh)`}>
            <g fill={`url(#${id}-cog)`}>
              {Array.from({ length: 14 }).map((_, i) => (
                <rect key={i} x="46" y="12" width="8" height="15" rx="2" transform={`rotate(${(360 / 14) * i} 50 50)`} />
              ))}
              <circle cx="50" cy="50" r="31" />
            </g>
            <circle cx="50" cy="50" r="24" fill="none" stroke="#71717A" strokeOpacity="0.5" strokeWidth="1.2" />
            {Array.from({ length: 6 }).map((_, i) => (
              <rect key={i} x="48.5" y="28" width="3" height="10" rx="1.5" fill="#71717A" fillOpacity="0.55" transform={`rotate(${60 * i} 50 50)`} />
            ))}
            <circle cx="50" cy="50" r="12" fill={`url(#${id}-hub)`} />
            <circle cx="50" cy="50" r="4.5" fill="#D4D4D8" />
          </g>
        </Tile>
      );

    case "trash":
      // The bin sits straight on the dock, no tile — exactly as a Mac draws it.
      return (
        <g>
          <defs>
            <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#E4E4E7" stopOpacity="0.55" />
              <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.85" />
              <stop offset="1" stopColor="#D4D4D8" stopOpacity="0.55" />
            </linearGradient>
            <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FAFAFA" />
              <stop offset="1" stopColor="#A1A1AA" />
            </linearGradient>
            <clipPath id={`${id}-bin`}>
              <path d="M22 18h56l-6 74a6 6 0 0 1-6 5.5H34a6 6 0 0 1-6-5.5z" />
            </clipPath>
          </defs>
          <path d="M22 18h56l-6 74a6 6 0 0 1-6 5.5H34a6 6 0 0 1-6-5.5z" fill={`url(#${id}-body)`} stroke="#fff" strokeOpacity="0.7" strokeWidth="1" />
          <g clipPath={`url(#${id}-bin)`} stroke="#71717A" strokeOpacity="0.4" strokeWidth="1.2">
            {Array.from({ length: 9 }).map((_, i) => {
              const x = 30 + i * 5;
              return <path key={i} d={`M${x} 18L${50 + (x - 50) * 0.78} 98`} />;
            })}
            {[34, 50, 66, 82].map((y) => (
              <path key={y} d={`M10 ${y}H90`} strokeOpacity="0.18" />
            ))}
          </g>
          <rect x="17" y="12" width="66" height="9" rx="4.5" fill={`url(#${id}-rim)`} stroke="#fff" strokeOpacity="0.6" />
        </g>
      );

    case "about":
      return (
        <Tile id={id} from="#7C83FF" mid="#4F46E5" to="#1E1B4B">
          <text x="47" y="68" textAnchor="middle" fontSize="50" fill="#fff" fontFamily="'DM Serif Display', Georgia, serif">
            G
          </text>
          <circle cx="68" cy="64" r="5.5" fill="#A5B4FC" />
        </Tile>
      );
  }
}
