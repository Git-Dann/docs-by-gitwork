"use client";

/**
 * On Your Desk — the timezone globe.
 *
 * A dependency-free SVG orthographic globe (inspired by timezoneglobe.com), centred
 * on your home hub. It draws a graticule, a live day/night terminator (shaded from
 * the current sub-solar point), and a dot per teammate/city labelled with its local
 * time. Drag to spin; add cities from a preset list (persisted per browser). On brand:
 * blue ocean, mono readouts, Gitwork-Blue home marker.
 *
 * All maths is pure `Intl` + trig — no globe library, no map tiles, no coastline data.
 */

import { useMemo, useRef, useState, useEffect } from "react";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { useNow } from "./desk-time";

const MONO = { fontFamily: "var(--font-mono)" } as const;
const STORE_KEY = "gitwork.desk.globe.cities.v1";

interface City {
  id: string;
  name: string;
  lat: number;
  lon: number;
  tz: string;
}

/** The two Gitwork hubs + a preset set to add from. */
const HUBS: Record<string, City> = {
  "Europe/London": { id: "manchester", name: "Manchester", lat: 53.48, lon: -2.24, tz: "Europe/London" },
  "Asia/Karachi": { id: "islamabad", name: "Islamabad", lat: 33.68, lon: 73.05, tz: "Asia/Karachi" },
};

const PRESETS: City[] = [
  { id: "london", name: "London", lat: 51.51, lon: -0.13, tz: "Europe/London" },
  { id: "new-york", name: "New York", lat: 40.71, lon: -74.01, tz: "America/New_York" },
  { id: "san-francisco", name: "San Francisco", lat: 37.77, lon: -122.42, tz: "America/Los_Angeles" },
  { id: "dubai", name: "Dubai", lat: 25.2, lon: 55.27, tz: "Asia/Dubai" },
  { id: "berlin", name: "Berlin", lat: 52.52, lon: 13.4, tz: "Europe/Berlin" },
  { id: "singapore", name: "Singapore", lat: 1.35, lon: 103.82, tz: "Asia/Singapore" },
  { id: "tokyo", name: "Tokyo", lat: 35.68, lon: 139.65, tz: "Asia/Tokyo" },
  { id: "sydney", name: "Sydney", lat: -33.87, lon: 151.21, tz: "Australia/Sydney" },
  { id: "sao-paulo", name: "São Paulo", lat: -23.55, lon: -46.63, tz: "America/Sao_Paulo" },
];

// ── Geometry ──────────────────────────────────────────────────────────────────

const R = 104;
const CX = 128;
const CY = 118;
const D2R = Math.PI / 180;

interface Projected {
  x: number;
  y: number;
  visible: boolean;
}

/** Orthographic projection of (lat,lon) for a globe rotated to centre (lat0,lon0). */
function project(lat: number, lon: number, lat0: number, lon0: number): Projected {
  const phi = lat * D2R;
  const lam = (lon - lon0) * D2R;
  const phi0 = lat0 * D2R;
  const cosc = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(lam);
  const x = Math.cos(phi) * Math.sin(lam);
  const y = Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(lam);
  return { x: CX + R * x, y: CY - R * y, visible: cosc >= 0 };
}

/** Sub-solar point (lat,lon) for an instant — where the sun is directly overhead. */
function subsolar(now: Date): { lat: number; lon: number } {
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60;
  let lon = (12 - utcH) * 15;
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start) / 86_400_000);
  const lat = -23.44 * Math.cos((360 / 365) * (dayOfYear + 10) * D2R);
  return { lat, lon };
}

/** Unit vector for a lat/lon on the sphere. */
function vec(lat: number, lon: number): [number, number, number] {
  const phi = lat * D2R;
  const lam = lon * D2R;
  return [Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi)];
}

/** Is it daytime at (lat,lon) given the sub-solar point? */
function isDay(lat: number, lon: number, sun: { lat: number; lon: number }): boolean {
  const c = vec(lat, lon);
  const s = vec(sun.lat, sun.lon);
  return c[0] * s[0] + c[1] * s[1] + c[2] * s[2] > 0;
}

/** Build graticule polyline path segments (breaking where the arc dips behind the globe). */
function graticule(lat0: number, lon0: number): string {
  const segs: string[] = [];
  const push = (pts: { lat: number; lon: number }[]) => {
    let started = false;
    let d = "";
    for (const p of pts) {
      const pr = project(p.lat, p.lon, lat0, lon0);
      if (pr.visible) {
        d += `${started ? "L" : "M"}${pr.x.toFixed(1)} ${pr.y.toFixed(1)}`;
        started = true;
      } else {
        started = false;
      }
    }
    if (d) segs.push(d);
  };
  // Meridians
  for (let lon = -180; lon < 180; lon += 30) {
    const pts = [];
    for (let lat = -80; lat <= 80; lat += 4) pts.push({ lat, lon });
    push(pts);
  }
  // Parallels
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts = [];
    for (let lon = -180; lon <= 180; lon += 4) pts.push({ lat, lon });
    push(pts);
  }
  return segs.join(" ");
}

// ── Time ──────────────────────────────────────────────────────────────────────

function fmtCityTime(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: tz,
  }).format(now);
}

function tzOffsetHours(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return Math.round((asUTC - date.getTime()) / 3_600_000);
}

// ── Component ──────────────────────────────────────────────────────────────────

export function DeskGlobe({
  counterpartTz,
  counterpartLabel,
}: {
  counterpartTz: string;
  counterpartLabel: string;
}) {
  const now = useNow(30_000);
  const localTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Europe/London";

  const home = HUBS[localTz] ?? HUBS["Europe/London"];
  const counterpart = HUBS[counterpartTz] ?? PRESETS.find((c) => c.tz === counterpartTz) ?? HUBS["Asia/Karachi"];

  // Rotation centred on home; drag to spin.
  const [rot, setRot] = useState({ lat: home.lat * 0.6, lon: home.lon });
  const [added, setAdded] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) setAdded(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
  }, []);

  function persist(ids: string[]) {
    setAdded(ids);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(ids));
    } catch {
      /* ignore */
    }
  }

  // The cities on the globe: home + counterpart + any added presets (deduped by id).
  const cities = useMemo(() => {
    const base = [home, counterpart];
    const extra = added.map((id) => PRESETS.find((p) => p.id === id)).filter((c): c is City => !!c);
    const seen = new Set<string>();
    return [...base, ...extra].filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  }, [home, counterpart, added]);

  const sun = subsolar(now);
  const sunProj = project(sun.lat, sun.lon, rot.lat, rot.lon);
  const grat = useMemo(() => graticule(rot.lat, rot.lon), [rot.lat, rot.lon]);

  // Overlap sentence (home ↔ counterpart), reused from the old TeamOverlap.
  const diff = tzOffsetHours(now, counterpart.tz) - tzOffsetHours(now, localTz);
  const label12 = (h: number) => {
    const hh = (((Math.round(h) % 24) + 24) % 24) % 24;
    const ap = hh < 12 ? "am" : "pm";
    return `${hh % 12 === 0 ? 12 : hh % 12}${ap}`;
  };
  const ovStart = Math.max(9, 9 - diff);
  const ovEnd = Math.min(17, 17 - diff);
  const hasOverlap = ovEnd - ovStart >= 0.5;

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setRot((r) => ({
      lon: r.lon - dx * 0.5,
      lat: Math.max(-80, Math.min(80, r.lat + dy * 0.5)),
    }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  const availablePresets = PRESETS.filter(
    (p) => !cities.some((c) => c.id === p.id) && p.tz !== home.tz,
  );

  return (
    <div className="w-full rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] p-3.5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Globe */}
        <svg
          viewBox="0 0 256 236"
          className="w-[220px] shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          role="img"
          aria-label="Timezone globe — drag to rotate"
        >
          <defs>
            <clipPath id="globe-clip">
              <circle cx={CX} cy={CY} r={R} />
            </clipPath>
            <radialGradient id="globe-ocean" cx="38%" cy="32%" r="80%">
              <stop offset="0%" stopColor="var(--brand-500)" stopOpacity="0.55" />
              <stop offset="60%" stopColor="var(--brand-700)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#0b1b3a" stopOpacity="0.75" />
            </radialGradient>
            <radialGradient
              id="globe-sun"
              cx={sunProj.x}
              cy={sunProj.y}
              r={R * 1.5}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#fff6de" stopOpacity="0.16" />
              <stop offset="42%" stopColor="#fff6de" stopOpacity="0" />
              <stop offset="100%" stopColor="#04101f" stopOpacity="0.5" />
            </radialGradient>
          </defs>

          {/* Outer glow + ocean */}
          <circle cx={CX} cy={CY} r={R + 4} fill="var(--brand-500)" opacity={0.08} />
          <circle cx={CX} cy={CY} r={R} fill="url(#globe-ocean)" />

          <g clipPath="url(#globe-clip)">
            {/* Graticule */}
            <path d={grat} fill="none" stroke="#fff" strokeOpacity={0.14} strokeWidth={0.6} />
            {/* Day/night: warm near the sun, dark on the far side (flat dark if sun is behind). */}
            {sunProj.visible ? (
              <circle cx={CX} cy={CY} r={R} fill="url(#globe-sun)" />
            ) : (
              <circle cx={CX} cy={CY} r={R} fill="#04101f" opacity={0.5} />
            )}
          </g>

          {/* Rim */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border-1)" strokeWidth={1} />

          {/* City markers (visible hemisphere only) */}
          {cities.map((c) => {
            const p = project(c.lat, c.lon, rot.lat, rot.lon);
            if (!p.visible) return null;
            const home_ = c.id === home.id;
            const day = isDay(c.lat, c.lon, sun);
            const rightHalf = p.x > CX;
            return (
              <g key={c.id}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={home_ ? 4.5 : 3.5}
                  fill={home_ ? "var(--brand-600)" : day ? "#fef9ec" : "#93a4bd"}
                  stroke={home_ ? "#fff" : day ? "var(--brand-600)" : "#5b6b86"}
                  strokeWidth={1.2}
                />
                <text
                  x={rightHalf ? p.x - 7 : p.x + 7}
                  y={p.y + 3}
                  textAnchor={rightHalf ? "end" : "start"}
                  className="fill-[var(--text-1)]"
                  style={{ ...MONO, fontSize: 9, paintOrder: "stroke", stroke: "var(--surface-0)", strokeWidth: 3 }}
                >
                  {c.name} {fmtCityTime(now, c.tz)}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend + controls */}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[var(--text-2)]">
            Your <span className="font-semibold text-[var(--text-1)]">9am</span> is{" "}
            <span className="font-semibold text-[var(--brand-700)]">{label12(9 + diff)}</span> in{" "}
            {counterpartLabel}
          </p>

          <ul className="mt-2.5 space-y-1">
            {cities.map((c) => {
              const day = isDay(c.lat, c.lon, sun);
              const removable = added.includes(c.id);
              return (
                <li key={c.id} className="flex items-center gap-2 text-[12px]" style={MONO}>
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      c.id === home.id ? "bg-[var(--brand-600)]" : day ? "bg-amber-400" : "bg-slate-400",
                    )}
                  />
                  <span className="w-28 truncate text-[var(--text-2)]">{c.name}</span>
                  <span className="text-[var(--text-1)]">{fmtCityTime(now, c.tz)}</span>
                  <span className="text-[var(--text-4)]">{day ? "· day" : "· night"}</span>
                  {removable ? (
                    <button
                      type="button"
                      onClick={() => persist(added.filter((id) => id !== c.id))}
                      aria-label={`Remove ${c.name}`}
                      className="ml-auto text-[var(--text-4)] transition hover:text-[var(--danger-500)]"
                    >
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {/* Add a city */}
          <div className="relative mt-2.5">
            {showAdd ? (
              <div className="flex flex-wrap gap-1.5">
                {availablePresets.length === 0 ? (
                  <span className="text-[11px] text-[var(--text-4)]" style={MONO}>
                    All presets added.
                  </span>
                ) : (
                  availablePresets.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        persist([...added, p.id]);
                        setShowAdd(false);
                      }}
                      className="rounded-[6px] border border-[var(--border-2)] px-2 py-1 text-[11px] text-[var(--text-2)] transition hover:border-[var(--brand-300)] hover:text-[var(--brand-700)]"
                      style={MONO}
                    >
                      {p.name}
                    </button>
                  ))
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.8px] text-[var(--text-4)] transition hover:text-[var(--brand-700)]"
                style={MONO}
              >
                <PlusIcon className="h-3.5 w-3.5" /> Add city
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px] uppercase tracking-[0.8px] text-[var(--text-4)]" style={MONO}>
        {hasOverlap
          ? `Overlap ${label12(ovStart)}–${label12(ovEnd)} your time · drag to spin`
          : "Little daily overlap · drag to spin"}
      </p>
    </div>
  );
}
