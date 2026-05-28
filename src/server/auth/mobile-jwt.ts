// Mobile JWT sign + verify, edge-runtime safe (uses jose, the same library
// NextAuth uses for session tokens).
//
// We sign with AUTH_SECRET (shared with NextAuth) but use a distinct audience
// so mobile tokens are not interchangeable with web session JWTs — middleware
// can therefore route the two paths independently.

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const MOBILE_TOKEN_ISSUER = "foundry-by-gitwork";
export const MOBILE_TOKEN_AUDIENCE = "foundry-mobile";

const DEFAULT_MAX_AGE_DAYS = 30;

export type MobileTokenClaims = {
  sub: string; // userId
  email: string;
  role: string;
  permissions: string[];
};

export class MobileTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MobileTokenError";
  }
}

function getSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw) {
    throw new MobileTokenError("AUTH_SECRET env var is not configured.");
  }
  return new TextEncoder().encode(raw);
}

export async function signMobileToken(
  claims: MobileTokenClaims,
  options?: { maxAgeDays?: number },
): Promise<string> {
  const maxAge = options?.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  return await new SignJWT({
    email: claims.email,
    role: claims.role,
    permissions: claims.permissions,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuer(MOBILE_TOKEN_ISSUER)
    .setAudience(MOBILE_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${maxAge}d`)
    .sign(getSecret());
}

export async function verifyMobileToken(
  token: string,
): Promise<MobileTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: MOBILE_TOKEN_ISSUER,
      audience: MOBILE_TOKEN_AUDIENCE,
    });
    return extractClaims(payload);
  } catch (error) {
    if (error instanceof MobileTokenError) throw error;
    throw new MobileTokenError("Invalid mobile token.");
  }
}

function extractClaims(payload: JWTPayload): MobileTokenClaims {
  const sub = payload.sub;
  const email = payload.email;
  const role = payload.role;
  const permissions = payload.permissions;

  if (typeof sub !== "string" || typeof email !== "string" || typeof role !== "string") {
    throw new MobileTokenError("Mobile token is missing required claims.");
  }

  return {
    sub,
    email,
    role,
    permissions: Array.isArray(permissions) ? (permissions as string[]) : [],
  };
}
