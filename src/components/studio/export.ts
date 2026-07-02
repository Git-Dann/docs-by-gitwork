// Client-side export. Rasterizes each artboard's true-size DOM node with html-to-image at
// pixelRatio 1x/2x (so a 1080×1350 node → 2160×2700 at 2x), then downloads a single file or
// a .zip of the batch (via fflate, already a dependency). No server round-trip.

import { toJpeg, toPng } from "html-to-image";
import { zipSync } from "fflate";
import type { ExportFormat, ExportScale } from "./config";

export interface ExportTarget {
  filename: string; // without extension
  node: HTMLElement;
  background: string; // solid fill (JPEG has no alpha)
}

function ext(format: ExportFormat): string {
  return format === "png" ? "png" : "jpg";
}

function mime(format: ExportFormat): string {
  return format === "png" ? "image/png" : "image/jpeg";
}

async function rasterize(node: HTMLElement, format: ExportFormat, scale: ExportScale, background: string): Promise<Uint8Array> {
  const options = { pixelRatio: scale, cacheBust: true, backgroundColor: background };
  const dataUrl = format === "png" ? await toPng(node, options) : await toJpeg(node, { ...options, quality: 0.95 });
  return dataUrlToBytes(dataUrl);
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function downloadBytes(bytes: Uint8Array, filename: string, type: string): void {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const blob = new Blob([ab], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Export a single artboard. */
export async function exportOne(target: ExportTarget, format: ExportFormat, scale: ExportScale): Promise<void> {
  const bytes = await rasterize(target.node, format, scale, target.background);
  downloadBytes(bytes, `${target.filename}__${scale}x.${ext(format)}`, mime(format));
}

/**
 * Export every target into one .zip. Runs serially (yielding between each) so a large
 * carousel × platform batch doesn't lock the tab. `onProgress(done, total)` drives a UI bar.
 */
export async function exportAllZip(
  targets: ExportTarget[],
  format: ExportFormat,
  scale: ExportScale,
  zipName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const files: Record<string, Uint8Array> = {};
  let done = 0;
  for (const t of targets) {
    files[`${t.filename}__${scale}x.${ext(format)}`] = await rasterize(t.node, format, scale, t.background);
    onProgress?.(++done, targets.length);
    await tick();
  }
  // level 0 (store) — PNG/JPEG are already compressed, so deflate wastes time for no gain.
  const zipped = zipSync(files, { level: 0 });
  downloadBytes(zipped, zipName, "application/zip");
}
