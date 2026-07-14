"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicVetSession } from "@/types/devsignal";
import { ChallengeRunner } from "./challenge-runner";
import {
  BrandButton,
  BrandField,
  BrandLinkButton,
  BrandCard,
  FadeIn,
  Lede,
  OnboardingShell,
  ProgressBar,
  brandInputClass,
} from "@/components/onboarding/brand";
import {
  CONSENT_ITEMS,
  DATA_HANDLING_POINTS,
  DATA_REQUEST_LABELS,
  DATA_CONTACT_EMAIL,
  EXPLANATION_STAGES,
  type DataRequestType,
} from "@/lib/devsignal/processing-notice";

type Step = "welcome" | "consent" | "intake" | "connect" | "challenge" | "video" | "identity" | "done";
const STEPS: Step[] = ["welcome", "consent", "intake", "connect", "challenge", "video", "identity", "done"];
const STEP_LABEL: Record<Step, string> = {
  welcome: "Welcome",
  consent: "Consent",
  intake: "About you",
  connect: "GitHub",
  challenge: "Challenge",
  video: "Intro",
  identity: "Identity",
  done: "Done",
};
const LABELS = STEPS.map((s) => STEP_LABEL[s]);

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
    return (
      <OnboardingShell meta="Assessment">
        <BrandCard eyebrow="DevSignal" title="Link not found.">
          <Lede>This assessment link is invalid or has expired. Please contact your Gitwork contact.</Lede>
        </BrandCard>
      </OnboardingShell>
    );
  }
  if (!session) {
    return (
      <OnboardingShell meta="Assessment">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#6B6B6B]">Loading…</p>
      </OnboardingShell>
    );
  }
  if (session.expired) {
    return (
      <OnboardingShell meta="Assessment">
        <BrandCard eyebrow="DevSignal" title="Link expired.">
          <Lede>This assessment link has expired. Please contact your Gitwork contact for a fresh one.</Lede>
        </BrandCard>
      </OnboardingShell>
    );
  }

  const idx = STEPS.indexOf(step);

  return (
    <OnboardingShell meta={`Step ${idx + 1} of ${STEPS.length}`}>
      <ProgressBar labels={LABELS} current={idx} />
      <FadeIn key={step}>
        {step === "welcome" && (
          <BrandCard eyebrow="DevSignal · Developer assessment" title={`Welcome, ${session.candidate.name}.`}>
            <Lede>
              This short assessment helps us understand how you actually work — a bit about you, your
              GitHub, a timed coding challenge, and a quick intro. Use whatever tools you normally
              would, <span className="font-medium text-[#1A1A1E]">including AI</span>. It takes about
              30–40 minutes and you can pause and come back any time.
            </Lede>
            <ResumeNote />
            <div className="mt-6">
              <BrandButton onClick={next}>Get started →</BrandButton>
            </div>
          </BrandCard>
        )}

        {step === "consent" && <ConsentStep token={token} session={session} onSaved={advance} />}
        {step === "intake" && <IntakeStep token={token} session={session} onSaved={advance} />}
        {step === "connect" && <ConnectStep token={token} session={session} onSaved={advance} />}

        {step === "challenge" && (
          <BrandCard eyebrow="Step 3 · Timed coding challenge" title="Coding challenge">
            {session.challenge ? (
              <ChallengeRunner token={token} challenge={session.challenge} onDone={advance} />
            ) : (
              <>
                <Lede>No challenge assigned for this assessment.</Lede>
                <div className="mt-6"><BrandButton onClick={next}>Continue →</BrandButton></div>
              </>
            )}
          </BrandCard>
        )}

        {step === "video" && <VideoStep token={token} question={session.videoQuestion} onDone={advance} onSkip={next} />}
        {step === "identity" && <IdentityStep token={token} onDone={advance} onSkip={next} />}

        {step === "done" && (
          <BrandCard eyebrow="Submitted" title="All done — thank you.">
            <Lede>
              Thanks, {session.candidate.name}. Your assessment is complete and with the Gitwork team
              for review. A person — not a machine — makes the final call. We&apos;ll be in touch about
              next steps, and we&apos;ve emailed you a copy of your link.
            </Lede>
            <DataRightsFooter token={token} />
          </BrandCard>
        )}
      </FadeIn>

      {step !== "welcome" && step !== "done" && (
        <div className="mt-6">
          <BrandLinkButton onClick={() => go(STEPS[STEPS.indexOf(step) - 1])}>← Back</BrandLinkButton>
        </div>
      )}
    </OnboardingShell>
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
    const nextErr: Record<string, string> = {};
    if (!form.name.trim()) nextErr.name = "Your name is required.";
    if (!EMAIL_RE.test(form.email.trim())) nextErr.email = "Enter a valid email address.";
    if (form.yearsExperience && Number(form.yearsExperience) < 0) nextErr.yearsExperience = "Can't be negative.";
    setErrors(nextErr);
    if (Object.keys(nextErr).length > 0) return;

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
    <BrandField label={label} error={errors[key]}>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => {
          setForm({ ...form, [key]: e.target.value });
          if (errors[key]) setErrors((p) => ({ ...p, [key]: "" }));
        }}
        className={brandInputClass(errors[key])}
      />
    </BrandField>
  );

  return (
    <BrandCard eyebrow="Step 1 · About you" title="A bit about you.">
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
      {errors._ && <p className="mt-3 text-sm text-[#d14343]">{errors._}</p>}
      <div className="mt-6"><BrandButton onClick={save} disabled={saving}>{saving ? "Saving…" : "Continue →"}</BrandButton></div>
    </BrandCard>
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
    <BrandCard eyebrow="Step 2 · GitHub" title="Connect your GitHub.">
      <Lede>
        We analyse your public GitHub activity as part of the assessment. Enter your GitHub username —
        we&apos;ll check it resolves to a real account.
      </Lede>
      <div className="mt-5">
        <BrandField label="GitHub username" error={err ?? undefined}>
          <div className="flex items-center rounded-lg border border-[rgba(12,12,24,0.16)] bg-[#FBFAF7] focus-within:border-[#6B52FF] focus-within:ring-2 focus-within:ring-[#6B52FF]/15">
            <span className="pl-3.5 text-sm text-[#9a978f]">github.com/</span>
            <input
              value={handle}
              onChange={(e) => {
                setHandle(e.target.value);
                if (err) setErr(null);
              }}
              placeholder="octocat"
              className="flex-1 bg-transparent px-1 py-2.5 text-sm text-[#1A1A1E] focus:outline-none"
            />
          </div>
        </BrandField>
      </div>
      <div className="mt-6"><BrandButton onClick={save} disabled={saving || !handle.trim()}>{saving ? "Checking…" : "Continue →"}</BrandButton></div>
    </BrandCard>
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
    <BrandCard eyebrow="Step 4 · Intro" title="A quick intro.">
      <p className="rounded-lg border-l-2 border-[#6B52FF] bg-[#EAE5DC] px-4 py-3 text-sm leading-relaxed text-[#46464C]">{question}</p>
      <div className="mt-4 flex items-center gap-3">
        {!recording ? (
          <BrandButton variant="ghost" onClick={startRecording}>{recorded ? "Re-record" : "● Record audio"}</BrandButton>
        ) : (
          <button onClick={stopRecording} className="inline-flex items-center gap-2 rounded-full bg-[#d14343] px-5 py-2.5 text-sm font-medium text-white">■ Stop</button>
        )}
        {recorded && <span className="text-sm text-[#3f8f5b]">Recorded ✓</span>}
      </div>
      <div className="mt-4">
        <BrandField label="Or type your answer">
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={6} className={brandInputClass()} />
        </BrandField>
      </div>
      {!recorded && transcript.trim().length > 0 && !typedLongEnough && (
        <p className="mt-1 font-mono text-[11px] text-[#9a978f]">{transcript.trim().length}/{MIN_ANSWER_CHARS} characters</p>
      )}
      <label className="mt-3 flex items-start gap-2 text-sm text-[#46464C]">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[#6B52FF]" />
        <span>I consent to Gitwork retaining a transcript of my answer for this assessment.</span>
      </label>
      {err && <p className="mt-3 text-sm text-[#d14343]">{err}</p>}
      <div className="mt-6 flex items-center gap-4">
        <BrandButton onClick={submit} disabled={submitting || !canSubmit}>{submitting ? "Submitting…" : "Submit answer →"}</BrandButton>
        <BrandLinkButton onClick={onSkip}>Skip for now</BrandLinkButton>
      </div>
    </BrandCard>
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
    <BrandCard eyebrow="Step 5 · Identity" title="Verify your identity.">
      <Lede>
        A quick identity check confirms the person assessed is the person placed. We never store your
        ID documents — only a pass/fail from the verification provider.
      </Lede>
      {err && <p className="mt-3 text-sm text-[#d14343]">{err}</p>}
      <div className="mt-6 flex items-center gap-4">
        <BrandButton onClick={verify} disabled={busy}>{busy ? "Starting…" : "Verify identity →"}</BrandButton>
        <BrandLinkButton onClick={onSkip}>Skip for now</BrandLinkButton>
      </div>
    </BrandCard>
  );
}

// ─── consent (GDPR) ───────────────────────────────────────────────────────────

function ConsentStep({ token, session, onSaved }: { token: string; session: PublicVetSession; onSaved: () => void }) {
  const [checks, setChecks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CONSENT_ITEMS.map((c) => [c.key, session.consentGiven])),
  );
  const [showHow, setShowHow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const allRequired = CONSENT_ITEMS.every((c) => !c.required || checks[c.key]);

  const save = async () => {
    if (!allRequired) {
      setErr("Please tick both boxes to continue.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await sendJson(`/api/vet/${token}/consent`, "POST", { processing: true, humanReview: true });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
      setSaving(false);
    }
  };

  return (
    <BrandCard eyebrow="Before we begin · Your data" title="How this works, and your consent.">
      <Lede>
        We want to be straight with you about what happens with your information. Please read this and,
        if you&apos;re happy, give your consent to continue.
      </Lede>

      <button
        type="button"
        onClick={() => setShowHow((s) => !s)}
        className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#6B52FF] hover:underline"
      >
        {showHow ? "Hide" : "How you're assessed ↓"}
      </button>
      {showHow && (
        <ol className="mt-3 space-y-2 border-l-2 border-[#6B52FF] pl-4">
          {EXPLANATION_STAGES.map((s) => (
            <li key={s.title}>
              <p className="text-sm font-medium text-[#1A1A1E]">
                {s.title}{" "}
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#9a978f]">
                  {s.automated ? "automated" : "human"}
                </span>
              </p>
              <p className="text-sm leading-relaxed text-[#46464C]">{s.measures}</p>
            </li>
          ))}
        </ol>
      )}

      <ul className="mt-4 space-y-1.5">
        {DATA_HANDLING_POINTS.map((p) => (
          <li key={p} className="flex gap-2 text-sm leading-relaxed text-[#46464C]">
            <span className="text-[#6B52FF]">•</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 space-y-3">
        {CONSENT_ITEMS.map((item) => (
          <label key={item.key} className="flex items-start gap-2.5 text-sm leading-relaxed text-[#46464C]">
            <input
              type="checkbox"
              checked={Boolean(checks[item.key])}
              onChange={(e) => {
                setChecks((p) => ({ ...p, [item.key]: e.target.checked }));
                if (err) setErr(null);
              }}
              className="mt-0.5 accent-[#6B52FF]"
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>

      {err && <p className="mt-3 text-sm text-[#d14343]">{err}</p>}
      <div className="mt-6">
        <BrandButton onClick={save} disabled={saving || !allRequired}>
          {saving ? "Saving…" : "I consent — continue →"}
        </BrandButton>
      </div>
    </BrandCard>
  );
}

// ─── data rights (explanation / appeal / erasure) ────────────────────────────

function DataRightsFooter({ token }: { token: string }) {
  const [open, setOpen] = useState<DataRequestType | null>(null);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState<DataRequestType | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!open) return;
    setBusy(true);
    try {
      await sendJson(`/api/vet/${token}/request`, "POST", { type: open, message: message.trim() || undefined });
      setSent(open);
      setOpen(null);
      setMessage("");
    } catch {
      // best-effort; keep the panel open on failure
    } finally {
      setBusy(false);
    }
  };

  const types: DataRequestType[] = ["EXPLANATION", "APPEAL", "ERASURE"];

  return (
    <div className="mt-6 border-t border-[rgba(12,12,24,0.1)] pt-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6B6B6B]">Your rights</p>
      <p className="mt-1.5 text-sm leading-relaxed text-[#46464C]">
        You can ask us to explain your assessment, appeal for a person to re-review it, or delete your
        data. We&apos;ll confirm by email ({DATA_CONTACT_EMAIL}).
      </p>
      {sent ? (
        <p className="mt-3 text-sm text-[#3f8f5b]">
          Request sent — “{DATA_REQUEST_LABELS[sent]}”. We&apos;ll be in touch.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setOpen((o) => (o === t ? null : t))}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                open === t
                  ? "border-[#6B52FF] bg-[#6B52FF] text-white"
                  : "border-[rgba(12,12,24,0.2)] bg-[#FFFFFF] text-[#1A1A1E] hover:bg-[rgba(12,12,24,0.04)]"
              }`}
            >
              {DATA_REQUEST_LABELS[t]}
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="mt-3">
          <BrandField label="Anything you'd like to add? (optional)">
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className={brandInputClass()} />
          </BrandField>
          <div className="mt-3">
            <BrandButton onClick={submit} disabled={busy}>
              {busy ? "Sending…" : "Send request"}
            </BrandButton>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── resume note ────────────────────────────────────────────────────────────

function ResumeNote() {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? window.location.href : "";
  return (
    <div className="mt-5 rounded-lg border border-[rgba(12,12,24,0.1)] bg-[#EAE5DC] p-3.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6B6B6B]">Save your place</p>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-[#46464C]">{url}</span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 rounded-full border border-[rgba(12,12,24,0.2)] bg-[#FFFFFF] px-3 py-1 text-xs font-medium text-[#1A1A1E] transition hover:bg-[rgba(12,12,24,0.04)]"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-[#6B6B6B]">Bookmark this to resume later — we&apos;ve also emailed it to you.</p>
    </div>
  );
}
