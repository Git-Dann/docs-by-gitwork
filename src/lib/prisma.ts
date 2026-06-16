import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

const isDev = process.env.NODE_ENV === "development";

export const prisma =
  global.prisma ??
  new PrismaClient({
    // In dev we emit `query` as an event so the slow-query logger below can time it.
    log: isDev ? [{ emit: "event", level: "query" }, "warn", "error"] : ["error"],
  });

// Dev-only slow-query log (>300ms) — makes the cost of a query visible while
// developing without touching production. Attach once: guard on the freshly
// created client so Next's hot-reload re-imports don't stack duplicate listeners.
// The runtime log config above guarantees the "query" event exists in dev, so the
// localized cast is sound and keeps the exported `prisma` type unchanged.
if (isDev && !global.prisma) {
  (
    prisma as unknown as {
      $on(event: "query", cb: (e: { duration: number; query: string }) => void): void;
    }
  ).$on("query", (e) => {
    if (e.duration >= 300) {
      console.warn(`[prisma slow-query] ${e.duration}ms — ${e.query.slice(0, 200)}`);
    }
  });
}

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
