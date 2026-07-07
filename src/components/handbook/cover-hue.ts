// Deterministic cover hue for Handbook cards + article covers — the same light-tint palette the
// Docs card library uses (DESIGN.md: blue/violet/emerald/amber/rose/slate). Seeded off a stable
// string so a given article always gets the same hue on its card and its reading surface.

export interface CoverHue {
  from: string;
  to: string;
  ink: string;
}

export const COVER_HUES: CoverHue[] = [
  { from: "#EFF6FF", to: "#DBEAFE", ink: "#1E3A8A" }, // blue
  { from: "#F5F3FF", to: "#EDE9FE", ink: "#5B21B6" }, // violet
  { from: "#ECFDF5", to: "#D1FAE5", ink: "#065F46" }, // emerald
  { from: "#FFFBEB", to: "#FEF3C7", ink: "#92400E" }, // amber
  { from: "#FFF1F2", to: "#FFE4E6", ink: "#9F1239" }, // rose
  { from: "#F8FAFC", to: "#F1F5F9", ink: "#334155" }, // slate
];

export function hueFor(seed: string): CoverHue {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COVER_HUES[h % COVER_HUES.length];
}
