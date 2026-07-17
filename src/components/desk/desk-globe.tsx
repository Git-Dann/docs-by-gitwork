"use client";

/**
 * On Your Desk — the timezone globe.
 *
 * A dependency-free SVG orthographic globe (inspired by timezoneglobe.com): a
 * dot-matrix stipple of the continents + crisp coastline outlines + a graticule,
 * with a live day/night terminator encoded into the dot brightness. A dot per
 * teammate/city sits on the surface; a legend lists local times. Drag to spin;
 * add cities from a preset list (persisted per browser).
 *
 * Light + dark aware: land dots, coastlines and graticule all paint in
 * `currentColor` (set to the theme ink), so the globe reads on cream or navy with
 * no per-mode branching. All maths is pure `Intl` + trig — no globe library.
 */

import { useMemo, useRef, useState, useEffect } from "react";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { useNow } from "./desk-time";
import { WORLD_LAND } from "@/lib/desk/world-land";

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

// A well-distributed global set (Americas → Europe/Africa → ME/Asia → Oceania), with
// a bias toward hubs a UK/PK dev agency actually works across.
const PRESETS: City[] = [
  { id: "san-francisco", name: "San Francisco", lat: 37.77, lon: -122.42, tz: "America/Los_Angeles" },
  { id: "new-york", name: "New York", lat: 40.71, lon: -74.01, tz: "America/New_York" },
  { id: "toronto", name: "Toronto", lat: 43.65, lon: -79.38, tz: "America/Toronto" },
  { id: "sao-paulo", name: "São Paulo", lat: -23.55, lon: -46.63, tz: "America/Sao_Paulo" },
  { id: "london", name: "London", lat: 51.51, lon: -0.13, tz: "Europe/London" },
  { id: "berlin", name: "Berlin", lat: 52.52, lon: 13.4, tz: "Europe/Berlin" },
  { id: "lagos", name: "Lagos", lat: 6.52, lon: 3.38, tz: "Africa/Lagos" },
  { id: "cape-town", name: "Cape Town", lat: -33.92, lon: 18.42, tz: "Africa/Johannesburg" },
  { id: "dubai", name: "Dubai", lat: 25.2, lon: 55.27, tz: "Asia/Dubai" },
  { id: "mumbai", name: "Mumbai", lat: 19.08, lon: 72.88, tz: "Asia/Kolkata" },
  { id: "singapore", name: "Singapore", lat: 1.35, lon: 103.82, tz: "Asia/Singapore" },
  { id: "tokyo", name: "Tokyo", lat: 35.68, lon: 139.65, tz: "Asia/Tokyo" },
  { id: "sydney", name: "Sydney", lat: -33.87, lon: 151.21, tz: "Australia/Sydney" },
];

// ── Geometry ──────────────────────────────────────────────────────────────────

const R = 106;
const CX = 120;
const CY = 120;
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

/** Project [lon,lat] rings to an SVG path, breaking where they dip behind the globe. */
function strokePath(rings: number[][][], lat0: number, lon0: number): string {
  const segs: string[] = [];
  for (const ring of rings) {
    let started = false;
    let d = "";
    for (const [lon, lat] of ring) {
      const pr = project(lat, lon, lat0, lon0);
      if (pr.visible) {
        d += `${started ? "L" : "M"}${pr.x.toFixed(1)} ${pr.y.toFixed(1)}`;
        started = true;
      } else {
        started = false;
      }
    }
    if (d) segs.push(d);
  }
  return segs.join(" ");
}

/** Meridians + parallels (every 30°) as [lon,lat] rings — static. */
const GRATICULE_RINGS: number[][][] = (() => {
  const rings: number[][][] = [];
  for (let lon = -180; lon < 180; lon += 30) {
    const r: number[][] = [];
    for (let lat = -80; lat <= 80; lat += 4) r.push([lon, lat]);
    rings.push(r);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const r: number[][] = [];
    for (let lon = -180; lon <= 180; lon += 4) r.push([lon, lat]);
    rings.push(r);
  }
  return rings;
})();

/** Ray-casting point-in-polygon (x=lon, y=lat). */
function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function isLand(lon: number, lat: number): boolean {
  for (const ring of WORLD_LAND) if (pointInRing(lon, lat, ring)) return true;
  return false;
}

/**
 * Pre-computed stipple: land sample points on a roughly equal-area grid (lon step
 * scaled by 1/cos(lat) so dots don't crowd the poles). Computed once at import.
 */
const LAND_DOTS: [number, number][] = (() => {
  const dots: [number, number][] = [];
  const step = 3;
  for (let lat = -78; lat <= 80; lat += step) {
    const lonStep = Math.min(step / Math.max(0.18, Math.cos(lat * D2R)), 14);
    for (let lon = -180; lon < 180; lon += lonStep) {
      if (isLand(lon, lat)) dots.push([lon, lat]);
    }
  }
  return dots;
})();

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

  const cities = useMemo(() => {
    const base = [home, counterpart];
    const extra = added.map((id) => PRESETS.find((p) => p.id === id)).filter((c): c is City => !!c);
    const seen = new Set<string>();
    return [...base, ...extra].filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  }, [home, counterpart, added]);

  const sun = subsolar(now);
  const sunKey = `${Math.round(sun.lat)}:${Math.round(sun.lon)}`;

  const grat = useMemo(() => strokePath(GRATICULE_RINGS, rot.lat, rot.lon), [rot.lat, rot.lon]);
  const coast = useMemo(() => strokePath(WORLD_LAND, rot.lat, rot.lon), [rot.lat, rot.lon]);
  const { dayDots, nightDots } = useMemo(() => {
    let day = "";
    let night = "";
    for (const [lon, lat] of LAND_DOTS) {
      const p = project(lat, lon, rot.lat, rot.lon);
      if (!p.visible) continue;
      const seg = `M${p.x.toFixed(1)} ${p.y.toFixed(1)}h.1`;
      if (isDay(lat, lon, sun)) day += seg;
      else night += seg;
    }
    return { dayDots: day, nightDots: night };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rot.lat, rot.lon, sunKey]);

  // Overlap sentence (home ↔ counterpart).
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

  const availablePresets = PRESETS.filter((p) => !cities.some((c) => c.id === p.id) && p.tz !== home.tz);

  return (
    <div className="@container w-full rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] p-3.5">
      {/* Globe beside the clocks only when this card is wide enough (@[440px]); else
          stack (globe above) so the clock/legend text keeps full width and doesn't wrap. */}
      <div className="flex flex-col gap-4 @[440px]:flex-row @[440px]:items-center">
        {/* Globe — inherits `currentColor` (theme ink) for land/coast/graticule. */}
        <svg
          viewBox="0 0 240 240"
          className="w-[220px] shrink-0 cursor-grab touch-none select-none text-[var(--text-1)] active:cursor-grabbing"
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
            <radialGradient id="globe-shade" cx="34%" cy="30%" r="82%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.10" />
              <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
            </radialGradient>
          </defs>

          {/* Sphere */}
          <circle cx={CX} cy={CY} r={R + 3} className="fill-[var(--brand-500)]" opacity={0.06} />
          <circle cx={CX} cy={CY} r={R} className="fill-[var(--surface-1)]" />

          <g clipPath="url(#globe-clip)">
            {/* Graticule */}
            <path d={grat} fill="none" stroke="currentColor" strokeOpacity={0.14} strokeWidth={0.5} />
            {/* Land stipple — bright on the day side, dim on the night side (the terminator). */}
            <path d={dayDots} fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5} strokeOpacity={0.82} />
            <path d={nightDots} fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5} strokeOpacity={0.24} />
            {/* Crisp coastline over the stipple */}
            <path d={coast} fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={0.7} strokeLinejoin="round" strokeLinecap="round" />
            {/* Spherical sheen + limb shadow */}
            <circle cx={CX} cy={CY} r={R} fill="url(#globe-shade)" />
          </g>

          {/* Rim */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="currentColor" strokeOpacity={0.28} strokeWidth={1} />

          {/* City markers (near hemisphere) */}
          {cities.map((c) => {
            const p = project(c.lat, c.lon, rot.lat, rot.lon);
            if (!p.visible) return null;
            const isHome = c.id === home.id;
            const day = isDay(c.lat, c.lon, sun);
            return (
              <g key={c.id}>
                {isHome ? <circle cx={p.x} cy={p.y} r={7} className="fill-[var(--brand-500)]" opacity={0.25} /> : null}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isHome ? 4 : 3.2}
                  className={cn(
                    isHome ? "fill-[var(--brand-600)]" : day ? "fill-amber-400" : "fill-slate-400",
                  )}
                  stroke="var(--surface-0)"
                  strokeWidth={1.3}
                />
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
