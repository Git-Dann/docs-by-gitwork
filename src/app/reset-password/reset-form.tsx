"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthCard, AuthError, AuthField, authButtonClass } from "@/components/auth/auth-card";

export function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("The two passwords don't match.");
    if (password.length < 8) return setError("Use at least 8 characters.");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return setError(data.error ?? "Something went wrong. Try again.");
      setDone(true);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthCard title="Link missing" subtitle="Open the link from your email, or ask for a new one.">
        <Link href="/forgot-password" className={`block ${authButtonClass}`}>Ask for a new link</Link>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Password updated" subtitle="Sign in with your new password.">
        <Link href="/login" className={`block ${authButtonClass}`}>Sign in</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set a new password">
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField label="New password">
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
        <AuthField label="Confirm new password">
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="app-input w-full text-base sm:text-sm"
          />
        </AuthField>
        {error ? <AuthError>{error}</AuthError> : null}
        <button type="submit" disabled={loading} className={authButtonClass}>
          {loading ? "Saving…" : "Set password"}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-[var(--text-4)]">
        <Link href="/forgot-password" className="hover:text-[var(--text-2)]">Link not working? Ask for a new one</Link>
      </p>
    </AuthCard>
  );
}
