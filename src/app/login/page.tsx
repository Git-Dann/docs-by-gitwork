"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      remember: remember ? "1" : "0",
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Incorrect email or password.");
    } else {
      router.push(callbackUrl);
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-1)] px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex justify-center">
          <Image src="/foundry-logo.svg" alt="Foundry by Gitwork" width={120} height={36} />
        </div>

        <div className="rounded-[10px] border border-[var(--border-2)] bg-white p-8 shadow-[var(--shadow-sm)]">
          <h1
            className="text-2xl font-normal tracking-[-0.02em] text-[var(--text-1)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Sign in
          </h1>
          <p className="mt-1.5 text-sm text-[var(--text-3)]">
            Gitwork team access only.
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
                Password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="app-input w-full"
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border-2)] accent-[var(--brand-700)]"
              />
              <span className="text-sm text-[var(--text-3)]">Remember me for 30 days</span>
            </label>

            {error ? (
              <p className="rounded-[10px] bg-[var(--danger-50)] px-4 py-3 text-sm text-[var(--danger-500)]">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-[10px] bg-[var(--brand-700)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-800)] disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-[var(--text-4)]">
            <Link href="/forgot-password" className="hover:text-[var(--text-2)]">
              Forgot password?
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-4)]">
          Foundry by Gitwork — internal platform
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
