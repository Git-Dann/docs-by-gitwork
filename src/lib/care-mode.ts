/**
 * Is this a Care client we answer for, or one we only ingest from?
 *
 * Framework-free and dependency-free so the server, the components and the demo all ask the same
 * question — the lists that used to live inside a React component module are why Care ended up
 * showing a control to everyone (see `src/lib/wiki-sections.ts` for the same lesson).
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────────
 * Care home read **573 awaiting · 573 unassigned · 19 urgent** across two clients, and 249 of
 * those were Wedge's. We do not do support for Wedge. What we do is ingest course requests from
 * their mailbox into their wiki — a pipeline that happens to create a `SupportConversation` per
 * email on the way past. `courseRequestOnly` already said so, and already made the sync skip
 * triage and enrichment for them, but nothing ever excluded those rows from the queue, the
 * totals, the HQ tile or the digest. So nearly half the number telling Gitwork how many people
 * were waiting on a reply was a byproduct of a golf-course importer.
 *
 * `ingestOnly` is the general form of that. `courseRequestOnly` keeps its narrow job — *and file
 * New Feedback into the wiki* — and implies this one, so no row has to be migrated.
 */

export type CareMode = "support" | "ingest_only";

/** The two flags a Care client's mode is derived from. Deliberately the smallest shape that works. */
export interface CareModeFields {
  ingestOnly?: boolean | null;
  courseRequestOnly?: boolean | null;
}

export function careMode(client: CareModeFields): CareMode {
  return client.ingestOnly || client.courseRequestOnly ? "ingest_only" : "support";
}

/** Does this client belong on the support desk — the queues, the totals, the HQ tile, the digest? */
export function isSupportDesk(client: CareModeFields): boolean {
  return careMode(client) === "support";
}

/**
 * Split a client list into the desk and the rest, in one pass, preserving order.
 *
 * Every surface that lists Care clients uses this rather than filtering by hand, so none of them
 * can disagree about what Care is for.
 */
export function partitionCareClients<T extends CareModeFields>(clients: readonly T[]): {
  desk: T[];
  ingestOnly: T[];
} {
  const desk: T[] = [];
  const ingestOnly: T[] = [];
  for (const c of clients) (isSupportDesk(c) ? desk : ingestOnly).push(c);
  return { desk, ingestOnly };
}

/** One plain sentence for why a client is not on the desk. Shown to whoever opens it. */
export function ingestOnlyReason(client: CareModeFields): string {
  return client.courseRequestOnly
    ? "Course requests only. Their mail is ingested into the wiki; we do not answer their customers here."
    : "Ingest only. Their mail is ingested, but this is not a support desk — nothing here is waiting on us.";
}
