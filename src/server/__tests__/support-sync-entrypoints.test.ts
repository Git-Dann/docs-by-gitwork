import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Care has THREE ways to start a sync, and post-sync housekeeping was wired into ONE of them.
 *
 * `syncSupportClient` (the cockpit header's "Sync now") ran `repairForwardedIdentities` and
 * `backfillConversationActivity`. The per-connection route behind the Channels panel's **Refresh**
 * and **Re-sync history** buttons, and the nightly cron, both called `syncConnection` directly and
 * ran neither. So the two paths an operator actually reaches for to fix a broken board were the two
 * that could not fix it: a client could be re-synced repeatedly, report success, and stay wrong —
 * which is exactly what happened, three times, before anyone thought to check *which* sync.
 *
 * This is a source-shape test rather than a behavioural one on purpose. The failure was never in
 * the logic; it was that a fourth entry point can be added tomorrow and quietly skip the shared
 * step. A behavioural test of the existing three would not have caught the original bug either,
 * because each path was individually correct about the things it did do.
 *
 * Same spirit as `module-gate.test.ts`'s "every /app route resolves to a decision".
 */

const ROOT = process.cwd();

/** Every file that starts a Care sync, and therefore owes the shared housekeeping call. */
const SYNC_ENTRY_POINTS = [
  "src/server/support-sync.ts",
  "src/app/api/support/clients/[clientId]/connections/[connId]/sync/route.ts",
  "src/app/api/cron/support-sync/route.ts",
];

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/**
 * The file with its `import` lines removed.
 *
 * ⚠️ Without this the check was worthless: renaming the CALL while leaving the import in place
 * still satisfied a bare `toContain("runPostSyncHousekeeping")`, so deliberately breaking the route
 * left the test green. Verified by doing exactly that.
 */
function body(rel: string): string {
  return read(rel)
    .split("\n")
    .filter((l) => !/^\s*import\b/.test(l))
    .join("\n");
}

describe("every Care sync entry point runs the shared post-sync housekeeping", () => {
  for (const rel of SYNC_ENTRY_POINTS) {
    it(`${rel} calls runPostSyncHousekeeping`, () => {
      // The invocation, not the identifier — see `body()`.
      expect(body(rel)).toMatch(/runPostSyncHousekeeping\s*\(/);
    });
  }

  it("no entry point hand-rolls the course-request import", () => {
    // It was copy-pasted into all three, each with a comment claiming it matched the others —
    // which is the duplication that let the housekeeping drift apart in the first place.
    const offenders = SYNC_ENTRY_POINTS.filter(
      (rel) => rel !== "src/server/support-sync.ts" && read(rel).includes("runCourseFeedbackImport"),
    );
    expect(offenders).toEqual([]);
  });

  it("housekeeping owns the repair and the backfill, so callers cannot forget one", () => {
    const src = read("src/server/support-sync.ts");
    const fn = src.slice(src.indexOf("export async function runPostSyncHousekeeping"));
    expect(fn).toContain("repairForwardedIdentities");
    expect(fn).toContain("backfillConversationActivity");
  });

  it("the identity repair covers every mail source, not just the one that wrote the rows", () => {
    /*
     * ⚠️ Narrowing this back to GMAIL is the single change that silently re-breaks the repair, and
     * nothing else catches it: deliberately reverting `MAIL_SOURCES` to `["GMAIL"]` left all 132
     * server tests green.
     *
     * The rows it exists to fix are on IMAP now — Fellas' Gmail connector was replaced by the
     * Email one, so a repair scoped to GMAIL sees neither the historical Gmail rows (their
     * connector is gone) nor the live Email ones. Conversations outlive connectors; the repair
     * must be scoped to the conversations, not to whatever ingested them.
     *
     * A behavioural test would need Prisma, which is the import chain `support-scraper-config.ts`
     * was extracted to escape — so this is asserted on the source, like the entry points above.
     */
    const src = read("src/server/support.ts");
    const decl = src.match(/const MAIL_SOURCES[^;]+;/)?.[0] ?? "";
    expect(decl).toContain("GMAIL");
    expect(decl).toContain("IMAP");
  });

  it("the identity repair is not gated on a connection existing", () => {
    // It used to `return { repaired: 0 }` when the client had no GMAIL *connection*, freezing the
    // whole history of any client whose connector had since been swapped.
    const src = read("src/server/support.ts");
    const fn = src.slice(src.indexOf("export async function repairForwardedIdentities"));
    const head = fn.slice(0, fn.indexOf("const candidates"));
    expect(head).not.toMatch(/connections\.length === 0/);
  });

  it("the cron runs housekeeping per CLIENT, not per connection", () => {
    // A client with three connectors would otherwise pay for the repair three times per run.
    expect(read("src/app/api/cron/support-sync/route.ts")).toContain("touchedClientIds");
  });
});
