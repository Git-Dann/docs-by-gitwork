import { describe, expect, it } from "vitest";
import {
  hasValidApiKeySignature,
  hashApiKey,
  looksLikeApiKey,
  mintApiKey,
  parseApiKey,
  presentsApiKey,
} from "../api-key-token";

const SECRET = "test-secret-for-api-keys-1234567890";

describe("workspace API key tokens", () => {
  it("mints a token that parses back to its key id and verifies", async () => {
    const token = await mintApiKey("k0123456789abcdef01234567", SECRET);
    expect(looksLikeApiKey(token)).toBe(true);
    expect(parseApiKey(token)?.keyId).toBe("k0123456789abcdef01234567");
    expect(await hasValidApiKeySignature(token, SECRET)).toBe(true);
  });

  it("two tokens for one key id differ (the secret part is random)", async () => {
    const a = await mintApiKey("k0123456789abcdef01234567", SECRET);
    const b = await mintApiKey("k0123456789abcdef01234567", SECRET);
    expect(a).not.toBe(b);
  });

  it("refuses a token signed with another secret", async () => {
    const token = await mintApiKey("k0123456789abcdef01234567", "another-secret-entirely-0987654321");
    expect(await hasValidApiKeySignature(token, SECRET)).toBe(false);
  });

  it("refuses a token whose key id was swapped for another", async () => {
    const token = await mintApiKey("k0123456789abcdef01234567", SECRET);
    const [, , secret, sig] = token.split("_");
    const forged = `fwk_kffffffffffffffffffffffff_${secret}_${sig}`;
    expect(await hasValidApiKeySignature(forged, SECRET)).toBe(false);
  });

  it("refuses a token with one changed character in its signature", async () => {
    const token = await mintApiKey("k0123456789abcdef01234567", SECRET);
    const last = token.slice(-1);
    const tampered = token.slice(0, -1) + (last === "a" ? "b" : "a");
    expect(await hasValidApiKeySignature(tampered, SECRET)).toBe(false);
  });

  it("rejects malformed tokens without throwing", async () => {
    for (const t of ["", "fwk_", "fwk_a_b_c", "fwk_abcdefgh_ijklmnop", "Bearer fwk_x", "fwk_abcdefgh_ijkl mnop_qrstuvwx"]) {
      expect(parseApiKey(t)).toBeNull();
      expect(await hasValidApiKeySignature(t, SECRET)).toBe(false);
    }
  });

  it("is not confused with the env API key or a mobile JWT", () => {
    expect(looksLikeApiKey("eyJhbGciOiJIUzI1NiJ9.e30.x")).toBe(false);
    expect(looksLikeApiKey("some-shared-api-key")).toBe(false);
    expect(looksLikeApiKey(null)).toBe(false);
  });

  it("stores only a hash, stable for the same token", async () => {
    const token = await mintApiKey("k0123456789abcdef01234567", SECRET);
    const h = await hashApiKey(token);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashApiKey(token)).toBe(h);
    expect(h).not.toContain(parseApiKey(token)!.secret);
  });

  it("presentsApiKey reads only the bearer header", async () => {
    const token = await mintApiKey("k0123456789abcdef01234567", SECRET);
    expect(presentsApiKey(new Request("https://x.test", { headers: { authorization: `Bearer ${token}` } }))).toBe(true);
    expect(presentsApiKey(new Request("https://x.test", { headers: { authorization: "Bearer other" } }))).toBe(false);
    expect(presentsApiKey(new Request("https://x.test"))).toBe(false);
  });
});
