import { NextResponse } from "next/server";
import { resolveProofServerUrl } from "@/lib/proof";

export async function GET() {
  const baseUrl = resolveProofServerUrl();

  try {
    const response = await fetch(`${baseUrl}/health`, {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok || !payload) {
      return NextResponse.json(
        {
          error: `Proof service returned ${response.status}.`,
          baseUrl,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      service: "proof",
      baseUrl,
      ...payload,
    });
  } catch {
    return NextResponse.json(
      {
        error: `Proof service is unavailable at ${baseUrl}.`,
        baseUrl,
      },
      { status: 503 },
    );
  }
}
