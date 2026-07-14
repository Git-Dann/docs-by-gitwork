"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useFormStatus } from "react-dom";
import { signInWithGoogle } from "./actions";

// Match the client portal login (src/components/portal/portal-login-form.tsx):
// warm cream, violet accent (NOT the Foundry blue token), DM Serif headings,
// theme-LOCKED to light so it looks identical regardless of the viewer's OS
// theme. Every colour is a fixed hex — the app's --text-*/bg-white tokens
// invert under dark mode.
const SERIF = "var(--font-display), 'Times New Roman', Georgia, serif";
const PURPLE = "#6C5CE7";
const CARD_BG = "#FBF9F6";
const INK = "#1A1A1A";
const MUTED = "#57534E";
const FAINT = "#8A8577";
const BORDER = "rgba(0,0,0,0.10)";
const PAGE_BG = "#EDE8E1";

const FEATURES = [
  { number: "01", name: "Pulse", description: "500+ automated project checks — AI gap analysis and fix-agent PRs in minutes." },
  { number: "02", name: "Study", description: "Multi-agent user research: persona interviews, synthesis, and shareable reports." },
  { number: "03", name: "Docs", description: "Proposal builder with costing, timelines, and one-click PDF export." },
];

function GoogleButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-3 rounded-full bg-white px-4 py-3 text-[15px] font-semibold transition hover:opacity-90 disabled:opacity-50"
      style={{ border: `1px solid ${BORDER}`, color: INK }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
        <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05" />
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
      </svg>
      {pending ? "Redirecting…" : "Continue with Google"}
    </button>
  );
}

/** Right-hand decorative panel — Foundry platform highlights, in the portal's
 *  cream/serif style. Hidden below md, matching the portal login. */
function PlatformPanel() {
  return (
    <div className="hidden flex-col justify-center px-10 py-12 md:flex lg:px-12">
      <h2 className="text-[26px] leading-[1.15] tracking-[-0.01em]" style={{ fontFamily: SERIF, color: INK }}>
        From prompt to production.
      </h2>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed" style={{ color: MUTED }}>
        The Gitwork operating system — AI-powered tools for every stage of client delivery.
      </p>

      <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: FAINT }}>
        Platform
      </p>
      <ul className="mt-3 space-y-2.5">
        {FEATURES.map((f) => (
          <li
            key={f.number}
            className="flex items-start gap-3 rounded-[12px] bg-white px-4 py-3"
            style={{ border: `1px solid ${BORDER}` }}
          >
            <span className="shrink-0 text-[12px] font-semibold" style={{ color: PURPLE }}>
              {f.number}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold" style={{ color: INK }}>
                {f.name}
              </span>
              <span className="mt-0.5 block text-[13px] leading-relaxed" style={{ color: MUTED }}>
                {f.description}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/app";
  const authError = searchParams.get("error");

  return (
    <div
      className="flex min-h-screen items-center justify-center p-6 sm:p-10"
      style={{ background: PAGE_BG, colorScheme: "light", minHeight: "100dvh" }}
    >
      <div
        className="grid w-full max-w-4xl overflow-hidden rounded-[28px] shadow-[0_30px_70px_-30px_rgba(0,0,0,0.30)] md:grid-cols-2"
        style={{ background: CARD_BG }}
      >
        {/* ── Left: sign in ── */}
        <div className="flex flex-col justify-center px-8 py-12 sm:px-10 md:border-r md:border-black/10 md:px-12">
          <div>
            <p className="text-[24px] leading-none" style={{ fontFamily: SERIF, color: INK }}>
              Gitwork<span style={{ color: PURPLE }}>.</span>
            </p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: FAINT }}>
              Foundry
            </p>
          </div>

          <h1 className="mt-9 text-[34px] leading-[1.05] tracking-[-0.01em]" style={{ fontFamily: SERIF, color: INK }}>
            Welcome back
          </h1>
          <p className="mt-2.5 text-[15px]" style={{ color: MUTED }}>
            Sign in to your Gitwork workspace.
          </p>

          {authError && (
            <p className="mt-4 rounded-[12px] px-3.5 py-3 text-[13px]" style={{ background: "rgba(225,29,72,0.08)", color: "#be123c" }}>
              Sign-in failed. Make sure you&apos;re using your @gitwork.co.uk account.
            </p>
          )}

          <form action={signInWithGoogle} className="mt-7">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <GoogleButton />
          </form>

          <p className="mt-4 text-center text-[13px]" style={{ color: FAINT }}>
            Foundry by Gitwork · Gitwork team access only
          </p>
        </div>

        {/* ── Right: platform highlights ── */}
        <PlatformPanel />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <>
      {/* Theme-lock the document to the cream (matches the portal login) so iOS
          Safari's overscroll / address-bar area doesn't show the dark app body. */}
      <style>{`html,body{background:#EDE8E1 !important;color-scheme:light;}`}</style>
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
