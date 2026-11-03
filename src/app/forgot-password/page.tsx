"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthCard, AuthError, AuthField, authButtonClass } from "@/components/auth/auth-card";

/** Ask for a reset link (src/server/auth/password-reset.ts). Same answer whether or not the address exists. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthCard title="Check your email">
        <p className="text-sm leading-6 text-[var(--text-2)]">
          If <strong>{email}</strong> signs in to Foundry with a password, we&rsquo;ve sent it a link to set a new one.
          The link works once, for an hour.
        </p>
        <p className="mt-3 text-sm leading-6 text-[var(--text-3)]">
          Gitwork staff sign in with Google, so there&rsquo;s no password to reset.
        </p>
        <Link href="/login" className={`mt-6 block ${authButtonClass}`}>
          Back to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset password" subtitle="Enter your email and we'll send you a link to set a new password.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="app-input w-full text-base sm:text-sm"
          />
        </AuthField>
        {error ? <AuthError>{error}</AuthError> : null}
        <button type="submit" disabled={loading} className={authButtonClass}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-[var(--text-4)]">
        <Link href="/login" className="hover:text-[var(--text-2)]">← Back to sign in</Link>
      </p>
    </AuthCard>
  );
}
