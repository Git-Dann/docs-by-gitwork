"use client";

/**
 * Public "Download PDF" control for the shared /docs/[token] view.
 *
 * A client who received a Foundry share link can download the document as a PDF straight from the
 * page — no login, no hunting for it inside the platform (the feedback this closes). It hits the
 * public, token-gated `GET /api/docs/[token]/pdf`, which renders the document with headless
 * Chromium server-side. That render is not instant (a few seconds, longer on a cold start), so we
 * fetch with a real loading state and download the returned blob rather than using a bare link
 * that would feel dead on click.
 */

import { useState } from "react";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";

export function DownloadPdfButton({ token, filename }: { token: string; filename?: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function handleDownload() {
    if (status === "loading") return;
    setStatus("loading");
    try {
      const response = await fetch(`/api/docs/${token}/pdf`);
      if (!response.ok) throw new Error(`PDF export failed (${response.status})`);
      const blob = await response.blob();

      // Prefer the server's Content-Disposition filename; fall back to the provided one.
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const name = match?.[1] || `${(filename ?? "document").replace(/[^\w.\-]+/g, "-")}.pdf`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setStatus("idle");
    } catch {
      setStatus("error");
      // Let the client retry — clear the error state after a moment.
      setTimeout(() => setStatus("idle"), 4000);
    }
  }

  const label =
    status === "loading"
      ? "Preparing PDF…"
      : status === "error"
        ? "Try again"
        : "Download PDF";

  return (
    <div className="fixed right-4 top-4 z-50 print:hidden sm:right-6 sm:top-6">
      <button
        type="button"
        onClick={handleDownload}
        disabled={status === "loading"}
        aria-label="Download this document as a PDF"
        className="app-button app-button-primary app-button-sm inline-flex items-center gap-2 shadow-[var(--shadow-md)] disabled:opacity-80"
      >
        {status === "loading" ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />
        )}
        {label}
      </button>
    </div>
  );
}
