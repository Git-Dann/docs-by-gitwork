import { getPublicReport, renderReportMarkdown } from "@/server/pulse-lite/public-report";

export const dynamic = "force-dynamic";

/**
 * GET /scan/[id]/md  (PUBLIC)
 *
 * The Markdown representation of a public Pulse report, with the correct
 * `Content-Type: text/markdown` and — importantly — `Vary: Accept`.
 *
 * Why `Vary` matters: without it a shared cache that has stored the HTML variant
 * can hand it to a client that asked for Markdown, or the reverse, depending purely
 * on which landed in the cache first. It is the difference between content
 * negotiation working and appearing to work.
 *
 * `/scan/[id]` also honours `Accept: text/markdown` for convenience, but a page
 * cannot set its own Content-Type, so this route is the one that serves real
 * Markdown to an agent or a CLI.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getPublicReport(id);
  if (!report) {
    return new Response("# Report not found\n\nThis scan does not exist, or it has expired.\n", {
      status: 404,
      headers: { "content-type": "text/markdown; charset=utf-8", vary: "Accept" },
    });
  }
  return new Response(renderReportMarkdown(report), {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      vary: "Accept, Accept-Encoding",
      // Short: a report is immutable once complete, but a still-running scan's
      // Markdown would otherwise be cached mid-flight.
      "cache-control": "public, max-age=60, must-revalidate",
      "x-content-type-options": "nosniff",
    },
  });
}
