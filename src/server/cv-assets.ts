/**
 * Inlines the CV's fonts and mark as data URIs.
 *
 * ⚠️ **Why inline rather than link.** The CV is handed to Chromium with
 * `setContent`, so the document has no origin and a relative `<link>` or `<img
 * src>` resolves to nothing — headings would silently fall back to Times and the
 * mark would be a broken image. The same string is also used as an iframe
 * `srcDoc` for the in-app preview, which has no origin either. Inlining is what
 * makes one artefact serve both.
 *
 * ⚠️ **Why these paths survive the build.** `output: "standalone"` prunes
 * node_modules to what Next's tracer can see, and a woff2 reached by `readFile`
 * at runtime is invisible to it. `next.config.ts` therefore lists these files in
 * `outputFileTracingIncludes` for this route, exactly as it already does for
 * Chromium's binary pack. If a face ever renders as Times in production, that
 * entry is the first thing to check — and `cv-assets.test.ts` asserts the config
 * still names this route, because the failure is silent.
 *
 * Read once per process and cached: ~210KB of font bytes should not be re-read
 * and re-base64'd on every export.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The four families the Document System allows, and no others. Fraunces carries
 * an italic because the system's one `.accent` phrase is bold italic; Playfair is
 * italic-only because it is used for step numerals and nowhere else.
 */
const FACES: { family: string; file: string; style: "normal" | "italic" }[] = [
  { family: "Fraunces", file: "fraunces/files/fraunces-latin-wght-normal.woff2", style: "normal" },
  { family: "Fraunces", file: "fraunces/files/fraunces-latin-wght-italic.woff2", style: "italic" },
  { family: "Inter", file: "inter/files/inter-latin-wght-normal.woff2", style: "normal" },
  { family: "JetBrains Mono", file: "jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2", style: "normal" },
  { family: "Playfair Display", file: "playfair-display/files/playfair-display-latin-wght-italic.woff2", style: "italic" },
];

/** Variable faces: one file covers the whole weight range. */
const WEIGHT_RANGE = "100 900";

let cached: { fontCss: string; markDataUri: string | null } | null = null;

async function readOrNull(abs: string): Promise<Buffer | null> {
  try {
    return await readFile(abs);
  } catch {
    // A missing face must not fail the export — the document still renders in the
    // stack's fallback. The route logs it; `fontFacesLoaded` reports it honestly.
    return null;
  }
}

export interface LoadedCvAssets {
  fontCss: string;
  markDataUri: string | null;
  /** How many of the five faces actually inlined. Reported, never guessed at. */
  fontFacesLoaded: number;
}

export async function loadCvAssets(): Promise<LoadedCvAssets> {
  if (cached) {
    return { ...cached, fontFacesLoaded: (cached.fontCss.match(/@font-face/g) ?? []).length };
  }

  const root = process.cwd();
  const faces = await Promise.all(
    FACES.map(async (face) => {
      const buf = await readOrNull(
        path.join(root, "node_modules", "@fontsource-variable", face.file),
      );
      if (!buf) return null;
      return `@font-face{font-family:"${face.family}";font-style:${face.style};font-weight:${WEIGHT_RANGE};font-display:block;src:url(data:font/woff2;base64,${buf.toString("base64")}) format("woff2");}`;
    }),
  );

  const mark = await readOrNull(path.join(root, "public", "gitwork-mark.png"));

  cached = {
    fontCss: faces.filter(Boolean).join("\n"),
    markDataUri: mark ? `data:image/png;base64,${mark.toString("base64")}` : null,
  };
  return { ...cached, fontFacesLoaded: faces.filter(Boolean).length };
}

/** Test seam — the cache is process-wide and would leak between cases. */
export function resetCvAssetsCache(): void {
  cached = null;
}
