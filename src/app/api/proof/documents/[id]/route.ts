import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PATCH() {
  return NextResponse.json(
    {
      error: "Proof API is disabled in POC mode. Use the client-side draft workspace instead.",
    },
    { status: 501 },
  );
}
