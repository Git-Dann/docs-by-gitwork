import { NextRequest } from "next/server";
import { getOnboardingByTokenPublic } from "@/server/onboarding";
import { buildOnboardingPdf } from "@/server/onboarding-pdf";

export const dynamic = "force-dynamic";

/**
 * Public, token-gated PDF export of an onboarding submission. The token in the
 * URL is its own auth (matches the rest of /api/onboarding). Bank details are
 * never included — the public payload doesn't carry them.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const session = await getOnboardingByTokenPublic(token);
  if (!session) {
    return new Response("Onboarding not found", { status: 404 });
  }

  const generatedOn = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const pdfBytes = await buildOnboardingPdf(session, { generatedOn });

  const company = session.fields.companyName?.trim() || "onboarding";
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "onboarding";

  return new Response(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="gitwork-${slug}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
