/**
 * GET /api/u/[slug]/wallet/apple: a public profile as an Apple Wallet pass (CLAUDE.md §139).
 * Public like the page itself; 404 when the page isn't public or Apple Wallet isn't set up.
 */
import { buildApplePass } from "@/server/profile-wallet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let pass: Buffer | null = null;
  try {
    pass = await buildApplePass(slug);
  } catch (e) {
    console.error("[wallet] Apple pass failed", e);
    return new Response("Couldn't make the pass", { status: 500 });
  }
  if (!pass) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(pass), {
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="${slug.replace(/[^a-z0-9-]/g, "")}.pkpass"`,
      "Cache-Control": "no-store",
    },
  });
}
