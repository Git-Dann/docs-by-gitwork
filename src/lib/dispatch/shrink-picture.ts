/**
 * A picture a person attaches to a Dispatch question, shrunk in the browser before it is sent:
 * the longest side at most 1568px (what the model reads at full detail anyway) as a JPEG. A
 * phone screenshot goes from ~3MB to a few hundred KB, which keeps the request small and the
 * question cheap. The server checks the bytes again (src/lib/dispatch/images.ts).
 */

const MAX_SIDE = 1568;

export async function shrinkPicture(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't prepare pictures.");
    // White behind transparent PNGs, so they don't turn black as JPEG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    bitmap.close();
  }
}
