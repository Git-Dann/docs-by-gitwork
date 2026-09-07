import { beforeAll, describe, expect, it } from "vitest";
import { encryptScraperConfig, decryptScraperConfig } from "@/server/support-scraper-config";

/**
 * Guards the round trip that the sync loop performs on every run for any adapter emitting a
 * `configPatch` (Discord does, each sync, to persist per-channel cursors).
 *
 * The context handed to an adapter carries the DECRYPTED config. The core used to merge the patch
 * into that object and write it straight back — so each Discord sync rewrote `botToken` in
 * plaintext, silently undoing encryption at rest. Nothing failed, nothing logged; the ciphertext
 * just quietly stopped being ciphertext.
 *
 * The fix re-encrypts on write, which only works because encryptScraperConfig is idempotent.
 */

beforeAll(() => {
  process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString("base64");
});

/** What the core does when persisting a configPatch. */
function persist(decrypted: Record<string, unknown>, patch: Record<string, unknown>) {
  return encryptScraperConfig({ ...decrypted, ...patch });
}

describe("scraperConfig round trip through a configPatch write", () => {
  it("re-encrypts a secret that arrived decrypted — the Discord cursor case", () => {
    const decrypted = { botToken: "super-secret-bot-token", guildId: "123" };
    const stored = persist(decrypted, { channels: [{ id: "c1", lastMessageId: "m9" }] });

    // The secret must never be persisted readable.
    expect(stored.botToken).toMatch(/^enc:/);
    expect(stored.botToken).not.toContain("super-secret-bot-token");
    // The cursor still lands, and non-sensitive fields stay plain.
    expect(stored.channels).toEqual([{ id: "c1", lastMessageId: "m9" }]);
    expect(stored.guildId).toBe("123");
    // And it survives the trip back out.
    expect(decryptScraperConfig(stored)?.botToken).toBe("super-secret-bot-token");
  });

  it("is idempotent — an already-encrypted value is not double-wrapped", () => {
    const once = encryptScraperConfig({ password: "hunter2" });
    const twice = encryptScraperConfig(once);
    expect(twice.password).toBe(once.password);
    expect(decryptScraperConfig(twice)?.password).toBe("hunter2");
  });

  it("covers every sensitive key a connector can hold, not just botToken", () => {
    const stored = persist(
      {
        password: "imap-app-password",
        apiToken: "analytics-bearer",
        serviceAccountJson: '{"private_key":"x"}',
        webhookToken: "wh_live_1",
      },
      { cursor: "abc" },
    );
    for (const k of ["password", "apiToken", "serviceAccountJson", "webhookToken"]) {
      expect(String(stored[k])).toMatch(/^enc:/);
    }
    expect(stored.cursor).toBe("abc");
  });
});
