"use client";

/**
 * Procedural weather scene — a small, dependency-free animated SVG instrument
 * (sun rays / drifting clouds / rain / snow / fog / lightning) for the brief's
 * weather row. Foundry-toned: amber sun, brand-blue rain, token-based clouds so
 * it reads on cream and navy. Reduced-motion safe.
 */

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "rain" | "snow" | "thunder";

/** WMO weather code → friendly label + scene kind. */
export function condition(code: number): { label: string; kind: WeatherKind } {
  if (code === 0) return { label: "Clear", kind: "clear" };
  if (code === 1) return { label: "Mainly clear", kind: "partly" };
  if (code === 2) return { label: "Partly cloudy", kind: "partly" };
  if (code === 3) return { label: "Overcast", kind: "cloudy" };
  if (code === 45 || code === 48) return { label: "Fog", kind: "fog" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", kind: "rain" };
  if (code >= 61 && code <= 67) return { label: "Rain", kind: "rain" };
  if (code >= 71 && code <= 77) return { label: "Snow", kind: "snow" };
  if (code >= 80 && code <= 82) return { label: "Rain showers", kind: "rain" };
  if (code >= 85 && code <= 86) return { label: "Snow showers", kind: "snow" };
  if (code >= 95) return { label: "Thunderstorm", kind: "thunder" };
  return { label: "Cloudy", kind: "cloudy" };
}

const CSS = `
@keyframes wxSpin { to { transform: rotate(360deg); } }
@keyframes wxDrift { 0% { transform: translateX(-2px); } 50% { transform: translateX(3px); } 100% { transform: translateX(-2px); } }
@keyframes wxRain { 0% { transform: translateY(-6px); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateY(20px); opacity: 0; } }
@keyframes wxSnow { 0% { transform: translateY(-4px); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateY(22px); opacity: 0; } }
@keyframes wxBolt { 0%,92%,100% { opacity: 0; } 94%,98% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .wx-spin, .wx-drift, .wx-drop, .wx-bolt { animation: none !important; }
}
`;

const CLOUD_D = "M26 62c-7 0-12-5-12-12 0-6 4-11 10-12 2-8 9-13 17-13 9 0 16 6 18 15 6 0 11 5 11 11 0 7-6 11-13 11z";

function Cloud({ x = 0, y = 0, scale = 1, opacity = 1 }: { x?: number; y?: number; scale?: number; opacity?: number }) {
  return (
    <g className="wx-drift" style={{ animation: "wxDrift 7s ease-in-out infinite", transformOrigin: "center", transformBox: "fill-box" }}>
      <path
        d={CLOUD_D}
        transform={`translate(${x} ${y}) scale(${scale})`}
        fill="var(--surface-1)"
        stroke="var(--text-4)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        opacity={opacity}
      />
    </g>
  );
}

function Sun({ cx = 48, cy = 42 }: { cx?: number; cy?: number }) {
  const rays = Array.from({ length: 8 });
  return (
    <g>
      <g className="wx-spin" style={{ animation: "wxSpin 32s linear infinite", transformOrigin: `${cx}px ${cy}px` }}>
        {rays.map((_, i) => (
          <line
            key={i}
            x1={cx}
            y1={cy - 20}
            x2={cx}
            y2={cy - 26}
            stroke="#e0a63a"
            strokeWidth={2.5}
            strokeLinecap="round"
            transform={`rotate(${i * 45} ${cx} ${cy})`}
          />
        ))}
      </g>
      <circle cx={cx} cy={cy} r={13} fill="#eab54a" />
    </g>
  );
}

function Moon({ cx = 48, cy = 42 }: { cx?: number; cy?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={13} fill="var(--text-2)" />
      <circle cx={cx + 6} cy={cy - 4} r={12} fill="var(--surface-0)" />
      <circle cx={cx + 20} cy={cy - 12} r={1.2} fill="var(--text-3)" />
      <circle cx={cx + 16} cy={cy + 8} r={1} fill="var(--text-3)" />
    </g>
  );
}

function Drops({ kind }: { kind: "rain" | "snow" }) {
  const drops = [30, 42, 54, 66];
  const rain = kind === "rain";
  return (
    <g>
      {drops.map((x, i) => (
        <g key={x} className="wx-drop" style={{ animation: `${rain ? "wxRain" : "wxSnow"} 1.4s linear ${i * 0.28}s infinite`, transformBox: "fill-box" }}>
          {rain ? (
            <line x1={x} y1={62} x2={x - 2} y2={69} stroke="var(--brand-500)" strokeWidth={2} strokeLinecap="round" />
          ) : (
            <circle cx={x} cy={64} r={2} fill="var(--brand-400)" />
          )}
        </g>
      ))}
    </g>
  );
}

function Fog() {
  return (
    <g stroke="var(--text-4)" strokeWidth={2.5} strokeLinecap="round">
      {[62, 70, 78].map((y, i) => (
        <line key={y} className="wx-drift" x1={22} y1={y} x2={74} y2={y} style={{ animation: `wxDrift ${6 + i}s ease-in-out ${i * 0.4}s infinite`, transformBox: "fill-box" }} />
      ))}
    </g>
  );
}

function Bolt() {
  return (
    <path
      className="wx-bolt"
      d="M50 58l-8 12h6l-4 12 12-16h-6l4-8z"
      fill="#eab54a"
      style={{ animation: "wxBolt 3s ease-in-out infinite" }}
    />
  );
}

export function WeatherScene({
  kind,
  isDay,
  className,
}: {
  kind: WeatherKind;
  isDay: boolean;
  className?: string;
}) {
  const showLuminary = kind === "clear" || kind === "partly";
  const showCloud = kind !== "clear";
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden focusable="false">
      <style>{CSS}</style>
      {showLuminary ? (isDay ? <Sun cx={kind === "partly" ? 40 : 48} cy={kind === "partly" ? 36 : 42} /> : <Moon cx={kind === "partly" ? 40 : 48} cy={kind === "partly" ? 36 : 42} />) : null}
      {kind === "cloudy" ? <Cloud x={-6} y={-8} scale={0.7} opacity={0.55} /> : null}
      {showCloud ? <Cloud x={kind === "partly" ? 12 : 0} y={kind === "partly" ? 10 : 2} /> : null}
      {kind === "rain" ? <Drops kind="rain" /> : null}
      {kind === "snow" ? <Drops kind="snow" /> : null}
      {kind === "fog" ? <Fog /> : null}
      {kind === "thunder" ? (
        <>
          <Drops kind="rain" />
          <Bolt />
        </>
      ) : null}
    </svg>
  );
}
