import { describe, expect, it, vi, afterEach } from "vitest";
import { GoogleIdTokenError, verifyGoogleIdToken } from "../google-id-token";

// Which client ID lands in an ID token's `aud` is decided by the CLIENT's
// configuration, not the backend's: GoogleSignIn-iOS with `serverClientID`
// unset mints a token for the iOS client ID, and setting it mints one for the
// web client ID. The backend held a single value — the web one — while the
// shipped app sent the iOS one, so every iOS sign-in failed with "audience does
// not match" for months. These tests pin the allow-list behaviour that fixes it
// AND the boundary that must not be relaxed to a third party's client ID.

const IOS = "266306419039-ios.apps.googleusercontent.com";
const WEB = "266306419039-web.apps.googleusercontent.com";
const OTHER = "999999999999-someoneelse.apps.googleusercontent.com";

function mockTokenInfo(aud: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        iss: "https://accounts.google.com",
        aud,
        email: "dan@gitwork.co.uk",
        email_verified: "true",
        name: "Dan Lindsay",
        hd: "gitwork.co.uk",
        sub: "1",
        exp: "9999999999",
      }),
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("verifyGoogleIdToken audience allow-list", () => {
  it("accepts either of our own client IDs from one comma-separated value", async () => {
    for (const aud of [IOS, WEB]) {
      mockTokenInfo(aud);
      const profile = await verifyGoogleIdToken("token", {
        expectedAudience: `${WEB},${IOS}`,
      });
      expect(profile.email).toBe("dan@gitwork.co.uk");
    }
  });

  it("still accepts a single un-delimited value, so existing config keeps working", async () => {
    mockTokenInfo(WEB);
    await expect(
      verifyGoogleIdToken("token", { expectedAudience: WEB }),
    ).resolves.toMatchObject({ email: "dan@gitwork.co.uk" });
  });

  it("tolerates whitespace around entries", async () => {
    mockTokenInfo(IOS);
    await expect(
      verifyGoogleIdToken("token", { expectedAudience: ` ${WEB} , ${IOS} ` }),
    ).resolves.toMatchObject({ email: "dan@gitwork.co.uk" });
  });

  // ⚠️ The boundary. Widening to an audience we do not own would let a token
  // minted for a different application be replayed against Foundry.
  it("rejects an audience that is not on the list", async () => {
    mockTokenInfo(OTHER);
    await expect(
      verifyGoogleIdToken("token", { expectedAudience: `${WEB},${IOS}` }),
    ).rejects.toThrow(GoogleIdTokenError);
  });

  it("rejects when no audience is configured rather than accepting anything", async () => {
    mockTokenInfo(IOS);
    await expect(
      verifyGoogleIdToken("token", { expectedAudience: "  ,  " }),
    ).rejects.toThrow(/not configured/);
  });

  // The domain gate is the real authorisation control and must survive the
  // audience change untouched.
  it("still enforces the workspace domain", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          iss: "https://accounts.google.com",
          aud: IOS,
          email: "someone@gmail.com",
          email_verified: "true",
          hd: "gmail.com",
          sub: "1",
          exp: "9999999999",
        }),
      }),
    );
    await expect(
      verifyGoogleIdToken("token", {
        expectedAudience: `${WEB},${IOS}`,
        requiredHostedDomain: "gitwork.co.uk",
      }),
    ).rejects.toThrow(/workspace domain/);
  });
});
