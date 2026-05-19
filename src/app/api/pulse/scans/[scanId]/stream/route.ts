import { NextRequest } from "next/server";
import { getPulseScan } from "@/server/pulse";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

function sseEvent(type: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify({ type, ...( typeof data === "object" && data !== null ? data : { data }) })}\n\n`);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  const { scanId } = await params;

  const initial = await getPulseScan(scanId);
  if (!initial) {
    return new Response("Scan not found", { status: 404 });
  }

  // Already terminal — return a one-shot stream so the client can update.
  if (initial.status !== "RUNNING") {
    const body =
      sseEvent("state", { scan: initial }).reduce((a: string, b: number) => a + String.fromCharCode(b), "") +
      new TextDecoder().decode(sseEvent("complete", {}));
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  let closed = false;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Keepalive comment every 15s so proxies don't drop the connection
      const keepalive = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": ping\n\n"));
      }, 15_000);

      const poll = setInterval(async () => {
        if (closed) return;
        try {
          const scan = await getPulseScan(scanId);
          if (!scan) {
            clearInterval(poll);
            clearInterval(keepalive);
            controller.close();
            closed = true;
            return;
          }

          controller.enqueue(sseEvent("state", { scan }));

          if (scan.status !== "RUNNING") {
            controller.enqueue(sseEvent("complete", {}));
            clearInterval(poll);
            clearInterval(keepalive);
            controller.close();
            closed = true;
          }
        } catch {
          // Swallow poll errors — transient DB issues shouldn't kill the stream
        }
      }, 2_000);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
