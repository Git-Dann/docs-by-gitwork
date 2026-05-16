import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";

export const dynamic = "force-dynamic";

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 7)}${"•".repeat(Math.min(20, key.length - 11))}${key.slice(-4)}`;
}

export async function GET() {
  try {
    const workspace = await prisma.workspace.findFirst({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      select: { anthropicApiKey: true },
    });

    const key = workspace?.anthropicApiKey ?? null;
    const envKey = process.env.ANTHROPIC_API_KEY ?? null;

    return apiOk({
      anthropicKeySource: envKey ? "env" : key ? "database" : null,
      anthropicKeyMasked: envKey ? maskKey(envKey) : key ? maskKey(key) : null,
    });
  } catch (error) {
    return fromError(error);
  }
}

const updateSchema = z.object({
  anthropicApiKey: z.string().trim().min(1),
});

export async function PUT(request: NextRequest) {
  try {
    const body = updateSchema.parse(await request.json());

    await prisma.workspace.updateMany({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      data: { anthropicApiKey: body.anthropicApiKey },
    });

    return apiOk({ saved: true });
  } catch (error) {
    return fromError(error);
  }
}
