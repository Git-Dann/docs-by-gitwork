/**
 * Custom hostname management (P5.19).
 *
 *   GET    /api/settings/custom-hostname        → current state for the workspace
 *   POST   /api/settings/custom-hostname        → set / replace the hostname; mints a fresh token
 *   DELETE /api/settings/custom-hostname        → clear the hostname (back to default Vercel URL)
 *
 * Verification lives at `/api/settings/custom-hostname/verify` (separate route).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { dnsInstructions, isValidHostname, mintVerificationToken } from "@/server/custom-hostname";

const postSchema = z.object({
  hostname: z.string().min(3).max(253),
});

export async function GET() {
  try {
    const { workspace } = await ensureBaseRecords();
    const ws = await prisma.workspace.findUnique({
      where: { id: workspace.id },
      select: {
        customHostname: true,
        customHostnameVerified: true,
        customHostnameToken: true,
      },
    });

    if (!ws?.customHostname) {
      return apiOk({ hostname: null, verified: false, instructions: null });
    }

    const instructions = ws.customHostnameToken
      ? dnsInstructions(ws.customHostname, ws.customHostnameToken)
      : null;

    return apiOk({
      hostname: ws.customHostname,
      verified: ws.customHostnameVerified,
      instructions,
    });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { workspace } = await ensureBaseRecords();
    const body = postSchema.parse(await request.json());
    const hostname = body.hostname.trim().toLowerCase();

    if (!isValidHostname(hostname)) {
      return apiError(
        "Invalid hostname. Use a fully-qualified domain like docs.example.com (no protocol, no path).",
        400,
      );
    }

    // Reject conflicts with other workspaces — the column is @unique but a friendly 409 is nicer.
    const conflict = await prisma.workspace.findFirst({
      where: { customHostname: hostname, NOT: { id: workspace.id } },
      select: { id: true },
    });
    if (conflict) {
      return apiError(
        "This hostname is already claimed by another workspace. Pick a different subdomain.",
        409,
      );
    }

    const token = mintVerificationToken();
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        customHostname: hostname,
        customHostnameToken: token,
        customHostnameVerified: false,
      },
    });

    return apiOk({
      hostname,
      verified: false,
      instructions: dnsInstructions(hostname, token),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.issues.map((i) => i.message).join(", "), 400);
    }
    return fromError(error);
  }
}

export async function DELETE() {
  try {
    const { workspace } = await ensureBaseRecords();
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        customHostname: null,
        customHostnameToken: null,
        customHostnameVerified: false,
      },
    });
    return apiOk({ hostname: null, verified: false, instructions: null });
  } catch (error) {
    return fromError(error);
  }
}
