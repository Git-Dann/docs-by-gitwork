// Font loader for Satori (the renderer behind next/og's ImageResponse). Satori
// can't parse woff2, so we ask Google Fonts for TTF by spoofing an old browser
// UA. Best-effort: any network/parse failure resolves to null and the caller
// falls back to system fonts so the image still renders.

// Matches next/og's FontOptions shape — `weight` must be a literal union of the
// supported Satori weights, not `number`, or ImageResponse's signature rejects it.
type SatoriWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
type FontRecord = {
  name: string;
  data: ArrayBuffer;
  weight: SatoriWeight;
  style: "normal";
};

const cache = new Map<string, ArrayBuffer | null>();

export async function loadFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  const key = `${family}@${weight}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`,
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" } },
    ).then((r) => r.text());
    const url = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?truetype/)?.[1]
      ?? css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (!url) {
      cache.set(key, null);
      return null;
    }
    const buf = await fetch(url).then((r) => r.arrayBuffer());
    cache.set(key, buf);
    return buf;
  } catch {
    cache.set(key, null);
    return null;
  }
}

// Loads the two faces every Foundry OG card uses (DM Serif Display 400 for the
// title, JetBrains Mono 600 for the eyebrow + footer label). Returns the
// Satori-shaped font records, ready to pass straight to ImageResponse.
export async function loadOgFonts(): Promise<FontRecord[]> {
  const [serif, mono] = await Promise.all([
    loadFont("DM Serif Display", 400),
    loadFont("JetBrains Mono", 600),
  ]);
  return [
    serif && { name: "DM Serif Display", data: serif, weight: 400 as const, style: "normal" as const },
    mono && { name: "JetBrains Mono", data: mono, weight: 600 as const, style: "normal" as const },
  ].filter(Boolean) as FontRecord[];
}

export const SERIF_FAMILY = "DM Serif Display, Georgia, serif";
export const MONO_FAMILY = "JetBrains Mono, monospace";
