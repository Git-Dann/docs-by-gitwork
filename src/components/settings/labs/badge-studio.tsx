/**
 * Badge studio — pick a mark, configure it, copy the snippet that installs it.
 *
 * Reached from Settings → Labs, and deliberately a modal rather than a route:
 * Labs is Super-Admin-gated in the settings shell, and `/app/settings/**` is in
 * `UNGATED_APP_PREFIXES`, so a route here would be reachable by any signed-in
 * member. Keeping it in the panel means it inherits the gate it should have.
 *
 * Layout is the house "list + inspector" popup from DESIGN.md § Grid & Container
 * — fixed body height so the dialog never resizes as you click through marks.
 *
 * Every preview is the REAL artefact: the Foundry Approved marks are the
 * committed files under /badge, and a Pulse badge with a scan selected is the
 * live /api/badge/pulse/[token] endpoint. What you see is what the client's site
 * will fetch. The only synthetic thing is the Pulse *sample* shown before a scan
 * is picked, which is labelled as such.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  ArrowPathIcon,
  CheckIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";

import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useCountermarks } from "@/hooks/use-assay";
import { usePulseScans, useSharePulseScan } from "@/hooks/use-pulse";
import {
  APPROVED_BADGES,
  COUNTERMARK_BADGES,
  PULSE_BADGES,
  approvedPath,
  countermarkPath,
  pulsePath,
} from "@/lib/badge/catalog";
import { cn } from "@/lib/format";

const SAMPLE_SCORE = 92;

type Ground = "light" | "dark";

function Seg<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="widget-data-label text-[var(--text-4)]">{label}</span>
      <div className="flex overflow-hidden rounded-md border border-[var(--border-2)]">
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "px-2.5 py-1 text-[12px] font-medium transition-colors",
              i > 0 && "border-l border-[var(--border-2)]",
              value === o.value
                ? "bg-[var(--surface-brand)] text-[var(--brand-800)]"
                : "text-[var(--text-3)] hover:text-[var(--text-1)]",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BadgeStudio({
  open,
  onClose,
  initialCode = APPROVED_BADGES[0].code,
}: {
  open: boolean;
  onClose: () => void;
  /** Which mark to select on open — lets a caller deep-link to one. */
  initialCode?: string;
}) {
  const [code, setCode] = useState(initialCode);
  const [ground, setGround] = useState<Ground>("light");
  const [motion, setMotion] = useState(false);
  const [scanId, setScanId] = useState<string>("");
  const [markId, setMarkId] = useState<string>("");
  const [replay, setReplay] = useState(0);
  const [copied, setCopied] = useState(false);
  const [sample, setSample] = useState<string | null>(null);

  const { success, error } = useToast();
  const share = useSharePulseScan();
  const badge = useMemo(
    () => [...APPROVED_BADGES, ...PULSE_BADGES, ...COUNTERMARK_BADGES].find((b) => b.code === code)!,
    [code],
  );
  const isPulse = badge.family === "pulse";
  const isCm = badge.family === "countermark";
  /** Both live families render from a public token, so neither can be installed
   *  until its subject has actually been published. */
  const needsToken = isPulse || isCm;

  // Only completed scans can be shared, so they are the only ones that can carry
  // a badge at all.
  const { data } = usePulseScans();
  const candidates = useMemo(
    () => (data?.scans ?? []).filter((s) => s.status === "COMPLETED" && s.healthScore !== null),
    [data],
  );
  const scan = candidates.find((s) => s.id === scanId) ?? null;

  // Countermarks are already public the moment they are struck — there is no
  // share step, so the picker is just a list.
  const { data: assay } = useCountermarks(open && isCm);
  const marks = assay?.countermarks ?? [];
  const mark = marks.find((m) => m.id === markId) ?? null;

  // Origin is read on the client so the snippet is paste-ready from whichever host
  // the studio is open on, rather than hard-coding production.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  /**
   * The Pulse sample shown before a scan is picked. Loaded on demand — the glyph
   * table is ~15KB and nothing else in Settings needs it, so a static import
   * would put it in the settings bundle for everyone.
   */
  useEffect(() => {
    const subject = isPulse ? scan : isCm ? mark : null;
    if (!open || !needsToken || subject) {
      setSample(null);
      return;
    }
    let alive = true;
    const loader = isPulse
      ? import("@/lib/badge/pulse-badge").then((m) =>
          m.renderPulseBadge({
            score: SAMPLE_SCORE,
            style: badge.style,
            theme: ground,
            motion,
            project: "example.com",
            bars: [
              { label: "SECURITY", value: 0.94 },
              { label: "PERFORMANCE", value: 0.81 },
              { label: "SEO & PRESENCE", value: 0.9 },
              { label: "CODE QUALITY", value: 0.72 },
            ],
          }).svg,
        )
      : import("@/lib/badge/countermark-badge").then((m) =>
          m.renderCountermarkBadge({
            grade: "CERTIFIED",
            status: "VALID",
            daysRemaining: 62,
            validityDays: 90,
            sealed: true,
            subject: "example.com",
            standard: "SAS-1 v1.0",
            style: badge.cmStyle,
            theme: ground,
            motion,
          }).svg,
        );
    void loader.then((svg) => {
      if (alive) setSample(svg);
    });
    return () => {
      alive = false;
    };
  }, [open, isPulse, isCm, needsToken, scan, mark, badge.style, badge.cmStyle, ground, motion, replay]);

  const bust = (path: string) =>
    motion ? `${path}${path.includes("?") ? "&" : "?"}r=${replay}` : path;
  const src = isPulse
    ? scan?.shareToken
      ? bust(pulsePath(badge, scan.shareToken, { dark: ground === "dark", motion }))
      : null
    : isCm
      ? mark
        ? bust(countermarkPath(badge, mark.token, { dark: ground === "dark", motion }))
        : null
      : bust(approvedPath(badge, { dark: ground === "dark", motion }));

  const snippet = useMemo(() => {
    if (!origin) return "";
    const size = badge.width ? ` width="${badge.width}" height="${badge.height}"` : "";
    if (!isPulse) {
      const path = approvedPath(badge, { dark: ground === "dark", motion });
      return `<img src="${origin}${path}"${size} alt="Foundry Approved">`;
    }
    if (isCm) {
      if (!mark) return "";
      const path = countermarkPath(badge, mark.token, { dark: ground === "dark", motion });
      return [
        `<a href="${origin}/countermark/${mark.token}">`,
        `  <img src="${origin}${path}"${size} alt="Gitwork Countermark">`,
        `</a>`,
      ].join("\n");
    }
    if (!scan?.shareToken) return "";
    const path = pulsePath(badge, scan.shareToken, { dark: ground === "dark", motion });
    // Linked to the report by default: a score with nothing to check is a claim.
    return [
      `<a href="${origin}/report/${scan.shareToken}">`,
      `  <img src="${origin}${path}"${size} alt="Gitwork Pulse score">`,
      `</a>`,
    ].join("\n");
  }, [origin, badge, isPulse, isCm, ground, motion, scan, mark]);

  const copy = useCallback(async () => {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      error("Couldn't copy — select the snippet and copy manually");
    }
  }, [snippet, error]);

  const onShare = async () => {
    if (!scanId) return;
    try {
      await share.mutateAsync(scanId);
      success("Report shared — the badge is live");
    } catch {
      error("Couldn't share that scan");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Badge studio" panelClassName="w-full max-w-4xl">
      {/* Taller than the stock 460px popup body: this panel carries a preview,
          two control rows and the install snippet, and at 460px the guidance
          line under the controls was cut mid-sentence with INSTALL squeezed
          against the bottom. Scales with the viewport but is capped so it can't
          run off a short laptop screen — 78vh gives ~700px at 900px tall and
          still fits a 620px viewport. */}
      <div className="grid h-[min(78vh,700px)] grid-cols-[minmax(0,240px)_minmax(0,1fr)] divide-x divide-[var(--border-2)]">
        {/* Left — the catalogue. Codes are permanent; call badges by them. */}
        <div className="overflow-y-auto p-2 [scrollbar-gutter:stable]">
          {[
            { label: "Foundry Approved", items: APPROVED_BADGES },
            { label: "Pulse score", items: PULSE_BADGES },
            { label: "Countermark", items: COUNTERMARK_BADGES },
          ].map((group) => (
            <div key={group.label} className="mb-2">
              <p className="widget-data-label px-2 py-2 text-[var(--text-4)]">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map((b) => (
                  <li key={b.code}>
                    <button
                      type="button"
                      onClick={() => setCode(b.code)}
                      className={cn(
                        "flex w-full items-baseline gap-2 rounded-md px-2 py-2 text-left transition-colors",
                        b.code === code
                          ? "border border-[var(--brand-300)] bg-[var(--surface-brand)] text-[var(--brand-800)]"
                          : "border border-transparent text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                      )}
                    >
                      <span className="widget-data-label shrink-0 opacity-70">{b.code}</span>
                      <span className="min-w-0 truncate text-[13px] font-medium">{b.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Right — inspector. Scrolls above, Install pinned below.
            `min-h-0` is load-bearing: without it the grid item's automatic
            minimum size is its content, so the column grows past the 460px track
            and the pinned footer is pushed out of the dialog instead of the
            middle scrolling. */}
        <div className="flex min-h-0 min-w-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto pb-3 [scrollbar-gutter:stable]">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 pt-4">
            <span className="widget-data-label text-[var(--text-4)]">{badge.code}</span>
            <h3 className="text-[15px] font-semibold text-[var(--text-1)]">{badge.name}</h3>
            <span className="widget-data-label ml-auto text-[var(--text-4)]">
              {badge.width ? `${badge.width}×${badge.height}` : `auto×${badge.height}`}
              {badge.floor ? ` · floor ${badge.floor}px` : ""}
            </span>
          </div>
          <p className="px-4 pt-1.5 text-[13px] leading-relaxed text-[var(--text-3)]">
            {badge.blurb}
          </p>
          {badge.note ? (
            <p className="px-4 pt-1.5 font-mono text-[11px] leading-relaxed text-[var(--text-4)]">
              {badge.note}
            </p>
          ) : null}

          {/* Preview stage — the ground is the CLIENT's page, not the viewer's theme. */}
          <div
            className="mx-4 mt-3 flex min-h-[150px] items-center justify-center overflow-hidden rounded-lg border border-[var(--border-2)] p-4"
            style={{ background: ground === "dark" ? "#0F172A" : "#FAFAF9" }}
          >
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt={`${badge.name} preview`}
                className="h-auto max-w-full"
                style={badge.width ? { width: badge.width } : { height: badge.height }}
              />
            ) : sample ? (
              <div
                className="flex flex-col items-center gap-2"
                dangerouslySetInnerHTML={{ __html: sample }}
              />
            ) : (
              <p className="text-[12px] text-[var(--text-4)]">
                Pick a {isPulse ? "scan" : "countermark"} to preview.
              </p>
            )}
          </div>
          {needsToken && !scan && !mark ? (
            <p className="px-4 pt-2 font-mono text-[11px] text-[var(--text-4)]">
              {isPulse
                ? `Sample at ${SAMPLE_SCORE}/100 — pick a scan below for the real badge.`
                : "Sample mark — pick a countermark below for the real badge."}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 px-4 pt-3">
            <Seg
              label="Ground"
              value={ground}
              onChange={setGround}
              options={[
                { value: "light" as Ground, label: "Light" },
                { value: "dark" as Ground, label: "Dark" },
              ]}
            />
            <Seg
              label="Build"
              value={motion ? "anim" : "static"}
              onChange={(v) => setMotion(v === "anim")}
              options={[
                { value: "static", label: "Static" },
                { value: "anim", label: "Animated" },
              ]}
            />
            <button
              type="button"
              onClick={() => {
                setMotion(true);
                setReplay((n) => n + 1);
              }}
              className="app-button app-button-secondary app-button-sm"
            >
              <ArrowPathIcon className="mr-1.5 h-3.5 w-3.5" />
              Replay
            </button>
          </div>
          {!badge.hasDark && ground === "dark" ? (
            <p className="px-4 pt-2 font-mono text-[11px] text-[var(--text-4)]">
              {badge.code} carries its own dark ground — one build works on both.
            </p>
          ) : null}
          {motion ? (
            <p className="px-4 pt-2 font-mono text-[11px] text-[var(--text-4)]">
              Animated is for our own surfaces. On a client site prefer Static — an animation
              inside an &lt;img&gt; freezes on its first frame wherever a page is rasterised
              without being scrolled (social cards, print-to-PDF).
            </p>
          ) : null}

          {/* Pulse needs a real shared scan before it can be installed anywhere. */}
          {isPulse ? (
            <div className="mt-3 border-t border-[var(--border-2)] px-4 pt-3">
              <label
                htmlFor="badge-scan"
                className="widget-data-label block pb-1.5 text-[var(--text-4)]"
              >
                Scan
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  id="badge-scan"
                  value={scanId}
                  onChange={(e) => setScanId(e.target.value)}
                  className="app-select-chevron app-input min-w-0 flex-1 pr-9"
                >
                  <option value="">Select a completed scan…</option>
                  {candidates.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.projectName} — {s.healthScore}/100
                      {s.isShared ? " · shared" : ""}
                    </option>
                  ))}
                </select>
                {scan && !scan.isShared ? (
                  <button
                    type="button"
                    onClick={onShare}
                    disabled={share.isPending}
                    className="app-button app-button-primary app-button-sm shrink-0"
                  >
                    {share.isPending ? "Sharing…" : "Share report"}
                  </button>
                ) : null}
              </div>
              {candidates.length === 0 ? (
                <p className="pt-2 font-mono text-[11px] text-[var(--text-4)]">
                  No completed scans yet — run one in Pulse first.
                </p>
              ) : scan && !scan.isShared ? (
                <p className="pt-2 font-mono text-[11px] text-[var(--text-4)]">
                  This scan isn&apos;t shared, so it has no public token yet. Sharing publishes
                  the report and the badge together — unsharing revokes both.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

          {isCm ? (
            <div className="mt-3 border-t border-[var(--border-2)] px-4 pt-3">
              <label
                htmlFor="badge-mark"
                className="widget-data-label block pb-1.5 text-[var(--text-4)]"
              >
                Countermark
              </label>
              <select
                id="badge-mark"
                value={markId}
                onChange={(e) => setMarkId(e.target.value)}
                className="app-select-chevron app-input w-full pr-9"
              >
                <option value="">Select a countermark…</option>
                {marks.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.subjectName} — {m.grade} · {m.status}
                  </option>
                ))}
              </select>
              {marks.length === 0 ? (
                <p className="pt-2 font-mono text-[11px] text-[var(--text-4)]">
                  None struck yet — issue one in Labs → Assay first.
                </p>
              ) : (
                <p className="pt-2 font-mono text-[11px] text-[var(--text-4)]">
                  A countermark is public from the moment it is struck, so there is no share
                  step. The badge ages with the mark and stops asserting when it lapses.
                </p>
              )}
            </div>
          ) : null}

          {/* Install — always in view; this is what the studio is for. */}
          <div className="shrink-0 border-t border-[var(--border-2)] bg-[var(--surface-0)] px-4 py-3">
            <div className="flex items-center justify-between gap-2 pb-1.5">
              <span className="widget-data-label text-[var(--text-4)]">Install</span>
              {src ? (
                <a
                  href={src}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="widget-data-label text-[var(--brand-700)] hover:underline"
                >
                  Open SVG
                  <ArrowTopRightOnSquareIcon className="ml-1 inline h-3 w-3" />
                </a>
              ) : null}
            </div>
            {snippet ? (
              <div className="flex items-start gap-2">
                <pre className="min-w-0 flex-1 overflow-x-auto rounded-md border border-[var(--border-2)] bg-[var(--surface-1)] p-2.5 font-mono text-[11px] leading-relaxed text-[var(--text-2)]">
                  {snippet}
                </pre>
                <button
                  type="button"
                  onClick={copy}
                  className="app-button app-button-secondary app-button-sm shrink-0"
                >
                  {copied ? (
                    <CheckIcon className="mr-1.5 h-3.5 w-3.5 text-[var(--success)]" />
                  ) : (
                    <ClipboardDocumentIcon className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            ) : needsToken ? (
              <p className="font-mono text-[11px] text-[var(--text-4)]">
                {isPulse
                  ? "Select and share a scan to get an installable snippet."
                  : "Select a countermark to get an installable snippet."}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}
