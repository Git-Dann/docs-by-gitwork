"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { Suspense, useState } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/app";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      await signIn("google", { callbackUrl });
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-1)] px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex justify-center">
          <Image src="/foundry-logo.png" alt="Foundry by Gitwork" width={120} height={36} className="h-9 w-auto" />
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

          {error && (
            <p className="mt-4 rounded-[10px] bg-[var(--danger-50)] px-4 py-3 text-sm text-[var(--danger-500)]">
              {error}
            </p>
          )}

          <button
            onClick={handleGoogle}
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-[10px] border border-[var(--border-2)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--text-1)] transition hover:bg-[var(--surface-2)] disabled:opacity-60"
          >
            {/* Google icon */}
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
              <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            {loading ? "Redirecting…" : "Continue with Google"}
          </button>
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
