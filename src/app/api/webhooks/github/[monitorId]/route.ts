import { after } from "next/server";
import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { verifyGithubSignature, triggerMonitorScan } from "@/server/pulse-monitor";

export const dynamic = "force-dynamic";
// Webhook handler must respond quickly — actual scan runs in after()
export const maxDuration = 10;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ monitorId: string }> },
) {
  const { monitorId } = await params;

  // Read body as text for HMAC verification
  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const event = request.headers.get("x-github-event");

  const monitor = await prisma.pulseMonitor.findUnique({
    where: { id: monitorId },
    select: { webhookSecret: true, isActive: true },
  });

  if (!monitor) return apiError("Monitor not found.", 404);
  if (!monitor.isActive) return apiOk({ status: "monitor_inactive" });

  if (!verifyGithubSignature(body, monitor.webhookSecret, signature)) {
    return apiError("Invalid signature.", 401);
  }

  // Only rescan on push events to the default branch
  if (event !== "push") return apiOk({ status: "ignored", event });

  let payload: { ref?: string };
  try {
    payload = JSON.parse(body) as { ref?: string };
  } catch {
    return apiError("Invalid JSON payload.", 400);
  }

  // Only trigger on pushes to main/master
  const ref = payload.ref ?? "";
  if (!ref.match(/^refs\/heads\/(main|master)$/)) {
    return apiOk({ status: "ignored", ref });
  }

  // Respond immediately, run scan in background
  after(() => triggerMonitorScan(monitorId));

  return apiOk({ status: "queued" });
}
