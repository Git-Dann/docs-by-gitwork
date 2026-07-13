"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BrandButton,
  BrandCard,
  BrandField,
  FadeIn,
  Lede,
  OnboardingShell,
  brandInputClass,
} from "@/components/onboarding/brand";

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
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "locked" | "start" | "starting">("loading");

  useEffect(() => {
    getJson<{ unlocked: boolean }>("/api/apply/unlock")
      .then((d) => setPhase(d.unlocked ? "start" : "locked"))
      .catch(() => setPhase("locked"));
  }, []);

  const onStarted = (token: string) => {
    setPhase("starting");
    router.push(`/vet/${token}`);
  };

  return (
    <OnboardingShell meta="Apply">
      <FadeIn key={phase}>
        {(phase === "loading" || phase === "starting") && (
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#6B6B6B]">
            {phase === "starting" ? "Setting up your assessment…" : "Loading…"}
          </p>
        )}
        {phase === "locked" && <PasswordGate onUnlock={() => setPhase("start")} />}
        {phase === "start" && <StartCard onStarted={onStarted} />}
      </FadeIn>
    </OnboardingShell>
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
    <BrandCard eyebrow="Access" title="This assessment is invite-protected.">
      <Lede>Enter the access password you were given to begin your Gitwork developer assessment.</Lede>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Access password"
          className={brandInputClass(error ?? undefined)}
        />
        {error && <p className="text-sm text-[#d14343]">{error}</p>}
        <BrandButton type="submit" onClick={() => {}} disabled={busy || !password.trim()} className="w-full">
          {busy ? "Checking…" : "Continue →"}
        </BrandButton>
      </form>
    </BrandCard>
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
    <BrandCard eyebrow="DevSignal · Developer assessment" title="Prove your calibre.">
      <Lede>
        A short, fair assessment of how you actually work — your GitHub, a real coding task, and a
        quick intro. Use whatever tools you normally would, including AI. Takes about 30–40 minutes,
        and you can pick up where you left off.
      </Lede>
      <ol className="mt-4 space-y-2">
        {["A bit about you", "Connect your GitHub", "A timed coding challenge", "A short recorded answer"].map((s, i) => (
          <li key={s} className="flex items-center gap-3 text-sm text-[#46464C]">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#6B52FF]/10 font-[family-name:var(--font-playfair)] text-xs italic text-[#6B52FF]">
              {["i", "ii", "iii", "iv"][i]}
            </span>
            {s}
          </li>
        ))}
      </ol>

      <form onSubmit={submit} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <BrandField label="Full name" error={errors.name}>
          <input value={form.name} onChange={set("name")} className={brandInputClass(errors.name)} />
        </BrandField>
        <BrandField label="Email" error={errors.email}>
          <input type="email" value={form.email} onChange={set("email")} className={brandInputClass(errors.email)} />
        </BrandField>
        <BrandField label="GitHub username" error={errors.githubHandle}>
          <input value={form.githubHandle} onChange={set("githubHandle")} placeholder="octocat" className={brandInputClass(errors.githubHandle)} />
        </BrandField>
        <BrandField label="Primary stack (optional)">
          <input value={form.primaryStack} onChange={set("primaryStack")} placeholder="React / TypeScript" className={brandInputClass()} />
        </BrandField>
        {fatal && <p className="text-sm text-[#d14343] sm:col-span-2">{fatal}</p>}
        <div className="sm:col-span-2">
          <BrandButton type="submit" onClick={() => {}} disabled={busy}>{busy ? "Starting…" : "Begin assessment →"}</BrandButton>
        </div>
      </form>
    </BrandCard>
  );
}
