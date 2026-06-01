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
