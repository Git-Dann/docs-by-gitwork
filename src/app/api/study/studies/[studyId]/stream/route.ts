import { NextRequest } from "next/server";
import { getStudy } from "@/server/study";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

function sseEvent(type: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `data: ${JSON.stringify({ type, ...(typeof data === "object" && data !== null ? data : { data }) })}\n\n`,
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ studyId: string }> },
) {
  const { studyId } = await params;

  const initial = await getStudy(studyId);
  if (!initial) return new Response("Study not found", { status: 404 });

  const terminal = ["COMPLETED", "FAILED", "PLAN_READY", "DRAFT"];

  if (terminal.includes(initial.status)) {
    const body =
      new TextDecoder().decode(sseEvent("state", { study: initial })) +
      new TextDecoder().decode(sseEvent("complete", {}));
    return new Response(body, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  }

  let closed = false;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const keepalive = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": ping\n\n"));
      }, 15_000);

      const poll = setInterval(async () => {
        if (closed) return;
        try {
          const study = await getStudy(studyId);
          if (!study) { clearInterval(poll); clearInterval(keepalive); controller.close(); closed = true; return; }
          controller.enqueue(sseEvent("state", { study }));
          if (terminal.includes(study.status)) {
            controller.enqueue(sseEvent("complete", {}));
            clearInterval(poll); clearInterval(keepalive);
            controller.close(); closed = true;
          }
        } catch { /* swallow transient errors */ }
      }, 2_000);
    },
    cancel() { closed = true; },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
