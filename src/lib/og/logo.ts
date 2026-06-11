// Reads the Foundry logo from disk and returns it as a base64 data URI so the
// OG card's <img> renders without a network round-trip. Cached in-process so
// each cold function reads at most once.

import { readFile } from "node:fs/promises";
import path from "node:path";

let cached: string | null | undefined;

export async function loadFoundryLogo(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const file = path.join(process.cwd(), "public", "foundry-logo.png");
    const buf = await readFile(file);
    cached = `data:image/png;base64,${buf.toString("base64")}`;
    return cached;
  } catch {
    cached = null;
    return null;
  }
}
