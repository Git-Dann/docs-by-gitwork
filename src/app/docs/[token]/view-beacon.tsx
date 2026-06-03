/**
 * Public document engagement tracker for /docs/[token] (Phase 1).
 *
 * On mount it:
 *   1. Establishes a persistent first-party `visitorId` (localStorage) + a per-visit `sessionId`,
 *      and records the view via `/api/docs/[token]/view?v=&s=` (sendBeacon).
 *   2. Observes every `[data-doc-section]` block with an IntersectionObserver, accumulating how
 *      long each section is on-screen (dwell) and the deepest fraction seen (maxScrollPct), plus
 *      total visible time on the page.
 *   3. Flushes dwell DELTAS to `/api/docs/[token]/events` every 15s, on tab-hide, on pagehide,
 *      and on unmount — via sendBeacon so a closing tab still reports.
 *
 * All times use performance.now(); the page-visible timer pauses when the tab is hidden so a
 * backgrounded tab doesn't inflate dwell.
 */

"use client";

import { useEffect } from "react";

const VISITOR_KEY = "gw_doc_visitor";

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getVisitorId(): string {
  try {
    let v = localStorage.getItem(VISITOR_KEY);
    if (!v) {
      v = uuid();
      localStorage.setItem(VISITOR_KEY, v);
    }
    return v;
  } catch {
    return uuid();
  }
}

interface SectionState {
  title: string | null;
  visible: boolean;
  since: number | null; // performance.now() when it last became visible (null = paused)
  dwell: number; // accumulated ms on-screen
  flushed: number; // dwell already sent
  maxRatio: number; // deepest intersection ratio seen, 0-1
}

export function DocsTracker({ token }: { token: string }) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const visitorId = getVisitorId();
    const sessionId = uuid();
    const now = () => performance.now();

    // 1. Record the view.
    const viewUrl = `/api/docs/${token}/view?v=${encodeURIComponent(visitorId)}&s=${encodeURIComponent(sessionId)}`;
    try {
      if ("sendBeacon" in navigator) navigator.sendBeacon(viewUrl);
      else void fetch(viewUrl, { method: "POST", keepalive: true });
    } catch {
      void fetch(viewUrl, { method: "POST", keepalive: true });
    }

    // 2. Set up per-section + total-duration tracking.
    const sections = new Map<string, SectionState>();
    const nodeKey = new WeakMap<Element, string>();
    let totalSince: number | null = document.visibilityState === "visible" ? now() : null;
    let totalDwell = 0;

    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-doc-section]"));
    for (const el of els) {
      const key = el.getAttribute("data-doc-section") || "";
      if (!key) continue;
      if (!sections.has(key)) {
        sections.set(key, {
          title: el.getAttribute("data-doc-section-title"),
          visible: false,
          since: null,
          dwell: 0,
          flushed: 0,
          maxRatio: 0,
        });
      }
      nodeKey.set(el, key);
    }

    // Bank elapsed time into accumulators, re-anchoring anything still running to now.
    const accrue = () => {
      const t = now();
      sections.forEach((s) => {
        if (s.visible && s.since != null) {
          s.dwell += t - s.since;
          s.since = t;
        }
      });
      if (totalSince != null) {
        totalDwell += t - totalSince;
        totalSince = t;
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = nodeKey.get(entry.target);
          if (!key) continue;
          const s = sections.get(key);
          if (!s) continue;
          if (entry.intersectionRatio > s.maxRatio) s.maxRatio = entry.intersectionRatio;
          const visibleNow = entry.isIntersecting && entry.intersectionRatio > 0.05;
          if (visibleNow && !s.visible) {
            s.visible = true;
            s.since = totalSince != null ? now() : null; // only run the timer while the page is active
          } else if (!visibleNow && s.visible) {
            if (s.since != null) s.dwell += now() - s.since;
            s.visible = false;
            s.since = null;
          }
        }
      },
      { threshold: [0, 0.05, 0.25, 0.5, 0.75, 1] },
    );
    els.forEach((el) => io.observe(el));

    const flush = () => {
      accrue();
      const payloadSections: Array<{
        sectionKey: string;
        sectionTitle: string | null;
        dwellMs: number;
        maxScrollPct: number;
      }> = [];
      sections.forEach((s, key) => {
        const delta = s.dwell - s.flushed;
        if (delta <= 0 && s.maxRatio === 0) return;
        s.flushed = s.dwell;
        payloadSections.push({
          sectionKey: key,
          sectionTitle: s.title,
          dwellMs: Math.round(delta),
          maxScrollPct: Math.round(s.maxRatio * 100),
        });
      });
      const body = { sessionId, durationMs: Math.round(totalDwell), sections: payloadSections };
      if (payloadSections.length === 0 && body.durationMs === 0) return;
      const url = `/api/docs/${token}/events`;
      try {
        const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
        if ("sendBeacon" in navigator) {
          navigator.sendBeacon(url, blob);
          return;
        }
      } catch {
        /* fall through to fetch */
      }
      void fetch(url, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        accrue();
        sections.forEach((s) => {
          s.since = null;
        });
        totalSince = null;
        flush();
      } else {
        const t = now();
        totalSince = t;
        sections.forEach((s) => {
          if (s.visible) s.since = t;
        });
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    const interval = window.setInterval(flush, 15_000);

    return () => {
      flush();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      window.clearInterval(interval);
    };
  }, [token]);

  return null;
}

/** Back-compat alias — the public page previously imported DocsViewBeacon. */
export const DocsViewBeacon = DocsTracker;
