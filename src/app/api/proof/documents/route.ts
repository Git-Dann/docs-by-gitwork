import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function pocDisabledResponse() {
  return NextResponse.json(
    {
      error: "Proof API is disabled in POC mode. Use the client-side draft workspace instead.",
    },
    { status: 501 },
  );
}

export async function GET() {
  return pocDisabledResponse();
}

export async function POST() {
  return pocDisabledResponse();
}
