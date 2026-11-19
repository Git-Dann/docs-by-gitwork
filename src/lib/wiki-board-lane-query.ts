/**
 * The query a Done-column page is asked for with (`?kind=cards&offset=0&limit=100`), parsed the
 * same way by the client's link and the team's wiki. A bad value is a 400 naming it, never a
 * silent default.
 */
import { z } from "zod";
import { DONE_PAGE_MAX, type DoneLaneKind } from "@/lib/wiki-board-layout";

const schema = z
  .object({
    kind: z.enum(["cards", "other"]).default("cards"),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
    limit: z.coerce.number().int().min(1).max(DONE_PAGE_MAX).default(DONE_PAGE_MAX),
  })
  .strict();

export function parseDoneLaneQuery(params: URLSearchParams): { kind: DoneLaneKind; offset: number; limit: number } {
  return schema.parse(Object.fromEntries(params.entries()));
}
