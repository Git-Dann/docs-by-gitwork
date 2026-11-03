import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireScanAccess } from "@/server/pulse";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// ── Delta SSE ────────────────────────────────────────────────────────────────
// Instead of re-sending the entire scan (all ~515 checks + the big AI JSON)
// every 2s, this streams only what's changed:
//   - `checks` events: just the checks the client hasn't seen yet (by checkKey)
//   - `meta`   events: small scalar state (status, healthScore, checksCompletedAt…)
//   - `complete` event: client does one authoritative refetch to pick up the
//     heavy AI payload (llmAnalysis/discoveryKit) exactly once.
// EventSource auto-reconnects past the 90s function cap; the server reads the
// per-connection `sent` set fresh on reconnect and the client de-dupes by
// checkKey, so no data is lost.

/** ⚠️ `satisfies`, not `as const`. Extracting a Prisma args object into a named
 *  const DISABLES the excess-property check that would otherwise catch a field
 *  that does not exist — `as const` does NOT restore it (a bogus key compiles
 *  clean). This is the mechanism that 500'd every client's wiki in Sept 2026.
 *  See CLAUDE.md §50. */
const SCALAR_SELECT = {
  status: true,
  healthScore: true,
  previousHealthScore: true,
  checksCompletedAt: true,
  completedAt: true,
  errorCode: true,
  errorMessage: true,
} as const satisfies Prisma.PulseScanSelect;

/** ⚠️ `satisfies`, not `as const`. Extracting a Prisma args object into a named
 *  const DISABLES the excess-property check that would otherwise catch a field
 *  that does not exist — `as const` does NOT restore it (a bogus key compiles
 *  clean). This is the mechanism that 500'd every client's wiki in Sept 2026.
 *  See CLAUDE.md §50. */
const CHECK_SELECT = {
  id: true,
  scanId: true,
  category: true,
  checkKey: true,
  label: true,
  status: true,
  detail: true,
  evidence: true,
  sortOrder: true,
  createdAt: true,
} as const satisfies Prisma.PulseScanCheckSelect;

function sseEvent(type: string, data: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  const { scanId } = await params;

  // ⚠️ SSE, so it cannot use `fromError` — the guard is caught and turned into the same
  // 404 the other sub-routes return. Without it a guest could stream the live progress
  // and check results of any scan in the workspace by id.
  try {
    await requireScanAccess(request, scanId);
  } catch {
    return new Response("Scan not found", { status: 404 });
  }

  const initial = await prisma.pulseScan.findUnique({ where: { id: scanId }, select: SCALAR_SELECT });
  if (!initial) return new Response("Scan not found", { status: 404 });

  const encoder = new TextEncoder();
  const sent = new Set<string>(); // checkKeys already delivered on this connection

  function scalars(s: {
    status: string; healthScore: number | null; previousHealthScore: number | null;
    checksCompletedAt: Date | null; completedAt: Date | null; errorCode: string | null; errorMessage: string | null;
  }) {
    return {
      status: s.status,
      healthScore: s.healthScore,
      previousHealthScore: s.previousHealthScore,
      checksCompletedAt: s.checksCompletedAt?.toISOString() ?? null,
      completedAt: s.completedAt?.toISOString() ?? null,
      errorCode: s.errorCode,
      errorMessage: s.errorMessage,
    };
  }

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let poll: ReturnType<typeof setInterval> | undefined;
      const close = () => {
        if (closed) return;
        closed = true;
        if (poll) clearInterval(poll);
        clearInterval(keepalive);
        try { controller.close(); } catch { /* already closed */ }
      };

      const keepalive = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": ping\n\n"));
      }, 15_000);

      async function tick() {
        if (closed) return;
        try {
          const scan = await prisma.pulseScan.findUnique({
            where: { id: scanId },
            select: { ...SCALAR_SELECT, checks: { orderBy: { sortOrder: "asc" }, select: CHECK_SELECT } },
          });
          if (!scan) { close(); return; }

          const fresh = scan.checks.filter((c) => !sent.has(c.checkKey));
          if (fresh.length > 0) {
            for (const c of fresh) sent.add(c.checkKey);
            controller.enqueue(
              encoder.encode(
                sseEvent("checks", {
                  checks: fresh.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
                }),
              ),
            );
          }

          controller.enqueue(encoder.encode(sseEvent("meta", { scan: scalars(scan), totalChecks: scan.checks.length })));

          if (scan.status !== "RUNNING") {
            controller.enqueue(encoder.encode(sseEvent("complete", {})));
            close();
          }
        } catch {
          // Swallow transient DB errors — the next tick (or client reconnect) recovers.
        }
      }

      // Emit immediately, then poll.
      await tick();
      if (!closed) poll = setInterval(tick, 2_000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
