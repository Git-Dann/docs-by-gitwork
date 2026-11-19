/**
 * GET /api/u/[slug]/wallet/google: sends the visitor to Google Wallet's save page for this
 * profile (CLAUDE.md §139). 404 when the page isn't public or Google Wallet isn't set up.
 */
import { googleSaveUrl } from "@/server/profile-wallet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let url: string | null = null;
  try {
    url = await googleSaveUrl(slug);
  } catch (e) {
    console.error("[wallet] Google pass failed", e);
    return new Response("Couldn't make the pass", { status: 500 });
  }
  if (!url) return new Response("Not found", { status: 404 });
  return Response.redirect(url, 302);
}
