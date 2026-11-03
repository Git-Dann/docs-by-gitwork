"use server";

import { signIn } from "@/auth";

// Server-side sign-in (Auth.js v5 recommended pattern). The client-side
// `signIn` from next-auth/react hits the GET /api/auth/signin/google route
// handler, which throws a Configuration error on next-auth 5.0.0-beta.31.
// Driving it from a server action avoids that broken path entirely.
export async function signInWithGoogle(formData: FormData) {
  const callbackUrl = (formData.get("callbackUrl") as string) || "/app";
  await signIn("google", { redirectTo: callbackUrl });
}

/**
 * Guest sign-in. Same server-action route as Google for the same reason.
 *
 * Returns a single generic message for every failure — the provider deliberately
 * cannot tell "no such account" from "wrong password" from "that account is not a
 * guest", and surfacing which it was here would hand back the enumeration oracle
 * the provider was written to avoid.
 */
export async function signInWithPassword(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const callbackUrl = (formData.get("callbackUrl") as string) || "/app";
  try {
    await signIn("guest-password", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: callbackUrl,
    });
    return null;
  } catch (error) {
    // `signIn` throws a redirect on SUCCESS, which Next must be allowed to handle.
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    if (typeof error === "object" && error !== null && "digest" in error) {
      const digest = (error as { digest?: unknown }).digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw error;
    }
    return { error: "That email and password didn't match an account." };
  }
}
