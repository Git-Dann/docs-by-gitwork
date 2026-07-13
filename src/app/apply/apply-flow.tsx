"use client";

import { useEffect, useState, type ReactNode } from "react";
import { VetFlow } from "@/app/vet/[token]/vet-flow";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Request failed");
  return json as T;
}
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Request failed");
  return json as T;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GH_RE = /^@?[a-zA-Z0-9-]+$/;

export function ApplyFlow() {
  const [phase, setPhase] = useState<"loading" | "locked" | "start">("loading");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    getJson<{ unlocked: boolean }>("/api/apply/unlock")
      .then((d) => setPhase(d.unlocked ? "start" : "locked"))
      .catch(() => setPhase("locked"));
  }, []);

  if (token) return <VetFlow token={token} />;

  return (
    <Shell>
      {phase === "loading" && <p className="text-sm text-neutral-500">Loading…</p>}
      {phase === "locked" && <PasswordGate onUnlock={() => setPhase("start")} />}
      {phase === "start" && <StartCard onStarted={setToken} />}
    </Shell>
  );
}

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/apply/unlock", { password });
      onUnlock();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect password.");
      setBusy(false);
    }
  };

  return (
    <Panel eyebrow="Access" title="This assessment is invite-protected">
      <p className="text-sm leading-relaxed text-neutral-600">
        Enter the access password you were given to begin your DevSignal assessment.
      </p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Access password"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password.trim()}
          className="w-full rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Continue"}
        </button>
      </form>
    </Panel>
  );
}

function StartCard({ onStarted }: { onStarted: (token: string) => void }) {
  const [form, setForm] = useState({ name: "", email: "", githubHandle: "", primaryStack: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [k]: e.target.value });
    setErrors((prev) => ({ ...prev, [k]: "" }));
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Your name is required.";
    if (!EMAIL_RE.test(form.email.trim())) next.email = "Enter a valid email.";
    if (!GH_RE.test(form.githubHandle.trim())) next.githubHandle = "Enter your GitHub username (letters, numbers, hyphens).";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setFatal(null);
    try {
      const { token } = await postJson<{ token: string }>("/api/apply/start", {
        name: form.name.trim(),
        email: form.email.trim(),
        githubHandle: form.githubHandle.trim(),
        primaryStack: form.primaryStack.trim() || undefined,
      });
      onStarted(token);
    } catch (err) {
      setFatal(err instanceof Error ? err.message : "Could not start. Please try again.");
      setBusy(false);
    }
  };

  return (
    <Panel eyebrow="DevSignal" title="Prove your calibre">
      <p className="text-sm leading-relaxed text-neutral-600">
        A short, fair assessment of how you actually work — your GitHub, a real coding task, and a
        quick intro. Use whatever tools you normally would, including AI. Takes about 30–40 minutes,
        and you can pick up where you left off.
      </p>
      <ol className="mt-4 space-y-1.5">
        {["A bit about you", "Connect your GitHub", "A timed coding challenge", "A short recorded answer"].map((s, i) => (
          <li key={s} className="flex items-center gap-2.5 text-sm text-neutral-700">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 font-mono text-[10px] text-blue-700">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>

      <form onSubmit={submit} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Full name" error={errors.name}>
          <input value={form.name} onChange={set("name")} className={inputCls(errors.name)} />
        </FormField>
        <FormField label="Email" error={errors.email}>
          <input type="email" value={form.email} onChange={set("email")} className={inputCls(errors.email)} />
        </FormField>
        <FormField label="GitHub username" error={errors.githubHandle}>
          <input value={form.githubHandle} onChange={set("githubHandle")} placeholder="octocat" className={inputCls(errors.githubHandle)} />
        </FormField>
        <FormField label="Primary stack (optional)" error={undefined}>
          <input value={form.primaryStack} onChange={set("primaryStack")} placeholder="React / TypeScript" className={inputCls()} />
        </FormField>
        {fatal && <p className="sm:col-span-2 text-sm text-red-600">{fatal}</p>}
        <button
          type="submit"
          disabled={busy}
          className="sm:col-span-2 mt-1 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Starting…" : "Begin assessment →"}
        </button>
      </form>
    </Panel>
  );
}

// ─── shared shell + primitives (match the candidate VetFlow aesthetic) ──────────

function inputCls(error?: string) {
  return `w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
    error ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "border-neutral-300 focus:border-blue-500 focus:ring-blue-100"
  }`;
}

function FormField({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-xs uppercase tracking-wider text-neutral-500">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F6F3] px-4 py-12">
      <div className="w-full max-w-xl">
        <div className="mb-6 text-center font-mono text-xs uppercase tracking-[0.2em] text-blue-600">
          Gitwork · DevSignal
        </div>
        {children}
      </div>
    </div>
  );
}

function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm">
      <p className="font-mono text-xs uppercase tracking-wider text-neutral-400">{eyebrow}</p>
      <h1 className="mt-1 font-serif text-3xl leading-tight tracking-[-0.02em] text-neutral-900">{title}</h1>
      <div className="mt-4">{children}</div>
    </div>
  );
}
