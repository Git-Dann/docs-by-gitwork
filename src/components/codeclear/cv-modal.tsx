/**
 * The dev CV preview + export.
 *
 * ⚠️ The preview is an iframe fed the SAME HTML the PDF is printed from, via
 * `srcDoc`. There is no second renderer and no app-CSS approximation of the
 * document, so what the operator approves here is byte-identical to the file they
 * hand to a client. That is the whole reason the CV carries its own stylesheet and
 * its own base64 fonts rather than borrowing the app's.
 *
 * The page is a fixed 1000 x 1414 box that must not reflow, so the iframe is that
 * size and scaled with a transform rather than being allowed to shrink.
 */

"use client";

import { useEffect, useState } from "react";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

const PAGE_W = 1000;
const PAGE_H = 1414;

/**
 * Scaled so the WHOLE page is visible inside `app-dialog-fixed`'s 680px panel
 * (36px header + ~52px footer + 40px padding leaves ~552px of body; 552 / 1414 =
 * 0.39). At the first cut's 0.58 the preview was 820px tall and had to be
 * scrolled, which for a one-page document defeats the point of previewing it —
 * the one thing you are checking is whether it fits on one page.
 */
const PREVIEW_SCALE = 0.38;

function parseHeader(res: Response, name: string): string[] {
  const raw = res.headers.get(name);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function CvModal({
  open,
  onClose,
  candidateId,
  candidateName,
}: {
  open: boolean;
  onClose: () => void;
  candidateId: string;
  candidateName: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [omitted, setOmitted] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setHtml(null);
    setError(null);
    fetch(`/api/codeclear/candidates/${candidateId}/cv`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not build the CV (${res.status}).`);
        const body = await res.text();
        if (cancelled) return;
        setOmitted(parseHeader(res, "X-Cv-Omitted"));
        setMissing(parseHeader(res, "X-Cv-Missing"));
        setHtml(body);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not build the CV.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, candidateId]);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/codeclear/candidates/${candidateId}/cv?format=pdf`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`The PDF export failed (${res.status}).`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${candidateName.replace(/\s+/g, "-").toLowerCase()}-cv.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "The PDF export failed.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`01 // CV · ${candidateName}`}
      panelClassName="app-dialog-fixed w-full max-w-3xl"
    >
      {/* min-h-0 is load-bearing: without it a flex child's automatic minimum
          size is its content, the preview refuses to shrink and the footer is
          pushed out of the pinned panel. */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-1)] p-5">
        {error ? (
          <p className="rounded-[8px] border border-[var(--danger-500)] bg-[var(--danger-50)] px-3 py-2 text-[13px] text-[var(--danger-500)]">
            {error}
          </p>
        ) : null}

        {html ? (
          // The page does not reflow, so it is rendered at its true size and
          // scaled. The wrapper carries the scaled height so the scroller knows
          // how much there is; a transform alone does not change layout size.
          <div
            className="mx-auto overflow-hidden rounded-[8px] border border-[var(--border-2)]"
            style={{ width: PAGE_W * PREVIEW_SCALE, height: PAGE_H * PREVIEW_SCALE }}
          >
            <iframe
              title={`${candidateName} CV preview`}
              srcDoc={html}
              // The document is ours and carries no script, but it is built from
              // profile text someone typed, so the frame is sandboxed to nothing.
              sandbox=""
              style={{
                width: PAGE_W,
                height: PAGE_H,
                border: 0,
                transform: `scale(${PREVIEW_SCALE})`,
                transformOrigin: "top left",
              }}
            />
          </div>
        ) : !error ? (
          <div
            className="mx-auto animate-pulse rounded-[8px] bg-[var(--surface-2)]"
            style={{ width: PAGE_W * PREVIEW_SCALE, height: PAGE_H * PREVIEW_SCALE }}
          />
        ) : null}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--border-2)] px-5 py-3">
        {/* The notice lives HERE, not above the preview. Sitting in the scroll
            region it pushed the page down behind this footer, so the bottom of
            the CV was cut — and the preview exists precisely to show you the
            whole page. The footer already had a line of standing text, so the
            notice replaces it rather than adding height. */}
        <p className="min-w-0 flex-1 text-[12px] leading-4 text-[var(--text-4)]">
          {missing.length > 0 || omitted.length > 0 ? (
            <>
              {omitted.length > 0 ? (
                <span className="text-[var(--text-3)]">
                  Trimmed to one page, leaving off {omitted.join(", ")}.{" "}
                </span>
              ) : null}
              {missing.length > 0 ? (
                <span>Nothing recorded for {missing.join(", ")} — add it on the profile.</span>
              ) : null}
            </>
          ) : (
            "One page, Gitwork Document System. Client names, rates, scores and pipeline state are never included."
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={download}
            disabled={!html || downloading}
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            {downloading ? "Building…" : "Download PDF"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
