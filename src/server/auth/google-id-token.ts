// Google ID token verifier for the mobile auth callback.
//
// Uses Google's tokeninfo endpoint to validate the token — simpler and just as
// secure as locally verifying against Google's JWKS, since the verification
// happens at sign-in only (not on every request). For high-traffic scenarios
// we'd switch to local JWKS verification.

const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

const ALLOWED_ISSUERS = new Set([
  "accounts.google.com",
  "https://accounts.google.com",
]);

type GoogleTokenInfo = {
  iss: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: string; // tokeninfo returns this as the string "true" / "false"
  name?: string;
  picture?: string;
  hd?: string;
  exp: string;
};

export type VerifiedGoogleProfile = {
  email: string;
  name?: string;
  picture?: string;
  hostedDomain?: string;
};

export class GoogleIdTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleIdTokenError";
  }
}

/**
 * Verifies a Google ID token and returns the validated profile claims.
 *
 * @throws GoogleIdTokenError if the token is malformed, expired, signed for the
 *         wrong audience, or comes from outside the configured workspace domain.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  options?: { expectedAudience?: string; requiredHostedDomain?: string },
): Promise<VerifiedGoogleProfile> {
  const expectedAudience =
    options?.expectedAudience ?? process.env.GOOGLE_IOS_SERVER_CLIENT_ID;

  if (!expectedAudience) {
    throw new GoogleIdTokenError(
      "GOOGLE_IOS_SERVER_CLIENT_ID env var is not configured.",
    );
  }

  const url = `${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`;
  const response = await fetch(url, { method: "GET", cache: "no-store" });

  if (!response.ok) {
    throw new GoogleIdTokenError("Google rejected the ID token.");
  }

  const info = (await response.json()) as GoogleTokenInfo;

  if (!ALLOWED_ISSUERS.has(info.iss)) {
    throw new GoogleIdTokenError(`Unexpected issuer: ${info.iss}`);
  }

  if (info.aud !== expectedAudience) {
    throw new GoogleIdTokenError("ID token audience does not match.");
  }

  if (info.email_verified !== "true" && info.email_verified !== "True") {
    throw new GoogleIdTokenError("Google has not verified this email.");
  }

  const requiredDomain = options?.requiredHostedDomain;
  if (requiredDomain && info.hd?.toLowerCase() !== requiredDomain.toLowerCase()) {
    throw new GoogleIdTokenError(
      `Account is not in the required workspace domain (${requiredDomain}).`,
    );
  }

  return {
    email: info.email,
    name: info.name,
    picture: info.picture,
    hostedDomain: info.hd,
  };
}
