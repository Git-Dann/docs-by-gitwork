import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { MAX_BODY, cleanHeaders } from "@/lib/monitor-request";
import { probeHttp } from "@/server/wiki-monitors/http";
import { probeTcp } from "@/server/wiki-monitors/tcp";
import { probeLocation, probeSecretMatches } from "@/server/wiki-monitors/remote";

// The second check location's side (src/server/wiki-monitors/remote.ts). Public in the
// middleware; the shared secret is the only way in, and without it the route doesn't exist.
// It runs the same SSRF-guarded probes as the VPS and reads nothing from the database.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const schema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("HTTP"),
    target: z.string().url().max(2048),
    method: z.enum(["GET", "HEAD", "POST"]),
    expectedStatus: z.number().int().min(100).max(599).nullable(),
    keyword: z.string().max(200).nullable(),
    degradedMs: z.number().int().min(1).max(120000).nullable(),
    headers: z.record(z.string(), z.string()),
    body: z.string().max(MAX_BODY).nullable(),
  }),
  z.object({ type: z.literal("TCP"), target: z.string().min(3).max(300) }),
]);

export async function POST(req: NextRequest) {
  try {
    if (!probeSecretMatches(req.headers.get("authorization"))) return apiError("Not found", 404);
    const input = schema.parse(await req.json());
    const result =
      input.type === "HTTP"
        ? await probeHttp({ ...input, headers: cleanHeaders(input.headers) })
        : await probeTcp(input.target);
    return apiOk({ ...result, location: probeLocation() });
  } catch (err) {
    return fromError(err);
  }
}
