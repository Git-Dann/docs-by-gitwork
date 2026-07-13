"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { PublicVetSession } from "@/types/devsignal";
import { ChallengeRunner } from "./challenge-runner";

type Step = "welcome" | "intake" | "connect" | "challenge" | "video" | "identity" | "done";
const STEPS: Step[] = ["welcome", "intake", "connect", "challenge", "video", "identity", "done"];
const STEP_LABEL: Record<Step, string> = {
  welcome: "Welcome",
  intake: "About you",
  connect: "GitHub",
  challenge: "Challenge",
  video: "Intro",
  identity: "Identity",
  done: "Done",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_ANSWER_CHARS = 120;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Request failed");
  return json as T;
}
async function sendJson<T>(url: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? "Request failed");
  return json as T;
}

export function VetFlow({ token }: { token: string }) {
  const [session, setSession] = useState<PublicVetSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("welcome");

  useEffect(() => {
    getJson<{ session: PublicVetSession }>(`/api/vet/${token}`)
      .then((d) => setSession(d.session))
      .catch((e) => setLoadError(e.message));
  }, [token]);

  const go = (s: Step) => setStep(s);
  const next = () => setStep((s) => STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(s) + 1)]);

  const refetch = useCallback(async () => {
    const d = await getJson<{ session: PublicVetSession }>(`/api/vet/${token}`);
    setSession(d.session);
  }, [token]);

  const advance = useCallback(async () => {
    await refetch();
    next();
  }, [refetch]);

  if (loadError) {
    return <Shell><Panel eyebrow="DevSignal" title="Link not found"><p className="text-sm text-neutral-600">This assessment link is invalid or has expired. Please contact your Gitwork contact.</p></Panel></Shell>;
  }
  if (!session) {
    return <Shell><p className="text-sm text-neutral-500">Loading…</p></Shell>;
  }
  if (session.expired) {
    return <Shell><Panel eyebrow="DevSignal" title="Link expired"><p className="text-sm text-neutral-600">This assessment link has expired. Please contact your Gitwork contact for a fresh one.</p></Panel></Shell>;
  }

  return (
    <Shell>
      <ProgressBar current={step} />
      <FadeIn key={step} className="mt-8">
        {step === "welcome" && (
          <Panel title={`Welcome, ${session.candidate.name}`} eyebrow="DevSignal assessment">
            <p className="text-sm leading-relaxed text-neutral-600">
              This short assessment helps us understand how you actually work — a bit about you, your
              GitHub, a timed coding challenge, and a quick intro. Use whatever tools you normally
              would, <span className="font-medium text-neutral-800">including AI</span>. It takes about
              30–40 minutes and you can pause and come back any time.
            </p>
            <ResumeNote />
            <PrimaryButton onClick={next}>Get started →</PrimaryButton>
          </Panel>
        )}

        {step === "intake" && <IntakeStep token={token} session={session} onSaved={advance} />}
        {step === "connect" && <ConnectStep token={token} session={session} onSaved={advance} />}

        {step === "challenge" && (
          <Panel title="Coding challenge" eyebrow="Step 3">
            {session.challenge ? (
              <ChallengeRunner token={token} challenge={session.challenge} onDone={advance} />
            ) : (
              <>
                <p className="text-sm text-neutral-600">No challenge assigned for this assessment.</p>
                <PrimaryButton onClick={next}>Continue →</PrimaryButton>
              </>
            )}
          </Panel>
        )}

        {step === "video" && <VideoStep token={token} question={session.videoQuestion} onDone={advance} onSkip={next} />}
        {step === "identity" && <IdentityStep token={token} onDone={advance} onSkip={next} />}

        {step === "done" && (
          <Panel title="All done — thank you" eyebrow="Submitted">
            <p className="text-sm leading-relaxed text-neutral-600">
              Thanks, {session.candidate.name}. Your assessment is complete and with the Gitwork team
              for review. We&apos;ll be in touch about next steps — and we&apos;ve emailed you a copy of
              your link.
            </p>
          </Panel>
        )}
      </FadeIn>

      {step !== "welcome" && step !== "done" && (
        <button onClick={() => go(STEPS[STEPS.indexOf(step) - 1])} className="mt-6 text-xs text-neutral-400 transition hover:text-neutral-600">
          ← Back
        </button>
      )}
    </Shell>
  );
}

// ─── steps ────────────────────────────────────────────────────────────────

function IntakeStep({ token, session, onSaved }: { token: string; session: PublicVetSession; onSaved: () => void }) {
  const c = session.candidate;
  const [form, setForm] = useState({
    name: c.name ?? "",
    email: c.email ?? "",
    location: c.location ?? "",
    timezone: c.timezone ?? "",
    primaryStack: c.primaryStack === "Unknown" ? "" : c.primaryStack ?? "",
    yearsExperience: c.yearsExperience?.toString() ?? "",
    linkedinUrl: c.linkedinUrl ?? "",
    portfolioUrl: c.portfolioUrl ?? "",
    availability: c.availability ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async () => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Your name is required.";
    if (!EMAIL_RE.test(form.email.trim())) next.email = "Enter a valid email address.";
    if (form.yearsExperience && Number(form.yearsExperience) < 0) next.yearsExperience = "Can't be negative.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      await sendJson(`/api/vet/${token}`, "PATCH", {
        ...form,
        yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : undefined,
      });
      onSaved();
    } catch (e) {
      setErrors({ _: e instanceof Error ? e.message : "Could not save" });
      setSaving(false);
    }
  };

  const field = (key: keyof typeof form, label: string, type = "text") => (
    <FieldLabel label={label} error={errors[key]}>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => {
          setForm({ ...form, [key]: e.target.value });
          if (errors[key]) setErrors((p) => ({ ...p, [key]: "" }));
        }}
        className={inputCls(errors[key])}
      />
    </FieldLabel>
  );

  return (
    <Panel title="A bit about you" eyebrow="Step 1">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {field("name", "Full name")}
        {field("email", "Email", "email")}
        {field("primaryStack", "Primary stack")}
        {field("yearsExperience", "Years experience", "number")}
        {field("location", "Location")}
        {field("timezone", "Timezone")}
        {field("linkedinUrl", "LinkedIn URL")}
        {field("portfolioUrl", "Portfolio URL")}
      </div>
      {errors._ && <p className="mt-3 text-sm text-red-600">{errors._}</p>}
      <PrimaryButton onClick={save} disabled={saving}>{saving ? "Saving…" : "Continue →"}</PrimaryButton>
    </Panel>
  );
}

function ConnectStep({ token, session, onSaved }: { token: string; session: PublicVetSession; onSaved: () => void }) {
  const [handle, setHandle] = useState(session.candidate.githubHandle ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!/^@?[a-zA-Z0-9-]+$/.test(handle.trim())) {
      setErr("Enter a valid GitHub username (letters, numbers, hyphens).");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await sendJson(`/api/vet/${token}/connect`, "POST", { githubHandle: handle });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
      setSaving(false);
    }
  };

  return (
    <Panel title="Connect your GitHub" eyebrow="Step 2">
      <p className="mb-4 text-sm leading-relaxed text-neutral-600">
        We analyse your public GitHub activity as part of the assessment. Enter your GitHub username —
        we&apos;ll check it resolves to a real account.
      </p>
      <FieldLabel label="GitHub username" error={err ?? undefined}>
        <div className="flex items-center rounded-md border border-neutral-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
          <span className="pl-3 text-sm text-neutral-400">github.com/</span>
          <input
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value);
              if (err) setErr(null);
            }}
            placeholder="octocat"
            className="flex-1 bg-transparent px-1 py-2 text-sm focus:outline-none"
          />
        </div>
      </FieldLabel>
      <PrimaryButton onClick={save} disabled={saving || !handle.trim()}>{saving ? "Checking…" : "Continue →"}</PrimaryButton>
    </Panel>
  );
}

function VideoStep({ token, question, onDone, onSkip }: { token: string; question: string; onDone: () => void; onSkip: () => void }) {
  const [transcript, setTranscript] = useState("");
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<string | null>(null);

  const startRecording = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = typeof reader.result === "string" ? reader.result : "";
          audioRef.current = dataUrl.split(",")[1] ?? null;
          setRecorded(true);
        };
        reader.readAsDataURL(blob);
      };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
    } catch {
      setErr("Could not access your microphone. You can type your answer instead.");
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const typedLongEnough = transcript.trim().length >= MIN_ANSWER_CHARS;
  const canSubmit = recorded || typedLongEnough;

  const submit = async () => {
    if (!canSubmit) {
      setErr(`Please record an answer or write at least ${MIN_ANSWER_CHARS} characters.`);
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await sendJson(`/api/vet/${token}/video`, "POST", {
        transcript: transcript.trim() || undefined,
        audioBase64: audioRef.current ?? undefined,
        mimeType: "audio/webm",
        consentRetainTranscript: consent,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not submit");
      setSubmitting(false);
    }
  };

  return (
    <Panel title="A quick intro" eyebrow="Step 4">
      <p className="mb-4 rounded-md bg-blue-50 p-3 text-sm leading-relaxed text-neutral-700">{question}</p>
      <div className="mb-4 flex items-center gap-3">
        {!recording ? (
          <button onClick={startRecording} className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50">
            {recorded ? "Re-record" : "● Record audio"}
          </button>
        ) : (
          <button onClick={stopRecording} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white">■ Stop</button>
        )}
        {recorded && <span className="text-sm text-green-600">Recorded ✓</span>}
      </div>
      <FieldLabel label="Or type your answer">
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={6}
          className={inputCls()}
        />
      </FieldLabel>
      {!recorded && transcript.trim().length > 0 && !typedLongEnough && (
        <p className="mt-1 text-xs text-neutral-400">{transcript.trim().length}/{MIN_ANSWER_CHARS} characters</p>
      )}
      <label className="mt-3 flex items-start gap-2 text-sm text-neutral-600">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        <span>I consent to Gitwork retaining a transcript of my answer for this assessment.</span>
      </label>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      <div className="mt-6 flex items-center gap-3">
        <PrimaryButton onClick={submit} disabled={submitting || !canSubmit} noMargin>{submitting ? "Submitting…" : "Submit answer →"}</PrimaryButton>
        <button onClick={onSkip} className="text-sm text-neutral-400 transition hover:text-neutral-600">Skip for now</button>
      </div>
    </Panel>
  );
}

function IdentityStep({ token, onDone, onSkip }: { token: string; onDone: () => void; onSkip: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const verify = async () => {
    setBusy(true);
    setErr(null);
    try {
      await sendJson(`/api/vet/${token}/identity`, "POST", {});
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start verification");
      setBusy(false);
    }
  };

  return (
    <Panel title="Verify your identity" eyebrow="Step 5">
      <p className="text-sm leading-relaxed text-neutral-600">
        A quick identity check confirms the person assessed is the person placed. We never store your
        ID documents — only a pass/fail from the verification provider.
      </p>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      <div className="mt-6 flex items-center gap-3">
        <PrimaryButton onClick={verify} disabled={busy} noMargin>{busy ? "Starting…" : "Verify identity →"}</PrimaryButton>
        <button onClick={onSkip} className="text-sm text-neutral-400 transition hover:text-neutral-600">Skip for now</button>
      </div>
    </Panel>
  );
}

// ─── layout primitives ───────────────────────────────────────────────────────

function inputCls(error?: string) {
  return `w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
    error ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "border-neutral-300 focus:border-blue-500 focus:ring-blue-100"
  }`;
}

function FieldLabel({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-xs uppercase tracking-wider text-neutral-500">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

function FadeIn({ children, className }: { children: ReactNode; className?: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className={`${className ?? ""} transition-all duration-300 ${shown ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}>
      {children}
    </div>
  );
}

function ResumeNote() {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? window.location.href : "";
  return (
    <div className="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">Save your place</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-neutral-600">{url}</span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <p className="mt-1 text-xs text-neutral-400">Bookmark this to resume later — we&apos;ve also emailed it to you.</p>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F7F6F3] px-4 py-10 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center font-mono text-xs uppercase tracking-[0.2em] text-blue-600 sm:text-left">
          Gitwork · DevSignal
        </div>
        {children}
      </div>
    </div>
  );
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-7">
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-neutral-400">{eyebrow}</p>
      <h2 className="mb-4 font-serif text-2xl leading-tight tracking-[-0.01em] text-neutral-900 sm:text-3xl">{title}</h2>
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, noMargin }: { children: ReactNode; onClick: () => void; disabled?: boolean; noMargin?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${noMargin ? "" : "mt-6"} rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50`}
    >
      {children}
    </button>
  );
}

function ProgressBar({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  const pct = (idx / (STEPS.length - 1)) * 100;
  return (
    <div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
        <div className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 hidden justify-between sm:flex">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={`font-mono text-[10px] uppercase tracking-wider transition-colors ${
              i < idx ? "text-neutral-400" : i === idx ? "text-blue-600" : "text-neutral-300"
            }`}
          >
            {i < idx ? "✓ " : ""}
            {STEP_LABEL[s]}
          </span>
        ))}
      </div>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-neutral-400 sm:hidden">
        Step {idx + 1} of {STEPS.length} · {STEP_LABEL[current]}
      </p>
    </div>
  );
}
