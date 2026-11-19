"use client";

/**
 * The business card at the top of a public profile (CLAUDE.md §139). The person chooses the
 * layout, font, colour and pattern (src/lib/profile-card.ts). On the page it tilts towards the
 * pointer and flips over to a QR code of the page, so it can be shown to someone in person.
 *
 * Sizes are container units (cqw), so the same card draws correctly as a large header, a sheet
 * and a small thumbnail in the editor.
 */
import { useMemo, useState, type CSSProperties, type PointerEvent } from "react";
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import QRCode from "qrcode";
import { cardColour, cardFontStyle, type ProfileCard } from "@/lib/profile-card";

export interface CardPerson {
  name: string;
  headline: string | null;
  company: string;
  location: string | null;
  avatarUrl: string | null;
}

const cq = (n: number) => `${n}cqw`;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

// ── Patterns: drawn once, in a 350×200 box, stroked in the card's text colour. ──

function topoPaths(): string[] {
  const out: string[] = [];
  for (let i = 0; i < 13; i++) {
    const base = 14 + i * 15;
    let d = "";
    for (let k = 0; k <= 64; k++) {
      const t = (k / 64) * Math.PI * 2;
      const r = base * (1 + 0.13 * Math.sin(3 * t + i * 0.45) + 0.07 * Math.sin(5 * t + 1.3));
      const x = 245 + r * Math.cos(t) * 1.25;
      const y = 80 + r * Math.sin(t);
      d += `${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    out.push(`${d}Z`);
  }
  return out;
}

function wavePaths(): string[] {
  const out: string[] = [];
  for (let i = 0; i < 11; i++) {
    let d = "";
    for (let x = -10; x <= 360; x += 10) {
      const y = 8 + i * 19 + 6 * Math.sin(x / 34 + i * 0.6);
      d += `${x === -10 ? "M" : "L"}${x} ${y.toFixed(1)}`;
    }
    out.push(d);
  }
  return out;
}

const TOPO = topoPaths();
const WAVES = wavePaths();

function Pattern({ id }: { id: ProfileCard["pattern"] }) {
  if (id === "none") return null;
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 0.8 } as const;
  return (
    <svg aria-hidden viewBox="0 0 350 200" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.16]">
      {id === "topo" ? TOPO.map((d, i) => <path key={i} d={d} {...common} />) : null}
      {id === "waves" ? WAVES.map((d, i) => <path key={i} d={d} {...common} />) : null}
      {id === "rays"
        ? Array.from({ length: 24 }, (_, i) => {
            const a = (i / 23) * (Math.PI / 2);
            return <line key={i} x1={0} y1={0} x2={420 * Math.cos(a)} y2={420 * Math.sin(a)} {...common} />;
          })
        : null}
      {id === "grid"
        ? [
            ...Array.from({ length: 15 }, (_, i) => <line key={`v${i}`} x1={i * 25} y1={0} x2={i * 25} y2={200} {...common} />),
            ...Array.from({ length: 9 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * 25} x2={350} y2={i * 25} {...common} />),
          ]
        : null}
      {id === "dots"
        ? Array.from({ length: 25 * 15 }, (_, i) => (
            <circle key={i} cx={7 + (i % 25) * 14} cy={7 + Math.floor(i / 25) * 14} r={1.3} fill="currentColor" />
          ))
        : null}
      {id === "rings"
        ? [
            [30, 185],
            [320, 25],
            [300, 190],
          ].flatMap(([cx, cy], j) =>
            Array.from({ length: j === 2 ? 5 : 9 }, (_, i) => <circle key={`${j}-${i}`} cx={cx} cy={cy} r={6 + i * 7} {...common} />),
          )
        : null}
    </svg>
  );
}

function Photo({ person, round, style }: { person: CardPerson; round: boolean; style: CSSProperties }) {
  const shape = round ? "9999px" : cq(3.4);
  return person.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={person.avatarUrl} alt="" className="shrink-0 object-cover" style={{ ...style, borderRadius: shape }} />
  ) : (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center"
      style={{ ...style, borderRadius: shape, fontFamily: "var(--font-display)", fontSize: cq(6), background: "color-mix(in srgb, currentColor 12%, transparent)" }}
    >
      {initials(person.name)}
    </span>
  );
}

/** One side of the card, the front. Presentational: no state, so the editor's thumbnails use it too. */
export function CardFace({ card, person }: { card: ProfileCard; person: CardPerson }) {
  const { bg, fg } = cardColour(card.colour);
  const f = cardFontStyle(card.font);
  const meta = [person.company, person.location].filter(Boolean).join(" · ");
  const nameSize = (base: number) => cq(base * f.scale);
  const nameStyle: CSSProperties = {
    fontFamily: f.family,
    fontWeight: f.weight,
    textTransform: f.transform,
    letterSpacing: f.tracking,
    lineHeight: 1.02,
  };
  const clamp = (lines: number): CSSProperties => ({ display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" });
  const text = (
    align: "left" | "center" | "right",
    nameBase: number,
  ) => (
    <div className="min-w-0" style={{ textAlign: align }}>
      <p className="m-0 [overflow-wrap:anywhere]" style={{ ...nameStyle, fontSize: nameSize(nameBase), ...clamp(2) }}>
        {person.name}
      </p>
      {person.headline ? (
        <p className="m-0" style={{ fontSize: cq(3.5), lineHeight: 1.3, marginTop: cq(1.6), opacity: 0.88, ...clamp(2) }}>
          {person.headline}
        </p>
      ) : null}
      {meta ? (
        <p className="m-0 truncate" style={{ fontSize: cq(3.1), marginTop: cq(1.2), opacity: 0.7 }}>
          {meta}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: bg, color: fg, padding: cq(6.5) }}>
      <Pattern id={card.pattern} />
      <div className="relative flex h-full w-full">
        {card.layout === "photo-top" ? (
          <div className="flex h-full w-full flex-col justify-between">
            <Photo person={person} round style={{ width: cq(16), height: cq(16) }} />
            {text("left", 8)}
          </div>
        ) : card.layout === "photo-side" ? (
          <div className="flex h-full w-full items-center justify-between" style={{ gap: cq(5) }}>
            {text("left", 7.2)}
            <Photo person={person} round={false} style={{ width: cq(26), height: "100%" }} />
          </div>
        ) : card.layout === "name-only" ? (
          <div className="flex h-full w-full items-center justify-center">{text("center", 8.6)}</div>
        ) : (
          <div className="flex h-full w-full flex-col items-end justify-end">{text("right", 7.6)}</div>
        )}
      </div>
    </div>
  );
}

/** A QR code drawn as one SVG path. The encoding is the qrcode library's; only the drawing is ours. */
export function QrCode({ value, className }: { value: string; className?: string }) {
  const { size, d } = useMemo(() => {
    const m = QRCode.create(value, { errorCorrectionLevel: "M" }).modules;
    let path = "";
    for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.get(x, y)) path += `M${x} ${y}h1v1h-1z`;
    return { size: m.size, d: path };
  }, [value]);
  return (
    <svg role="img" aria-label="QR code for this profile" viewBox={`-2 -2 ${size + 4} ${size + 4}`} className={className} shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={size + 4} height={size + 4} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

function CardBack({ card, url }: { card: ProfileCard; url: string }) {
  const { bg, fg } = cardColour(card.colour);
  const shown = url.replace(/^https?:\/\//, "");
  return (
    <div className="relative flex h-full w-full items-center overflow-hidden" style={{ background: bg, color: fg, padding: cq(6.5), gap: cq(6) }}>
      <Pattern id={card.pattern} />
      <div className="relative shrink-0 overflow-hidden bg-white" style={{ width: cq(40), borderRadius: cq(3), padding: cq(1.5) }}>
        <QrCode value={url} className="block h-auto w-full" />
      </div>
      <div className="relative min-w-0">
        <p className="m-0" style={{ fontSize: cq(4.6), fontWeight: 600, lineHeight: 1.2 }}>
          Scan to open my profile
        </p>
        <p className="m-0 [overflow-wrap:anywhere]" style={{ fontSize: cq(3.2), marginTop: cq(1.6), opacity: 0.72, fontFamily: "var(--font-mono)" }}>
          {shown}
        </p>
      </div>
    </div>
  );
}

/**
 * The card as shown on the page: tilts towards the pointer with a sheen, and turns over on a tap
 * to show the QR code. With reduced motion it neither tilts nor animates the turn.
 */
export function ProfileBusinessCard({
  card,
  person,
  url,
}: {
  card: ProfileCard;
  person: CardPerson;
  url: string;
}) {
  const reduce = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spring = { stiffness: 180, damping: 18, mass: 0.6 };
  const rotateY = useSpring(useTransform(px, [0, 1], [-10, 10]), spring);
  const rotateX = useSpring(useTransform(py, [0, 1], [8, -8]), spring);
  const sheenX = useTransform(px, (v) => `${v * 100}%`);
  const sheenY = useTransform(py, (v) => `${v * 100}%`);
  const sheen = useMotionTemplate`radial-gradient(circle at ${sheenX} ${sheenY}, rgba(255,255,255,0.28), transparent 55%)`;

  function move(e: PointerEvent<HTMLDivElement>) {
    if (reduce || e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }
  function leave() {
    px.set(0.5);
    py.set(0.5);
  }

  const face = "absolute inset-0 overflow-hidden rounded-[16px] [backface-visibility:hidden] [-webkit-backface-visibility:hidden]";
  return (
    <div style={{ perspective: 1200 }}>
      {/* A div with button semantics, not a <button>: the card holds block content. */}
      <motion.div
        role="button"
        tabIndex={0}
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setFlipped((f) => !f);
          }
        }}
        onPointerMove={move}
        onPointerLeave={leave}
        aria-label={flipped ? "Show the front of the card" : "Turn the card over for a QR code"}
        aria-pressed={flipped}
        className="relative block w-full cursor-pointer text-left [container-type:inline-size] [transform-style:preserve-3d] rounded-[16px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--brand-500)]"
        style={{ aspectRatio: "1.75 / 1", rotateX: reduce ? 0 : rotateX, rotateY: reduce ? 0 : rotateY }}
        initial={reduce ? false : { opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="absolute inset-0 [transform-style:preserve-3d]"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 16 }}
        >
          <div className={`${face} shadow-[0_18px_40px_-18px_rgba(15,23,42,0.45)] ring-1 ring-black/5`}>
            <CardFace card={card} person={person} />
          </div>
          <div className={`${face} shadow-[0_18px_40px_-18px_rgba(15,23,42,0.45)] ring-1 ring-black/5`} style={{ transform: "rotateY(180deg)" }}>
            <CardBack card={card} url={url} />
          </div>
        </motion.div>
        {reduce ? null : <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-[16px] mix-blend-soft-light" style={{ background: sheen }} />}
      </motion.div>
    </div>
  );
}
