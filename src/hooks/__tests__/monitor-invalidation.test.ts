/**
 * A monitor added or changed on a client's wiki has to show on the Monitors page and the
 * Gitwork all-clients board too, and one added from the Monitors page has to show on the wiki.
 * They read the same rows; this is what makes each view refresh rather than wait a minute.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { invalidateMonitorViews } from "../use-wiki";

describe("invalidateMonitorViews", () => {
  it("refreshes the client's wiki, the Gitwork board and the Monitors page", async () => {
    const invalidateQueries = vi.fn(async () => undefined);
    await invalidateMonitorViews({ invalidateQueries } as unknown as QueryClient, "kestrel");
    const keys = invalidateQueries.mock.calls.map((c) => (c as unknown as [{ queryKey: unknown[] }])[0].queryKey);
    expect(keys).toEqual([["client-wiki", "kestrel"], ["client-wiki", "gitwork", "monitor-board"], ["monitors-page"]]);
  });

  it("is what every monitor write uses, on both pages", () => {
    const src = readFileSync(join(process.cwd(), "src/hooks/use-wiki.ts"), "utf8");
    for (const hook of ["useCreateWikiMonitor", "useUpdateWikiMonitor", "useDeleteWikiMonitor", "useRunWikiMonitor", "useCreateMonitorForClient"]) {
      const start = src.indexOf(`export function ${hook}(`);
      expect(start, hook).toBeGreaterThan(-1);
      const body = src.slice(start, src.indexOf("\n}\n", start));
      expect(body, hook).toContain("invalidateMonitorViews(queryClient, slug)");
    }
  });
});
