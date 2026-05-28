// Read the authenticated mobile-JWT user from incoming request headers.
//
// Populated by middleware (`src/middleware.ts`) after `verifyMobileToken()`
// succeeds. The user payload is forwarded as request headers (x-foundry-user-*)
// rather than re-validating the JWT in every route — middleware already did
// the cryptographic verification, the headers are stripped from incoming
// requests, and only middleware can set them on the forwarded request.
//
// Returns null for:
//   • Web-app calls (API_KEY cookie path — no per-user identity in middleware)
//   • Legacy iOS calls still using the shared bearer token
//   • Public endpoints (sign, docs, report) which bypass auth entirely
//
// Route handlers should treat null as "unknown user" and behave the same way
// they did before per-user auth existed (e.g. monitor-triggered scans).

import type { NextRequest } from "next/server";

export type RequestUser = {
  id: string;
  email: string;
  role: string;
};

export function getRequestUser(req: NextRequest | Request): RequestUser | null {
  const id = req.headers.get("x-foundry-user-id");
  const email = req.headers.get("x-foundry-user-email");
  const role = req.headers.get("x-foundry-user-role");

  if (!id || !email || !role) return null;
  return { id, email, role };
}
