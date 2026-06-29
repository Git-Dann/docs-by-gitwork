"use client";

import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { Suspense } from "react";
import { useFormStatus } from "react-dom";
import { signInWithGoogle } from "./actions";

const FEATURES = [
  {
    number: "01",
    name: "PULSE",
    description: "500+ automated project checks — AI gap analysis and fix-agent PRs in minutes.",
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

function GoogleButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-3 rounded-[6px] border border-[var(--border-2)] bg-white px-4 py-3 text-sm font-medium text-[var(--text-1)] transition hover:bg-[var(--surface-1)] disabled:opacity-60"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
        <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
      </svg>
      {pending ? "Redirecting…" : "Continue with Google"}
    </button>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/app";
  const authError = searchParams.get("error");

  return (
    <div data-theme="light" className="flex min-h-screen bg-[#FAFAF9]">
      {/* ── Left panel: branding ── */}
      <div
        className="relative hidden w-[480px] shrink-0 flex-col justify-between overflow-hidden px-12 py-12 lg:flex"
        style={{ background: "var(--brand-gradient)" }}
      >
        {/* Radial highlights */}
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
            src="/foundry-logo.png"
            alt="Foundry by Gitwork"
            width={120}
            height={36}
            className="h-9 w-auto brightness-0 invert"
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

      {/* ── Right panel: sign-in ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 sm:px-12">
        {/* Mobile logo */}
        <div className="mb-8 lg:hidden">
          <Image src="/foundry-logo.png" alt="Foundry by Gitwork" width={110} height={34} className="h-9 w-auto" />
        </div>

        <div className="w-full max-w-[400px]">
          <div className="mb-8 text-center">
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

          {authError && (
            <div className="mb-6 rounded-[6px] border border-[rgba(220,38,38,0.2)] bg-[#FEF2F2] px-4 py-3 text-sm text-[#DC2626]">
              Sign-in failed. Make sure you&apos;re using your @gitwork.co.uk account.
            </div>
          )}

          <form action={signInWithGoogle}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <GoogleButton />
          </form>

          <p className="mt-8 text-center text-xs text-[var(--text-4)]">
            Foundry by Gitwork · Gitwork team access only
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
