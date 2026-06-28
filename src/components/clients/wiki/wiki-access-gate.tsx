"use client";

import { useState } from "react";
import Link from "next/link";
import { LockClosedIcon } from "@heroicons/react/24/outline";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

const inputCls =
  "w-full rounded-[8px] border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2.5 text-[16px] text-[var(--text-1)] outline-none transition focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-100)]";

/**
 * Public username/password gate for a protected client wiki. POSTs to
 * /api/wiki/[token]/access; on success the server sets an HttpOnly cookie and we
 * reload so the server component renders the wiki.
 */
export function WikiAccessGate({ token, clientName }: { token: string; clientName: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/wiki/${token}/access`, {
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
      // Cookie is set — reload to render the wiki.
      window.location.reload();
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--surface-0)]">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="rounded-[16px] border border-[rgba(0,0,0,0.08)] bg-white p-8 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.25)]">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] bg-[var(--brand-50)] text-[var(--brand-700)]">
              <LockClosedIcon className="h-6 w-6" />
            </span>
            <p
              className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-4)]"
              style={{ fontFamily: MONO }}
            >
              {clientName}{" // Wiki"}
            </p>
            <h1
              className="mt-1 text-xl text-[var(--text-1)]"
              style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
            >
              Sign in to continue
            </h1>
            <p className="mt-1.5 text-[13px] text-[var(--text-3)]">
              This wiki is private. Enter the username and password you were given.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  className="mb-1.5 block text-[11px] uppercase tracking-[0.06em] text-[var(--text-4)]"
                  style={{ fontFamily: MONO }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className={inputCls}
                />
              </div>
              <div>
                <label
                  className="mb-1.5 block text-[11px] uppercase tracking-[0.06em] text-[var(--text-4)]"
                  style={{ fontFamily: MONO }}
                >
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className={inputCls}
                />
              </div>

              {error && <p className="text-[13px] text-rose-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-[8px] bg-[var(--brand-600)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--brand-700)] disabled:opacity-50"
              >
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-[var(--text-4)]">
            <Link
              href="https://gitwork.co.uk"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--text-2)]"
            >
              Powered by Gitwork
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
