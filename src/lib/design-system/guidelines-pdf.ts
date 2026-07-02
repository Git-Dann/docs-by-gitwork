// Client-side Brand Guidelines PDF export.
//
// Snapshots each on-screen deck page (`[data-brand-page]`) to a PNG with html-to-image,
// then assembles them onto landscape-A4 pages with pdf-lib and triggers a download. No
// server, no headless Chromium, no share requirement — works for internal/unshared
// clients. Trade-off: an image-based PDF (not selectable text), which is fine for a
// brand deck where the on-screen deck is the source of truth.

import { PDFDocument } from "pdf-lib";
import { toPng } from "html-to-image";

// A4 landscape in PostScript points (1mm ≈ 2.83465pt).
const A4_LANDSCAPE = { width: 841.89, height: 595.28 };

function triggerDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Render the given deck page nodes into a single landscape-A4 PDF and download it.
 * Pages are captured in array order; each is scaled to fit (contain) and centred.
 */
export async function exportGuidelinesPdf(pages: HTMLElement[], filename: string): Promise<void> {
  const pdf = await PDFDocument.create();

  for (const node of pages) {
    // pixelRatio 2 keeps the raster crisp; cacheBust avoids stale data-URI reuse.
    const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true, backgroundColor: "#ffffff" });
    const png = await pdf.embedPng(dataUrl);
    const page = pdf.addPage([A4_LANDSCAPE.width, A4_LANDSCAPE.height]);

    const scale = Math.min(A4_LANDSCAPE.width / png.width, A4_LANDSCAPE.height / png.height);
    const w = png.width * scale;
    const h = png.height * scale;
    page.drawImage(png, {
      x: (A4_LANDSCAPE.width - w) / 2,
      y: (A4_LANDSCAPE.height - h) / 2,
      width: w,
      height: h,
    });
  }

  const bytes = await pdf.save();
  triggerDownload(bytes, filename);
}
