"use client";

import { useEffect, useState } from "react";
import { DEFAULT_BOOKING_URL } from "@/server/pulse-embed-config";

/**
 * The "talk to us" link, resolved client-side.
 *
 * ⚠️ Exists so this page can stay STATIC. Reading the workspace's booking URL on the
 * server made the page prerender at build time against a database that is not there,
 * and the whole build failed — the class of error CLAUDE.md §40.3 notes only
 * `next build` catches, never `npm run verify`.
 *
 * It could have been solved by hardcoding `DEFAULT_BOOKING_URL`, but then changing
 * the booking link in Settings would move the widget's CTA and leave this one behind
 * — two CTAs on one page pointing at different places, which is precisely the kind of
 * quiet divergence this session has spent its time removing.
 *
 * So: render the default immediately (so the link always works, and works with no
 * JavaScript), then upgrade to the configured value from the same public endpoint the
 * widget already calls.
 */
export function BookingLink({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const [href, setHref] = useState(DEFAULT_BOOKING_URL);

  useEffect(() => {
    let alive = true;
    fetch("/api/public/pulse/config")
      .then((r) => r.json())
      .then((d) => {
        if (alive && typeof d?.bookingUrl === "string" && d.bookingUrl) setHref(d.bookingUrl);
      })
      .catch(() => {
        /* keep the default — a working link beats a correct one that isn't there */
      });
    return () => { alive = false; };
  }, []);

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={style}>
      {children}
    </a>
  );
}
