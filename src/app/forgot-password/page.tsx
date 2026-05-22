"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

type Step = "form" | "success";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, recoveryKey, newPassword }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setStep("success");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-1)] px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex justify-center">
          <Image src="/foundry-logo.svg" alt="Foundry by Gitwork" width={120} height={36} />
        </div>

        <div className="rounded-[10px] border border-[var(--border-2)] bg-white p-8 shadow-[var(--shadow-sm)]">
          {step === "success" ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold text-[var(--text-1)]">Password updated</h1>
              <p className="mt-2 text-sm text-[var(--text-3)]">
                Your password has been reset. You can now sign in with your new password.
              </p>
              <Link
                href="/login"
                className="mt-6 block w-full rounded-[10px] bg-[var(--brand-700)] px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-[var(--brand-800)]"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-normal tracking-[-0.02em] text-[var(--text-1)]"
                style={{ fontFamily: "var(--font-display)" }}>
                Reset password
              </h1>
              <p className="mt-1.5 text-sm text-[var(--text-3)]">
                Enter your email and the recovery key from your Vercel environment settings.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">
                    Email
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@gitwork.co.uk"
                    className="app-input w-full"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">
                    Recovery key
                  </span>
                  <input
                    type="password"
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value)}
                    required
                    placeholder="INITIAL_ADMIN_PASSWORD value"
                    className="app-input w-full"
                  />
                  <p className="text-[11px] text-[var(--text-4)]">
                    The <code className="rounded bg-[var(--surface-1)] px-1">INITIAL_ADMIN_PASSWORD</code> value from your Vercel project settings.
                  </p>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">
                    New password
                  </span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Min. 8 characters"
                    className="app-input w-full"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-4)]">
                    Confirm new password
                  </span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="Repeat new password"
                    className="app-input w-full"
                  />
                </label>

                {error && (
                  <p className="rounded-[10px] bg-[var(--danger-50)] px-4 py-3 text-sm text-[var(--danger-500)]">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 w-full rounded-[10px] bg-[var(--brand-700)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-800)] disabled:opacity-60"
                >
                  {loading ? "Resetting…" : "Reset password"}
                </button>
              </form>

              <p className="mt-4 text-center text-xs text-[var(--text-4)]">
                <Link href="/login" className="hover:text-[var(--text-2)]">
                  ← Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-4)]">
          Foundry by Gitwork — internal platform
        </p>
      </div>
    </div>
  );
}
