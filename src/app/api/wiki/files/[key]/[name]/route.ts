/**
 * Serve an image uploaded into a Sheet (§73.2). The 160-bit random key is the credential,
 * like a share link: it reaches the team's grid, the client's share page and anyone they
 * send the image link to. The stored type is ours (sniffed on upload, never SVG), served
 * with `nosniff` and a CSP that runs nothing.
 */
import { readSheetFile } from "@/server/wiki-sheet-files";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string; name: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { key } = await params;
  const file = await readSheetFile(key).catch(() => null);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.bytes.length),
      "Content-Disposition": `inline; filename="${file.filename}"`,
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Robots-Tag": "noindex",
    },
  });
}
