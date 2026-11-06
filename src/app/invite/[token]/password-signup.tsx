"use client";

import { useState } from "react";
import { AuthError, AuthField, authButtonClass } from "@/components/auth/auth-card";
import { signInWithPassword } from "@/app/login/actions";

/** Create an account with a password to accept a business invite, then sign straight in. */
export default function PasswordSignup({ token, lockedEmail }: { token: string; lockedEmail: string | null }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(lockedEmail ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Use at least 8 characters.");
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/invite/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        setLoading(false);
        return;
      }
      const form = new FormData();
      form.set("email", email);
      form.set("password", password);
      form.set("callbackUrl", "/app");
      const signedIn = await signInWithPassword(null, form);
      // Only reached on failure: success redirects.
      if (signedIn?.error) setError("Your account is ready. Sign in with your email and password.");
    } catch (err) {
      // A redirect from the server action is how success arrives.
      if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <AuthField label="Your name">
        <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" className="app-input w-full text-base sm:text-sm" />
      </AuthField>
      <AuthField label="Email">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          readOnly={!!lockedEmail}
          autoComplete="email"
          className="app-input w-full text-base sm:text-sm"
        />
      </AuthField>
      <AuthField label="Choose a password">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className="app-input w-full text-base sm:text-sm"
        />
      </AuthField>
      {error ? <AuthError>{error}</AuthError> : null}
      <button type="submit" disabled={loading} className={authButtonClass}>
        {loading ? "Creating your account…" : "Create account and join"}
      </button>
    </form>
  );
}
