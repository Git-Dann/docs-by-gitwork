"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

const FEATURES = [
  {
    number: "01",
    name: "PULSE",
    description: "150+ automated project checks — AI gap analysis and fix-agent PRs in minutes.",
  },
  {
    number: "02",
    name: "STUDY",
    description: "Multi-agent user research: persona interviews, synthesis, and shareable reports.",
  },
  {
    number: "03",
    name: "DOCS",
    description: "Proposal builder with costing, timelines, and one-click PDF export.",
  },
];

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
    <div className="flex min-h-screen bg-[#FAFAF9]">
      {/* ── Left panel: branding ── */}
      <div
        className="relative hidden w-[480px] shrink-0 flex-col justify-between overflow-hidden px-12 py-12 lg:flex"
        style={{ background: "var(--brand-gradient)" }}
      >
        {/* Subtle geometric backdrop */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 70% 10%, rgba(59,130,246,0.25) 0%, transparent 55%), radial-gradient(circle at 20% 85%, rgba(30,58,138,0.4) 0%, transparent 50%)",
          }}
        />

        {/* Grid lines */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Logo */}
        <div className="relative z-10">
          <Image
            src="/foundry-logo.svg"
            alt="Foundry by Gitwork"
            width={120}
            height={36}
            className="brightness-0 invert"
          />
        </div>

        {/* Hero copy */}
        <div className="relative z-10 space-y-8">
          <div>
            <p
              className="text-[11px] font-medium uppercase tracking-[1.4px] text-white/60"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              01 // FOUNDRY PLATFORM
            </p>
            <h2
              className="mt-3 text-[42px] font-normal leading-[1.1] tracking-[-0.02em] text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              From prompt
              <br />
              to production.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/70">
              The Gitwork operating system — AI-powered tools for every stage of client delivery.
            </p>
          </div>

          {/* Feature cards */}
          <div className="space-y-3">
            {FEATURES.map((f) => (
              <div
                key={f.number}
                className="rounded-[10px] border border-white/10 bg-white/[0.07] px-4 py-3 backdrop-blur-sm"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="shrink-0 text-[10px] font-medium tracking-[1.2px] text-white/40"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {f.number}
                  </span>
                  <div>
                    <p
                      className="text-[10px] font-medium uppercase tracking-[1.2px] text-white/60"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {f.name}
                    </p>
                    <p className="mt-0.5 text-sm leading-[1.5] text-white/75">{f.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <p className="text-[11px] text-white/40" style={{ fontFamily: "var(--font-mono)" }}>
            © 2026 Gitwork Ltd — Internal use only
          </p>
        </div>
      </div>

      {/* ── Right panel: form ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 sm:px-12">
        {/* Mobile logo */}
        <div className="mb-8 lg:hidden">
          <Image src="/foundry-logo.svg" alt="Foundry by Gitwork" width={110} height={34} />
        </div>

        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <h1
              className="text-[32px] font-normal leading-[1.15] tracking-[-0.02em] text-[var(--text-1)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-[var(--text-3)]">
              Sign in to your Gitwork workspace.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block space-y-1.5">
              <span
                className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-4)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
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
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-4)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  Password
                </span>
                <Link
                  href="/forgot-password"
                  className="text-xs text-[var(--text-4)] transition hover:text-[var(--text-2)]"
                >
                  Forgot password?
                </Link>
              </div>
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
                className="h-4 w-4 rounded-[4px] border-[var(--border-1)] accent-[var(--brand-700)]"
              />
              <span className="text-sm text-[var(--text-3)]">Stay signed in for 30 days</span>
            </label>

            {error ? (
              <div className="rounded-[6px] border border-[var(--danger-200,#FECACA)] bg-[var(--danger-50,#FEF2F2)] px-4 py-3 text-sm text-[var(--danger-500,#EF4444)]">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full rounded-[6px] bg-[var(--brand-700)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-800)] disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-[var(--text-4)]">
            Foundry by Gitwork — Gitwork team access only
          </p>
        </div>
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
