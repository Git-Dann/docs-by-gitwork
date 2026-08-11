import { beforeAll, describe, expect, it } from "vitest";

/**
 * Guard for a bug that silently killed automated Care sync.
 *
 * `AccountConnection.scraperConfig` stores secrets encrypted (`enc:…`) — see
 * SENSITIVE_SCRAPER_KEYS in src/server/support.ts. Adapters need them in the clear, so
 * every path that builds a SyncContext must decrypt first.
 *
 * The daily cron didn't. It constructed its context inline from the raw Prisma row, so
 * ImapFlow was handed the literal string `enc:{"v":1,…}` as a password, auth failed, and
 * `lastSyncedAt` never advanced — for months, across every IMAP/Discord/app-reviews/
 * analytics connector. Manual "Sync now" worked, because that path happened to decrypt,
 * which is exactly why it went unnoticed.
 *
 * These tests pin the shared `toSyncContext` helper that now owns the decrypt. They fail
 * against any context builder that forgets it.
 */

// Must be set before the encryption module caches the key on first use.
beforeAll(() => {
  process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
});

const WORKSPACE = { id: "ws_1" } as never;

function connRow(scraperConfig: Record<string, unknown> | null) {
  return {
    id: "conn_1",
    source: "IMAP",
    scraperConfig,
    client: { id: "cl_1", name: "Fellas Loaded", slug: "fellas-loaded" },
  } as never;
}

describe("toSyncContext", () => {
  it("hands the adapter a DECRYPTED password, not the enc: literal", async () => {
    const { encryptScraperConfig, toSyncContext } = await import("@/server/support-scraper-config");

    const stored = encryptScraperConfig({
      username: "app@bigwedgegolf.com",
      password: "hunter2-app-password",
    });
    // Precondition: the stored value really is ciphertext, else this test proves nothing.
    expect(stored.password).toMatch(/^enc:/);

    const ctx = toSyncContext(connRow(stored), WORKSPACE);

    expect(ctx.connection.scraperConfig).toMatchObject({
      username: "app@bigwedgegolf.com",
      password: "hunter2-app-password",
    });
  });

  it("leaves non-sensitive config untouched", async () => {
    const { encryptScraperConfig, toSyncContext } = await import("@/server/support-scraper-config");

    const stored = encryptScraperConfig({
      imapHost: "imap.gmail.com",
      imapPort: 993,
      imapSecure: true,
      syncIntervalMinutes: 60,
      password: "s3cret",
    });

    const cfg = toSyncContext(connRow(stored), WORKSPACE).connection
      .scraperConfig as Record<string, unknown>;

    expect(cfg.imapHost).toBe("imap.gmail.com");
    expect(cfg.imapPort).toBe(993);
    expect(cfg.imapSecure).toBe(true);
    // The cron filters on this BEFORE syncing; it must survive the round trip.
    expect(cfg.syncIntervalMinutes).toBe(60);
  });

  it("carries the client through and tolerates a null config", async () => {
    const { toSyncContext } = await import("@/server/support-scraper-config");

    const ctx = toSyncContext(connRow(null), WORKSPACE);

    expect(ctx.connection.scraperConfig).toBeNull();
    expect(ctx.client).toMatchObject({ id: "cl_1", slug: "fellas-loaded" });
    expect(ctx.workspace).toBe(WORKSPACE);
  });
});
