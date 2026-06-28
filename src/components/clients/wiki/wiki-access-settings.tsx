"use client";

import { useState } from "react";
import { LockClosedIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import type { WikiDTO } from "@/lib/api";
import { useSetWikiAccess } from "@/hooks/use-wiki";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

const inputCls =
  "w-full rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2 text-sm text-[var(--text-1)] outline-none transition focus:border-[var(--brand-500)] focus:ring-2 focus:ring-[var(--brand-100)]";

export function WikiAccessSettings({ wiki, slug }: { wiki: WikiDTO; slug: string }) {
  const setAccess = useSetWikiAccess(slug);

  const [requireLogin, setRequireLogin] = useState(wiki.accessProtected);
  const [username, setUsername] = useState(wiki.accessUsername ?? "");
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(wiki.accessHasPassword);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Can't require login until a password exists (either already stored, or being set now).
  const passwordWillExist = hasPassword || password.trim().length > 0;
  const usernameValid = username.trim().length > 0;

  async function handleSave() {
    setError(null);
    setSaved(false);
    if (requireLogin && (!usernameValid || !passwordWillExist)) {
      setError("Set a username and password before requiring login.");
      return;
    }
    try {
      const result = await setAccess.mutateAsync({
        protected: requireLogin,
        username,
        // Only send a password when the operator typed one — empty string would clear it.
        ...(password.trim().length > 0 ? { password } : {}),
      });
      setRequireLogin(result.accessProtected);
      setUsername(result.accessUsername ?? "");
      setHasPassword(result.hasPassword);
      setPassword("");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function handleClearPassword() {
    setError(null);
    setSaved(false);
    try {
      const result = await setAccess.mutateAsync({ protected: false, password: "" });
      setRequireLogin(result.accessProtected);
      setHasPassword(result.hasPassword);
      setPassword("");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">01</span>
            {" // ACCESS"}
          </span>
        </div>

        <div className="space-y-6 p-6">
          <div className="flex items-start gap-3 rounded-[10px] border border-[var(--border-1)] bg-[var(--surface-1)] p-4">
            <LockClosedIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--text-3)]" />
            <p className="text-[13px] leading-relaxed text-[var(--text-3)]">
              Protect the <strong>public client link</strong> with a username and password.
              When enabled, anyone opening the shared <code>/wiki</code> link must sign in before
              seeing the dashboard. Leave it off to keep the link open to anyone who has it.
            </p>
          </div>

          {/* Require login toggle */}
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="text-sm font-medium text-[var(--text-1)]">
              Require login to view the public wiki
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={requireLogin}
              onClick={() => setRequireLogin((v) => !v)}
              className={[
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition",
                requireLogin ? "bg-[var(--brand-600)]" : "bg-[var(--border-2)]",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
                  requireLogin ? "translate-x-5" : "translate-x-0.5",
                ].join(" ")}
              />
            </button>
          </label>

          {/* Username */}
          <div>
            <label
              className="mb-1.5 block text-[11px] uppercase tracking-[0.06em] text-[var(--text-4)]"
              style={{ fontFamily: MONO }}
            >
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. client-team"
              autoComplete="off"
              className={inputCls}
            />
          </div>

          {/* Password */}
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
              placeholder={hasPassword ? "•••••••• (leave blank to keep current)" : "Set a password"}
              autoComplete="new-password"
              className={inputCls}
            />
            {hasPassword && (
              <button
                type="button"
                onClick={handleClearPassword}
                disabled={setAccess.isPending}
                className="mt-2 text-[12px] text-[var(--text-4)] underline hover:text-rose-600 disabled:opacity-50"
              >
                Clear password &amp; disable login
              </button>
            )}
          </div>

          {error && <p className="text-[13px] text-rose-600">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={setAccess.isPending}
              className="inline-flex items-center gap-2 rounded-[8px] bg-[var(--brand-600)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--brand-700)] disabled:opacity-50"
            >
              {setAccess.isPending ? "Saving…" : "Save"}
            </button>
            {saved && !setAccess.isPending && (
              <span className="inline-flex items-center gap-1.5 text-[13px] text-emerald-600">
                <CheckCircleIcon className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
