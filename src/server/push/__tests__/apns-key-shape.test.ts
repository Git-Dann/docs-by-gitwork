import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A key that is SET is not a key that can sign.
 *
 * ⚠️ WHAT THIS FILE IS FOR. A `.env` holds one line per variable, so pasting a
 * `.p8` straight into it leaves `APNS_AUTH_KEY=-----BEGIN PRIVATE KEY-----`
 * and drops the key body on the lines beneath as malformed entries. The
 * variable is then set, non-empty and worthless. That is what was live on the
 * VPS, and it is why not one client push arrived: the presence check passed,
 * so nothing warned, and signing failed silently per send instead.
 *
 * Same shape as §35's `GITHUB_TOKEN` one layer in — "we have a value" read as
 * "we have a working value".
 */

const ENV_KEYS = ["APNS_KEY_ID", "APNS_TEAM_ID", "APNS_BUNDLE_ID", "APNS_AUTH_KEY", "APNS_PRODUCTION"] as const;
const saved: Record<string, string | undefined> = {};

/** A structurally valid P-256 PEM. Not a real key — the body is filler. */
const BODY = "MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg".repeat(5);
const GOOD_PEM = `-----BEGIN PRIVATE KEY-----\n${BODY}\n-----END PRIVATE KEY-----`;

function configure(authKey: string | undefined) {
  process.env.APNS_KEY_ID = "ABCDE12345";
  process.env.APNS_TEAM_ID = "TEAM123456";
  process.env.APNS_BUNDLE_ID = "uk.co.gitwork.axisapp";
  process.env.APNS_PRODUCTION = "true";
  if (authKey === undefined) delete process.env.APNS_AUTH_KEY;
  else process.env.APNS_AUTH_KEY = authKey;
}

/** Re-import so `readConfig` reads the env as just set, and capture the warning. */
async function resolve(): Promise<{ configured: boolean; warning: string }> {
  vi.resetModules();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const mod = await import("../apns");
  const configured = mod.isApnsConfigured();
  const warning = warn.mock.calls.map((c) => String(c[0])).join(" ");
  warn.mockRestore();
  return { configured, warning };
}

beforeEach(() => { for (const k of ENV_KEYS) saved[k] = process.env[k]; });
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("the APNs signing key", () => {
  it("accepts a real multi-line PEM", async () => {
    configure(GOOD_PEM);
    expect((await resolve()).configured).toBe(true);
  });

  /**
   * ⚠️ THE FORM A `.env` CAN ACTUALLY HOLD. One line, `\n` escaped. If this
   * were rejected the only storable form would be the one that breaks.
   */
  it("accepts the escaped single-line form a .env can carry", async () => {
    configure(GOOD_PEM.replace(/\n/g, "\\n"));
    expect((await resolve()).configured).toBe(true);
  });

  it("accepts it quoted, and with Windows line endings", async () => {
    configure(`"${GOOD_PEM.replace(/\n/g, "\r\n")}"`);
    expect((await resolve()).configured).toBe(true);
  });

  /** ⚠️ THE DEFECT THAT WAS LIVE. Header only — set, non-empty, cannot sign. */
  it("refuses the bare PEM header, and says the .p8 was pasted as multiple lines", async () => {
    configure("-----BEGIN PRIVATE KEY-----");
    const { configured, warning } = await resolve();
    expect(configured).toBe(false);
    expect(warning).toMatch(/cannot sign/);
    expect(warning).toMatch(/pasted into \.env as multiple lines/);
  });

  it("refuses a truncated body even when both markers are present", async () => {
    configure("-----BEGIN PRIVATE KEY-----\nMIGT\n-----END PRIVATE KEY-----");
    const { configured, warning } = await resolve();
    expect(configured).toBe(false);
    expect(warning).toMatch(/too short/);
  });

  it("refuses the key body with its markers stripped", async () => {
    configure(BODY);
    const { configured, warning } = await resolve();
    expect(configured).toBe(false);
    expect(warning).toMatch(/no PEM header/);
  });

  /**
   * ⚠️ "Nobody set this up" and "this is set up wrong" must not read the same.
   * Collapsing them sends whoever reads the log to add a secret already there —
   * the conflation §35 records costing a day.
   */
  it("distinguishes a missing key from a broken one", async () => {
    configure(undefined);
    const missing = await resolve();
    expect(missing.warning).toMatch(/not configured/);
    expect(missing.warning).toMatch(/Missing: APNS_AUTH_KEY/);

    configure("-----BEGIN PRIVATE KEY-----");
    const broken = await resolve();
    expect(broken.warning).not.toMatch(/not configured/);
    expect(broken.warning).toMatch(/is set but cannot sign/);
  });

  /** A warning is read by people and copied into tickets — never leak the key. */
  it("never prints any of the key", async () => {
    configure("-----BEGIN PRIVATE KEY-----\nSUPERSECRETBODY\n-----END PRIVATE KEY-----");
    const { warning } = await resolve();
    expect(warning).not.toContain("SUPERSECRETBODY");
  });
});
