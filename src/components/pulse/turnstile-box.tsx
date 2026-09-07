"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void; theme?: "light" | "dark" | "auto" },
      ) => string;
      reset?: (widgetId?: string) => void;
    };
  }
}

/**
 * A self-contained Cloudflare Turnstile widget that reports its own token.
 *
 * ⚠️ Exists because **a Turnstile token is single-use**. Cloudflare's siteverify
 * rejects a token that has already been redeemed (`timeout-or-duplicate`), so an
 * unauthenticated endpoint protected by Turnstile needs its OWN fresh token — it
 * cannot borrow one that a previous request already spent.
 *
 * That bug was live before this component existed: the enquiry endpoint requires a
 * valid token, the public result page rendered no widget at all, and the embed
 * widget re-sent the token its scan had already consumed. Turnstile IS enabled in
 * production, so every "Get the in-depth review" submission would have failed with
 * "Verification failed" — the entire conversion path, silently dead.
 *
 * Renders nothing when no site key is configured (local dev), which matches
 * `assertValidTurnstileToken`'s fail-open behaviour on a missing secret.
 */
export function TurnstileBox({
  siteKey,
  onToken,
  theme = "auto",
  className,
  style,
}: {
  siteKey: string | null;
  onToken: (token: string | null) => void;
  theme?: "light" | "dark" | "auto";
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const rendered = useRef(false);

  useEffect(() => {
    if (!ready || !siteKey || !window.turnstile || rendered.current) return;
    const el = ref.current;
    if (!el || el.hasChildNodes()) return;
    rendered.current = true;
    window.turnstile.render(el, {
      sitekey: siteKey,
      theme,
      callback: (token) => onToken(token),
      // An expired token is worse than no token: it fails verification while the UI
      // still believes it is ready to submit.
      "expired-callback": () => onToken(null),
    });
    // onToken is a stable callback in both call sites; re-rendering the widget on
    // every parent render would spawn duplicates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, siteKey, theme]);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
        onReady={() => setReady(true)}
      />
      <div ref={ref} className={className} style={style} />
    </>
  );
}
