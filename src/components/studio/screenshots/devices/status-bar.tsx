// Faux status bar drawn at true pixel size — clock + signal/wifi/battery, iOS- or Android-styled.
// Glyphs are SVG/divs (never font-dependent) so they rasterize identically. All sizes derive from
// the screen width `w` so it scales across resolutions.

export function StatusBar({
  w,
  h,
  top,
  style,
  tint,
}: {
  w: number; // screen width in px
  h: number; // status band height in px
  top: number; // band offset from the screen top (aligns with the cutout)
  style: "ios" | "android";
  tint: "light" | "dark";
}) {
  const fg = tint === "light" ? "#FFFFFF" : "#0A0A0E";
  const padX = w * 0.062;
  const clockSize = h * 0.42;
  const glyphH = h * 0.32;
  const gap = h * 0.16;

  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 0,
        width: "100%",
        height: h,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: padX,
        paddingRight: padX,
        boxSizing: "border-box",
        pointerEvents: "none",
        zIndex: 3,
      }}
    >
      <span
        style={{
          fontFamily: style === "ios" ? "var(--font-sans), -apple-system, system-ui, sans-serif" : "var(--font-sans), 'Roboto', system-ui, sans-serif",
          fontSize: clockSize,
          fontWeight: 600,
          color: fg,
          lineHeight: 1,
          letterSpacing: style === "ios" ? clockSize * 0.01 : 0,
        }}
      >
        {style === "ios" ? "9:41" : "12:30"}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap }}>
        {style === "android" ? <WifiGlyph h={glyphH} fg={fg} /> : <SignalGlyph h={glyphH} fg={fg} />}
        {style === "android" ? <SignalGlyph h={glyphH} fg={fg} /> : <WifiGlyph h={glyphH} fg={fg} />}
        <BatteryGlyph h={glyphH} fg={fg} />
      </span>
    </div>
  );
}

function SignalGlyph({ h, fg }: { h: number; fg: string }) {
  const w = h * 1.35;
  const bars = 4;
  const bw = w / (bars * 1.7);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      {Array.from({ length: bars }).map((_, i) => {
        const bh = h * (0.42 + i * 0.19);
        return <rect key={i} x={i * bw * 1.7} y={h - bh} width={bw} height={bh} rx={bw * 0.28} fill={fg} />;
      })}
    </svg>
  );
}

function WifiGlyph({ h, fg }: { h: number; fg: string }) {
  const w = h * 1.4;
  return (
    <svg width={w} height={h} viewBox="0 0 28 20" style={{ display: "block" }}>
      <path d="M14 4C8.7 4 3.9 6 0.4 9.3L2.6 11.6C5.6 8.8 9.6 7.1 14 7.1s8.4 1.7 11.4 4.5l2.2-2.3C24.1 6 19.3 4 14 4Z" fill={fg} />
      <path d="M14 10.2c-3 0-5.8 1.1-7.9 3l2.3 2.4C10 16.2 11.9 15.4 14 15.4s4 0.8 5.6 2.2l2.3-2.4c-2.1-1.9-4.9-3-7.9-3Z" fill={fg} />
      <circle cx="14" cy="18.6" r="1.7" fill={fg} />
    </svg>
  );
}

function BatteryGlyph({ h, fg }: { h: number; fg: string }) {
  const w = h * 2.05;
  const bodyW = w * 0.9;
  const r = h * 0.22;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <rect x={1} y={h * 0.16} width={bodyW - 2} height={h * 0.68} rx={r} fill="none" stroke={fg} strokeWidth={h * 0.09} opacity={0.5} />
      <rect x={h * 0.24} y={h * 0.3} width={(bodyW - h * 0.7) * 0.82} height={h * 0.4} rx={r * 0.6} fill={fg} />
      <rect x={bodyW + h * 0.02} y={h * 0.36} width={h * 0.14} height={h * 0.28} rx={h * 0.06} fill={fg} opacity={0.5} />
    </svg>
  );
}
