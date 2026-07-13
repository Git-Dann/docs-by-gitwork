"use client";

/**
 * Shared brand primitives for the candidate-facing DevSignal onboarding
 * (/apply + /vet). This is the GITWORK MARKETING brand (per gitwork-brandguide),
 * NOT the Foundry app look: cream paper, Fraunces display serif with a purple
 * period, JetBrains-mono uppercase labels, purple (#6B52FF) accent, dark-navy
 * ink. Fonts are already loaded site-wide (--font-fraunces / --font-mono).
 *
 * Every screen is vertically centred (min-h-screen + items-center) — short steps
 * sit dead-centre; tall steps (the code editor) grow and scroll naturally.
 */

import { useEffect, useState, type ReactNode } from "react";

export const BRAND = {
  cream: "#F2EDE4",
  warm: "#EAE5DC",
  ink: "#1A1A1E",
  inkSoft: "#46464C",
  muted: "#6B6B6B",
  purple: "#6B52FF",
  navy: "#0C0C18",
  white: "#FFFFFF",
  line: "rgba(12,12,24,0.12)",
} as const;

const SERIF = "font-[family-name:var(--font-fraunces)]";

/** "Gitwork" with a purple period — the brand wordmark. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`${SERIF} font-semibold tracking-[-0.01em] text-[#1A1A1E] ${className}`}>
      Gitwork<span className="text-[#6B52FF]">.</span>
    </span>
  );
}

/** Cream, vertically-centred page shell with the brand masthead. */
export function OnboardingShell({
  children,
  meta,
}: {
  children: ReactNode;
  /** Optional right-aligned mono metadata (e.g. "Step 2 of 6"). */
  meta?: string;
}) {
  return (
    // The candidate onboarding is a Gitwork MARKETING surface — always light,
    // regardless of the viewer's app theme. `data-theme="light"` resets the app
    // tokens for this subtree and `colorScheme: light` keeps native controls light.
    <div
      data-theme="light"
      style={{ colorScheme: "light" }}
      className="flex min-h-screen items-center justify-center bg-[#F2EDE4] px-4 py-10"
    >
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-end justify-between">
          <Wordmark className="text-xl" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#6B6B6B]">
            {meta ?? "Developer assessment"}
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Mono uppercase eyebrow with the signature short purple rule above it. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div>
      <div className="mb-3 h-[3px] w-8 rounded-full bg-[#6B52FF]" />
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#6B6B6B]">{children}</p>
    </div>
  );
}

/**
 * White card with a purple-ruled mono eyebrow + a Fraunces headline. A trailing
 * period in `title` is rendered in purple (the brand signature).
 */
export function BrandCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  const clean = title.replace(/\s*\.\s*$/, "");
  const hasPeriod = /\.\s*$/.test(title);
  return (
    <section className="rounded-2xl border border-[rgba(12,12,24,0.1)] bg-[#FFFFFF] p-6 shadow-[0_1px_2px_rgba(12,12,24,0.04),0_12px_32px_-16px_rgba(12,12,24,0.18)] sm:p-8">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className={`${SERIF} mt-3 text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-[#1A1A1E] sm:text-[34px]`}>
        {clean}
        {hasPeriod && <span className="text-[#6B52FF]">.</span>}
      </h1>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Body paragraph — Inter, readable, muted ink. */
export function Lede({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-[#46464C]">{children}</p>;
}

export function BrandButton({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  type?: "button" | "submit";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-[#6B52FF] text-white hover:bg-[#5a43e6]"
      : variant === "secondary"
        ? "bg-[#0C0C18] text-white hover:bg-[#1A1A2E]"
        : "border border-[rgba(12,12,24,0.2)] text-[#1A1A1E] hover:bg-[rgba(12,12,24,0.04)]";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}

/** Text-only tertiary action (e.g. "Skip for now", "← Back"). */
export function BrandLinkButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-sm text-[#6B6B6B] underline-offset-4 transition hover:text-[#1A1A1E] hover:underline">
      {children}
    </button>
  );
}

export function brandInputClass(error?: string) {
  return `w-full rounded-lg border bg-[#FBFAF7] px-3.5 py-2.5 text-sm text-[#1A1A1E] transition placeholder:text-[#9a978f] focus:outline-none focus:ring-2 ${
    error
      ? "border-[#d14343] focus:border-[#d14343] focus:ring-[#d14343]/15"
      : "border-[rgba(12,12,24,0.16)] focus:border-[#6B52FF] focus:ring-[#6B52FF]/15"
  }`;
}

export function BrandField({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.12em] text-[#6B6B6B]">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-[#d14343]">{error}</span>}
    </label>
  );
}

/** Purple progress bar + mono step labels; compact readout on mobile. */
export function ProgressBar({ labels, current }: { labels: string[]; current: number }) {
  const pct = labels.length > 1 ? (current / (labels.length - 1)) * 100 : 0;
  return (
    <div className="mb-6">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(12,12,24,0.1)]">
        <div className="h-full rounded-full bg-[#6B52FF] transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 hidden justify-between sm:flex">
        {labels.map((l, i) => (
          <span
            key={l}
            className={`font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
              i < current ? "text-[#9a978f]" : i === current ? "text-[#6B52FF]" : "text-[#c7c3ba]"
            }`}
          >
            {i < current ? "✓ " : ""}
            {l}
          </span>
        ))}
      </div>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B] sm:hidden">
        Step {current + 1} of {labels.length} · {labels[current]}
      </p>
    </div>
  );
}

/** Fade + slight rise on mount — used per-step (key on the step) for smooth transitions. */
export function FadeIn({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className={`${className} transition-all duration-300 ease-out ${shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
      {children}
    </div>
  );
}
