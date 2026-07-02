"use client";

import { useState } from "react";
import { ArrowRightIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";

// The boss's bespoke design: warm cream, violet accent (NOT the Foundry blue
// brand token) and DM Serif Display headings. This page is theme-LOCKED to light —
// it must look identical for clients whose OS is in dark mode, so every colour is
// a fixed hex (the app's --text-*/bg-white tokens invert under dark mode).
const SERIF = "var(--font-display), 'Times New Roman', Georgia, serif";
const PURPLE = "#6C5CE7";
const CARD_BG = "#FBF9F6";
const INK = "#1A1A1A"; // headings
const LABEL = "#403D38"; // field labels
const MUTED = "#57534E"; // body copy
const FAINT = "#8A8577"; // eyebrows / hints
const BORDER = "rgba(0,0,0,0.10)";
// Single flat cream page backdrop — the SAME colour is painted on html/body
// (see the login page), so there's one continuous surface with no seam for the
// card's drop shadow to clip against (an earlier gradient-vs-solid mismatch left
// a hard line across the shadow at the iOS toolbar boundary).
const PAGE_BG = "#EDE8E1";

/** Where the "Back to portal overview" link points. */
const PORTAL_OVERVIEW_URL = "https://gitwork.co.uk";

interface PortalWiki {
  clientName: string;
  slug: string;
  url: string;
}

const inputCls =
  "w-full rounded-[12px] border bg-[#ffffff] px-3.5 py-3 text-[15px] outline-none transition placeholder:text-[#9b958a] focus:border-[#6C5CE7] focus:ring-2 focus:ring-[#6C5CE7]/25";

// ── Right-panel sample preview (decorative) ──────────────────────────────────
type Tone = "done" | "progress" | "upcoming";
const TONE: Record<Tone, { label: string; dot: string; text: string; bg: string }> = {
  done: { label: "Done", dot: "#10b981", text: "#059669", bg: "rgba(16,185,129,0.14)" },
  progress: { label: "In progress", dot: PURPLE, text: PURPLE, bg: "rgba(108,92,231,0.12)" },
  upcoming: { label: "Upcoming", dot: "#9b958a", text: "#7c766a", bg: "rgba(0,0,0,0.05)" },
};
const SAMPLE_MILESTONES: Array<{ name: string; tone: Tone }> = [
  { name: "Discovery", tone: "done" },
  { name: "Build Sprint 1", tone: "done" },
  { name: "Build Sprint 2", tone: "progress" },
  { name: "Launch", tone: "upcoming" },
];

function StatusPill({ tone }: { tone: Tone }) {
  const t = TONE[tone];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: t.bg, color: t.text }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: t.dot }} />
      {t.label}
    </span>
  );
}

function PreviewPanel() {
  return (
    <div className="hidden flex-col justify-center px-10 py-12 md:flex lg:px-12">
      <h2 className="text-[26px] leading-[1.15] tracking-[-0.01em]" style={{ fontFamily: SERIF, color: INK }}>
        See your project the moment you sign in.
      </h2>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed" style={{ color: MUTED }}>
        Live timelines, your team, and updates, all in one place.
      </p>

      <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: FAINT }}>
        Milestones
      </p>
      <ul className="mt-3 space-y-2.5">
        {SAMPLE_MILESTONES.map((m) => (
          <li
            key={m.name}
            className="flex items-center justify-between gap-3 rounded-[12px] bg-[#ffffff] px-4 py-3"
            style={{
              border: m.tone === "progress" ? `1.5px solid ${PURPLE}` : `1px solid ${BORDER}`,
              boxShadow:
                m.tone === "progress"
                  ? "0 4px 12px -6px rgba(108,92,231,0.35)"
                  : "0 1px 2px rgba(0,0,0,0.04)",
            }}
          >
            <span className="truncate text-[15px] font-medium" style={{ color: INK }}>
              {m.name}
            </span>
            <StatusPill tone={m.tone} />
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[12px]" style={{ color: FAINT }}>
        Sample preview
      </p>
    </div>
  );
}

/**
 * Central client portal login. Authenticates by email + password (no wiki token),
 * then routes: one workspace → straight in (honouring ?next when it's the same
 * workspace), several → a chooser.
 */
export function PortalLoginForm({ next }: { next: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [choices, setChoices] = useState<PortalWiki[] | null>(null);

  function slugOf(path: string): string | null {
    const m = /^\/wiki\/([^/]+)\//.exec(path);
    return m ? m[1] : null;
  }

  function routeTo(wikis: PortalWiki[]) {
    // Honour ?next only when the user actually has access to that workspace
    // (prevents a redirect loop back to the login for a wiki they can't open).
    if (next) {
      const nextSlug = slugOf(next);
      if (nextSlug && wikis.some((w) => w.slug === nextSlug)) {
        window.location.assign(next);
        return;
      }
    }
    if (wikis.length === 1) {
      window.location.assign(wikis[0].url);
      return;
    }
    setChoices(wikis);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Invalid email or password");
        setSubmitting(false);
        return;
      }
      const data = (await res.json()) as { wikis: PortalWiki[] };
      routeTo(data.wikis ?? []);
      if ((data.wikis?.length ?? 0) > 1) setSubmitting(false);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div
      // Framed card centred on the cream field (matches the reference). Padding
      // gives the card's drop shadow room so it isn't cropped at the viewport
      // edge. 100dvh tracks iOS Safari's visible viewport (100vh overshoots).
      className="flex min-h-screen items-center justify-center p-6 sm:p-10"
      style={{ background: PAGE_BG, colorScheme: "light", minHeight: "100dvh" }}
    >
      <div
        className="grid w-full max-w-4xl overflow-hidden rounded-[28px] shadow-[0_30px_70px_-30px_rgba(0,0,0,0.30)] md:grid-cols-2"
        style={{ background: CARD_BG }}
      >
        {/* ── Left: sign in ── */}
        <div
          className="flex flex-col justify-center px-8 py-12 sm:px-10 md:border-r md:border-black/10 md:px-12"
        >
          <div>
            <p className="text-[24px] leading-none" style={{ fontFamily: SERIF, color: INK }}>
              Gitwork<span style={{ color: PURPLE }}>.</span>
            </p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: FAINT }}>
              Portal
            </p>
          </div>

          {choices ? (
            <div className="mt-9">
              <h1 className="text-[30px] leading-[1.05]" style={{ fontFamily: SERIF, color: INK }}>
                Choose a workspace
              </h1>
              <p className="mt-2.5 text-[15px]" style={{ color: MUTED }}>
                Your account has access to more than one. Pick where to go.
              </p>
              <ul className="mt-6 space-y-2.5">
                {choices.map((w) => (
                  <li key={w.slug}>
                    <a
                      href={w.url}
                      className="group flex items-center justify-between gap-3 rounded-[12px] bg-[#ffffff] px-4 py-3 transition hover:border-[#6C5CE7]"
                      style={{ border: `1px solid ${BORDER}` }}
                    >
                      <span className="truncate text-[15px] font-medium" style={{ color: INK }}>
                        {w.clientName}
                      </span>
                      <ArrowRightIcon
                        className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5"
                        style={{ color: PURPLE }}
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <h1
                className="mt-9 text-[34px] leading-[1.05] tracking-[-0.01em]"
                style={{ fontFamily: SERIF, color: INK }}
              >
                Welcome back
              </h1>
              <p className="mt-2.5 text-[15px]" style={{ color: MUTED }}>
                Sign in to your Gitwork Portal.
              </p>

              <form onSubmit={handleSubmit} className="mt-7">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium" style={{ color: LABEL }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                    className={inputCls}
                    style={{ borderColor: BORDER, color: INK }}
                  />
                </div>
                <div className="mt-4">
                  <label className="mb-1.5 block text-[13px] font-medium" style={{ color: LABEL }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    className={inputCls}
                    style={{ borderColor: BORDER, color: INK }}
                  />
                </div>

                {error && <p className="mt-3.5 text-[13px] text-rose-600">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-6 w-full rounded-full px-4 py-3 text-[15px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: PURPLE }}
                >
                  {submitting ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <p className="mt-4 text-center text-[13px]" style={{ color: FAINT }}>
                Trouble signing in? Contact your product management team.
              </p>

              <div className="my-5 flex items-center gap-4">
                <span className="h-px flex-1" style={{ background: BORDER }} />
                <span className="text-[13px]" style={{ color: FAINT }}>
                  or
                </span>
                <span className="h-px flex-1" style={{ background: BORDER }} />
              </div>

              <a
                href={PORTAL_OVERVIEW_URL}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-transparent px-4 py-3 text-[15px] font-medium transition hover:bg-[#ffffff]"
                style={{ border: `1px solid ${BORDER}`, color: INK }}
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Back to portal overview
              </a>
            </>
          )}
        </div>

        {/* ── Right: sample preview ── */}
        <PreviewPanel />
      </div>
    </div>
  );
}
