import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      error: "Proof service is disabled in POC mode.",
      baseUrl: null,
    },
    { status: 503 },
  );
}
