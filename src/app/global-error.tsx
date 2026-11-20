"use client";

/**
 * Shown only when the root layout itself fails, so nothing from it (styles, fonts, providers)
 * can be relied on: plain inline styles, light, one sentence and a way to try again. The error
 * is reported to the server's logs and the ops webhook by `onRequestError` (instrumentation.ts).
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#FAFAF9", color: "#0F172A", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 480, margin: "20vh auto", padding: "0 16px" }}>
          <p style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#475569" }}>Foundry</p>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: "8px 0 12px" }}>Something went wrong loading this page.</h1>
          <p style={{ fontSize: 15, lineHeight: 1.5, color: "#334155" }}>
            We&apos;ve been told about it. Try again, and if it keeps happening, come back in a few minutes.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 16, padding: "10px 16px", fontSize: 15, borderRadius: 6, border: 0, background: "#1D4ED8", color: "#fff", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
