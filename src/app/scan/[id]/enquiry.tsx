"use client";

import { useCallback, useState } from "react";
import { TurnstileBox } from "@/components/pulse/turnstile-box";
import { CaptureFields, EMPTY_CAPTURE, captureComplete, unlockCopy, type CaptureValues } from "@/components/pulse/capture-fields";

const SERIF = "var(--font-fraunces), 'Fraunces', Georgia, serif";

/**
 * The conversion point on the public result page.
 *
 * The only client component on this page — everything above it is server-rendered
 * so the score and findings are readable with no JavaScript at all. This is
 * interactive by necessity, not by default.
 *
 * It posts to /api/public/pulse/scan/[id]/enquiry, which records a warm lead and
 * deliberately runs nothing expensive: an anonymous caller must never be able to
 * spend AI tokens.
 */
export function ScanEnquiry({
  scanId,
  alreadyEnquired,
  lockedCount,
  measured,
  bookingUrl,
  targetHost,
  turnstileSiteKey,
}: {
  scanId: string;
  alreadyEnquired: boolean;
  lockedCount: number;
  /** Checks that ran on this site, for the unlock card's "all N checks". */
  measured: number;
  bookingUrl: string;
  targetHost: string;
  turnstileSiteKey: string | null;
}) {
  const [capture, setCapture] = useState<CaptureValues>(EMPTY_CAPTURE);
  const [honeypot, setHoneypot] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(alreadyEnquired);
  const [error, setError] = useState<string | null>(null);
  // Its OWN token. A Turnstile token is single-use, so this cannot reuse one that
  // another request already redeemed — see TurnstileBox.
  const [token, setToken] = useState<string | null>(null);

  const send = useCallback(async () => {
    if (!captureComplete(capture) || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/pulse/scan/${scanId}/enquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: capture.name.trim(),
          business: capture.business.trim(),
          email: capture.email.trim(),
          termsAccepted: capture.termsAccepted,
          honeypot,
          turnstileToken: token,
        }),
      });
      let data: { error?: string } = {};
      try {
        data = await res.json();
      } catch {
        // Never let a raw parse error from a gateway page reach a visitor.
        throw new Error("Couldn't send that just now. Please try again.");
      }
      if (!res.ok) {
        throw new Error(
          res.status === 409
            ? "This email has already unlocked a report — we'll be in touch."
            : data?.error ?? "Couldn't send that just now. Please try again.",
        );
      }
      setSent(true);
      // Unlocking is decided on the server — re-render the page so the held-back
      // findings appear in full.
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }, [capture, scanId, sending, honeypot, token]);

  // Don't let a click through before Turnstile has produced a token: submitting
  // without one always fails server-side, which reads as a broken form rather than
  // "still checking you're human".
  const awaitingVerification = Boolean(turnstileSiteKey) && !token;

  if (sent) {
    return (
      <div>
        <p style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 700, color: "white", margin: "0 0 6px" }}>
          {alreadyEnquired ? "This report is unlocked." : "Unlocked. Your full report will be in your inbox in a few minutes."}
        </p>
        <p style={{ fontSize: 14, color: "#9ca3af", margin: "0 0 16px", lineHeight: 1.6 }}>
          Every finding for {targetHost} is shown above, and we&apos;ve emailed you the full report. Want
          help fixing it? Grab a slot.
        </p>
        <a
          href={bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "inline-block", background: "white", color: "#111827", fontSize: 14, fontWeight: 700, padding: "11px 22px", borderRadius: 10, textDecoration: "none" }}
        >
          Book a call →
        </a>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 700, color: "white", margin: "0 0 8px" }}>
        {unlockCopy(lockedCount, measured).heading}
      </p>
      <p style={{ fontSize: 14, color: "#9ca3af", margin: "0 0 18px", lineHeight: 1.6 }}>
        {unlockCopy(lockedCount, measured).body}
      </p>
      <CaptureFields
        values={capture}
        onChange={setCapture}
        onSubmit={send}
        disabled={sending}
        idPrefix="scan-capture"
        describedBy={error ? "scan-enquiry-error" : undefined}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {/* Off-screen honeypot — real visitors never fill it. */}
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !captureComplete(capture) || awaitingVerification}
          style={{
            flex: "0 0 auto",
            padding: "12px 22px",
            borderRadius: 10,
            border: "none",
            background: sending || !captureComplete(capture) || awaitingVerification ? "rgba(255,255,255,0.35)" : "white",
            color: "#111827",
            fontSize: 14,
            fontWeight: 700,
            cursor: sending || !captureComplete(capture) || awaitingVerification ? "default" : "pointer",
          }}
        >
          {sending ? "Sending…" : awaitingVerification ? "Verifying…" : lockedCount > 0 ? "Unlock the full report" : "Email me the full report"}
        </button>
      </div>
      <TurnstileBox siteKey={turnstileSiteKey} onToken={setToken} theme="dark" style={{ marginTop: 10 }} />
      {error && (
        <p id="scan-enquiry-error" role="alert" style={{ marginTop: 10, marginBottom: 0, fontSize: 13, color: "#fca5a5" }}>
          {error}
        </p>
      )}
      <p style={{ fontSize: 12.5, color: "#6b7280", margin: "12px 0 0" }}>
        Or{" "}
        <a href={bookingUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#d1d5db", textDecoration: "underline" }}>
          book a call
        </a>{" "}
        and we&apos;ll walk through it with you.
      </p>
    </div>
  );
}
