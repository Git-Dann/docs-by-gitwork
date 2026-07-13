"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicVetSession } from "@/types/devsignal";
import { ChallengeRunner } from "./challenge-runner";

type Step = "welcome" | "intake" | "connect" | "challenge" | "video" | "done";
const STEPS: Step[] = ["welcome", "intake", "connect", "challenge", "video", "done"];
const STEP_LABEL: Record<Step, string> = {
  welcome: "Welcome",
  intake: "About you",
  connect: "GitHub",
  challenge: "Challenge",
  video: "Video answer",
  done: "Done",
};

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

  if (loadError) {
    return <Shell><p className="text-sm text-red-600">This assessment link is invalid or has expired.</p></Shell>;
  }
  if (!session) {
    return <Shell><p className="text-sm text-neutral-500">Loading…</p></Shell>;
  }
  if (session.expired) {
    return <Shell><p className="text-sm text-red-600">This assessment link has expired. Please contact your Gitwork contact.</p></Shell>;
  }

  return (
    <Shell>
      <Stepper current={step} />
      <div className="mt-8">
        {step === "welcome" && (
          <Panel title={`Welcome, ${session.candidate.name}`} eyebrow="DevSignal assessment">
            <p className="text-sm leading-relaxed text-neutral-600">
              This short assessment helps us understand how you work. It has a few steps: a bit
              about you, your GitHub, a timed coding challenge, and a short recorded answer. You can
              use whatever tools you normally would — including AI. We care about how you think and
              deliver.
            </p>
            <PrimaryButton onClick={next}>Get started</PrimaryButton>
          </Panel>
        )}

        {step === "intake" && <IntakeStep token={token} session={session} onSaved={async () => { await refetch(); next(); }} />}

        {step === "connect" && <ConnectStep token={token} session={session} onSaved={async () => { await refetch(); next(); }} />}

        {step === "challenge" && (
          <Panel title="Coding challenge" eyebrow="Step 4">
            {session.challenge ? (
              <ChallengeRunner token={token} challenge={session.challenge} onDone={async () => { await refetch(); next(); }} />
            ) : (
              <p className="text-sm text-neutral-500">No challenge assigned. <button className="text-blue-600 underline" onClick={next}>Skip →</button></p>
            )}
          </Panel>
        )}

        {step === "video" && <VideoStep token={token} question={session.videoQuestion} onDone={async () => { await refetch(); next(); }} />}

        {step === "done" && (
          <Panel title="All done — thank you" eyebrow="Submitted">
            <p className="text-sm leading-relaxed text-neutral-600">
              Thanks, {session.candidate.name}. Your assessment is complete and with the Gitwork team
              for review. We&apos;ll be in touch about next steps.
            </p>
          </Panel>
        )}
      </div>

      {step !== "welcome" && step !== "done" && (
        <button onClick={() => go(STEPS[STEPS.indexOf(step) - 1])} className="mt-6 text-xs text-neutral-400 hover:text-neutral-600">
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
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!form.name.trim()) {
      setErr("Your name is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setErr("Enter a valid email address.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await sendJson(`/api/vet/${token}`, "PATCH", {
        ...form,
        yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : undefined,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
      setSaving(false);
    }
  };

  const field = (key: keyof typeof form, label: string, type = "text") => (
    <label className="block">
      <span className="mb-1 block font-mono text-xs uppercase tracking-wider text-neutral-500">{label}</span>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
    </label>
  );

  return (
    <Panel title="A bit about you" eyebrow="Step 2">
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
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      <PrimaryButton onClick={save} disabled={saving}>{saving ? "Saving…" : "Continue"}</PrimaryButton>
    </Panel>
  );
}

function ConnectStep({ token, session, onSaved }: { token: string; session: PublicVetSession; onSaved: () => void }) {
  const [handle, setHandle] = useState(session.candidate.githubHandle ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
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
    <Panel title="Connect your GitHub" eyebrow="Step 3">
      <p className="mb-4 text-sm leading-relaxed text-neutral-600">
        We analyse your public GitHub activity as part of the assessment. Enter your GitHub username.
      </p>
      <label className="block">
        <span className="mb-1 block font-mono text-xs uppercase tracking-wider text-neutral-500">GitHub username</span>
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="octocat"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </label>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      <PrimaryButton onClick={save} disabled={saving || !handle.trim()}>{saving ? "Saving…" : "Continue"}</PrimaryButton>
    </Panel>
  );
}

function VideoStep({ token, question, onDone }: { token: string; question: string; onDone: () => void }) {
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
        // FileReader (not btoa+spread) so large recordings don't overflow the stack.
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

  const submit = async () => {
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

  const canSubmit = Boolean(transcript.trim() || recorded);

  return (
    <Panel title="Your answer" eyebrow="Step 5">
      <p className="mb-4 rounded-md bg-blue-50 p-3 text-sm leading-relaxed text-neutral-700">{question}</p>
      <div className="mb-4 flex items-center gap-3">
        {!recording ? (
          <button onClick={startRecording} className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
            {recorded ? "Re-record" : "● Record audio"}
          </button>
        ) : (
          <button onClick={stopRecording} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white">■ Stop</button>
        )}
        {recorded && <span className="text-sm text-green-600">Recorded ✓</span>}
      </div>
      <label className="block">
        <span className="mb-1 block font-mono text-xs uppercase tracking-wider text-neutral-500">Or type your answer</span>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={6}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </label>
      <label className="mt-3 flex items-start gap-2 text-sm text-neutral-600">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        <span>I consent to Gitwork retaining a transcript of my answer for this assessment.</span>
      </label>
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
      <PrimaryButton onClick={submit} disabled={submitting || !canSubmit}>{submitting ? "Submitting…" : "Submit answer"}</PrimaryButton>
    </Panel>
  );
}

// ─── layout primitives ───────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F7F6F3] px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 font-mono text-xs uppercase tracking-[0.2em] text-blue-600">Gitwork · DevSignal</div>
        {children}
      </div>
    </div>
  );
}

function Panel({ title, eyebrow, children }: { title: string; eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="mb-1 font-mono text-xs uppercase tracking-wider text-neutral-400">{eyebrow}</p>
      <h2 className="mb-4 text-2xl font-semibold text-neutral-900">{title}</h2>
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="mt-6 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Stepper({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  return (
    <div className="flex flex-wrap gap-2">
      {STEPS.map((s, i) => (
        <div
          key={s}
          className={`font-mono text-[10px] uppercase tracking-wider ${
            i === idx ? "text-blue-600" : i < idx ? "text-neutral-400" : "text-neutral-300"
          }`}
        >
          {i < idx ? "✓ " : ""}
          {STEP_LABEL[s]}
          {i < STEPS.length - 1 && <span className="mx-1 text-neutral-300">·</span>}
        </div>
      ))}
    </div>
  );
}
