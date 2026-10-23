"use client";

import { useEffect, useRef, useState } from "react";
import { EXAMPLE_SCANS, exampleScore, weeksToClear, type ExampleStatus, type PillarKey } from "@/lib/pulse-examples";

/**
 * An example scan result that moves: pick a kind of product, and the score counts up, the
 * six summary bars fill and the findings change. Example data, labelled as such.
 *
 * ⚠️ The server render (and anyone with reduced motion) gets the FINISHED state: the
 * numbers and bars at their real values. Motion only ever starts from there, once the
 * section is on screen, so a screenshot, a PDF or a crawler never sees a blank chart
 * (the frozen-frame-0 trap in CLAUDE.md §39).
 */

const TEXT = "#1A1A1E";
const MUTED = "#6B6B6B";
const RULE = "rgba(12, 12, 24, 0.12)";
const SIGNAL = "#6B52FF";
const DISPLAY = "var(--font-fraunces), 'Fraunces', Georgia, serif";
const MONO = "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace";

const STATUS: Record<ExampleStatus, { label: string; fg: string; bg: string }> = {
  FAIL: { label: "Fail", fg: "#B42318", bg: "#FDECEA" },
  WARN: { label: "Warning", fg: "#8A5A00", bg: "#FFF4DB" },
  PASS: { label: "Pass", fg: "#1E7A4F", bg: "#E6F5EC" },
};

const VERDICT: Record<string, { fg: string; bg: string }> = {
  Ready: { fg: "#1E7A4F", bg: "#E6F5EC" },
  Conditional: { fg: "#8A5A00", bg: "#FFF4DB" },
  "Not ready": { fg: "#B42318", bg: "#FDECEA" },
};

export interface PillarInfo {
  key: PillarKey;
  label: string;
  weight: number;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** 0 → 1 over `ms` each time `run` changes, starting only when `active`. Starts finished. */
function useProgress(run: string, active: boolean, ms = 900): number {
  const [p, setP] = useState(1);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let start: number | null = null;
    // The reset to 0 happens INSIDE the first frame, never before it: a hidden or throttled
    // tab may never run a frame, and must then keep showing the finished values, not 0.
    // The clock starts at the first frame's own timestamp, which can be earlier than
    // performance.now() at scheduling; measuring from that gave negative progress (−1).
    const tick = (t: number) => {
      if (start === null) start = t;
      const x = Math.min(1, Math.max(0, (t - start) / ms));
      setP(1 - Math.pow(1 - x, 3)); // ease-out
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, active, ms]);
  return p;
}

export function ExampleScanDemo({ pillars }: { pillars: PillarInfo[] }) {
  const [id, setId] = useState(EXAMPLE_SCANS[0].id);
  const [devs, setDevs] = useState(2);
  const [seen, setSeen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        io.disconnect();
      }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  const scan = EXAMPLE_SCANS.find((s) => s.id === id) ?? EXAMPLE_SCANS[0];
  const weights = Object.fromEntries(pillars.map((p) => [p.key, p.weight])) as Record<PillarKey, number>;
  const score = exampleScore(scan.pillars, weights);
  const p = useProgress(id, seen && !reduced);
  const shownScore = Math.round(score * p);
  const R = 52;
  const C = 2 * Math.PI * R;
  const verdict = VERDICT[scan.verdict];

  return (
    <div ref={ref} className="ex-wrap">
      <div className="ex-tabs" role="tablist" aria-label="Example product">
        {EXAMPLE_SCANS.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={s.id === id} className="ex-tab" onClick={() => setId(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="ex-card">
        <div className="ex-flag">Example data</div>
        <div className="ex-top">
          <div className="ex-ring" aria-label={`Score ${score} out of 100`}>
            <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden>
              <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(12,12,24,0.08)" strokeWidth="10" />
              <circle
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={SIGNAL}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - (score / 100) * p)}
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div className="ex-ring-num">
              <span style={{ fontFamily: DISPLAY, fontSize: 38, fontWeight: 700, lineHeight: 1, color: TEXT, fontVariantNumeric: "tabular-nums" }}>{shownScore}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em", color: MUTED, marginTop: 4 }}>/ 100</span>
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, margin: "0 0 6px" }}>{scan.label} scan</p>
            <p style={{ fontFamily: MONO, fontSize: 13, color: TEXT, margin: "0 0 12px", overflowWrap: "anywhere" }}>{scan.subject}</p>
            <span className="ex-verdict" style={{ color: verdict.fg, background: verdict.bg }}>{scan.verdict}</span>
          </div>
        </div>

        <div className="ex-bars">
          {pillars.map((pl) => {
            const v = scan.pillars[pl.key];
            return (
              <div key={pl.key} className="ex-bar">
                <div className="ex-bar-head">
                  <span title={pl.label}>{pl.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: v === null ? MUTED : TEXT }}>{v === null ? "n/a" : Math.round(v * p)}</span>
                </div>
                <div className="ex-track">
                  {v !== null && <div className="ex-fill" style={{ width: `${v * p}%`, background: v >= 75 ? "#2F9E6A" : v >= 60 ? "#D49A1E" : "#D8473B" }} />}
                </div>
              </div>
            );
          })}
        </div>
        <p className="ex-note">
          {Object.values(scan.pillars).some((v) => v === null)
            ? "n/a means nothing in that area applies to this kind of product, so its weight is shared across the others."
            : `Weighted as Pulse weights them: ${pillars.map((pl) => `${pl.label.toLowerCase()} ${pl.weight}%`).join(", ")}.`}
        </p>

        <p className="ex-plain">
          <span className="ex-plain-label">In plain English</span>
          {scan.plain}
        </p>

        <ul className="ex-findings">
          {scan.findings.map((f) => (
            <li key={f.title} className="ex-finding">
              <span className="ex-chip" style={{ color: STATUS[f.status].fg, background: STATUS[f.status].bg }}>{STATUS[f.status].label}</span>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: TEXT, margin: 0 }}>{f.title}</p>
                <p style={{ fontFamily: MONO, fontSize: 12, color: MUTED, margin: "4px 0 0", overflowWrap: "anywhere" }}>{f.evidence}</p>
              </div>
            </li>
          ))}
        </ul>

        {scan.codeHealth && (
          <div className="ex-code">
            <div className="ex-code-stats">
              <div>
                <div className="ex-stat-num">{Math.round(scan.codeHealth.score * p)}</div>
                <div className="ex-stat-label">Code health</div>
              </div>
              <div>
                <div className="ex-stat-num">{Math.round(scan.codeHealth.effortDays * p)}</div>
                <div className="ex-stat-label">Days to tidy everything</div>
              </div>
              <div>
                <div className="ex-stat-num">{Math.round(scan.codeHealth.daysToMost * p)}</div>
                <div className="ex-stat-label">Days until most risk is gone</div>
              </div>
              <div>
                <div className="ex-stat-num">{scan.codeHealth.seriousLibraries}</div>
                <div className="ex-stat-label">Serious library holes</div>
              </div>
              <div>
                <div className="ex-stat-num">{scan.codeHealth.loops}</div>
                <div className="ex-stat-label">Files tangled in loops</div>
              </div>
              <div>
                <div className="ex-stat-num">{scan.codeHealth.busFactor}</div>
                <div className="ex-stat-label">People who know it</div>
              </div>
            </div>
            <label className="ex-slider">
              <span style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, color: TEXT }}>
                <span>
                  With <strong>{devs}</strong> {devs === 1 ? "developer" : "developers"} on it
                </span>
                <span style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700 }}>
                  ~{weeksToClear(scan.codeHealth.effortDays, devs)} {weeksToClear(scan.codeHealth.effortDays, devs) === 1 ? "week" : "weeks"}
                </span>
              </span>
              <input type="range" min={1} max={6} step={1} value={devs} onChange={(e) => setDevs(Number(e.target.value))} aria-label="Developers working on the debt" />
            </label>
            <p className="ex-note" style={{ marginTop: 10 }}>Where it costs most, because the code is complicated and changes often: {scan.codeHealth.hotspots.join(", ")}.</p>
          </div>
        )}
      </div>

      <style>{STYLES}</style>
    </div>
  );
}

const STYLES = `
.ex-wrap{max-width:860px}
.ex-tabs{display:inline-flex;flex-wrap:wrap;gap:4px;background:#fff;border:1px solid ${RULE};border-radius:12px;padding:4px;margin-bottom:16px}
.ex-tab{all:unset;cursor:pointer;padding:9px 14px;border-radius:9px;font-size:14px;font-weight:500;color:${MUTED}}
.ex-tab[aria-selected="true"]{background:#0C0C18;color:#F2EDE4}
.ex-tab:focus-visible{outline:2px solid ${SIGNAL};outline-offset:2px}
.ex-card{position:relative;background:#fff;border:1px solid ${RULE};border-radius:16px;padding:28px}
.ex-flag{position:absolute;top:16px;right:16px;font-family:${MONO};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};border:1px dashed rgba(12,12,24,0.25);border-radius:6px;padding:4px 8px}
.ex-top{display:flex;align-items:center;gap:24px;padding-right:110px}
.ex-ring{position:relative;flex:0 0 auto;width:120px;height:120px}
.ex-ring-num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ex-verdict{display:inline-block;font-family:${MONO};font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;border-radius:999px;padding:6px 12px}
.ex-bars{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px 24px;margin-top:28px;padding-top:24px;border-top:1px solid ${RULE}}
.ex-bar-head{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:${TEXT};margin-bottom:8px}
.ex-bar-head span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ex-track{height:6px;border-radius:999px;background:rgba(12,12,24,0.08);overflow:hidden}
.ex-fill{height:100%;border-radius:999px}
.ex-note{font-size:12px;color:${MUTED};line-height:1.55;margin:14px 0 0}
.ex-plain{margin:18px 0 0;padding:14px 16px;background:#F7F3EC;border:1px solid ${RULE};border-radius:10px;font-size:15px;line-height:1.55;color:${TEXT}}
.ex-plain-label{display:block;font-family:${MONO};font-size:10px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};margin-bottom:6px}
.ex-findings{list-style:none;margin:24px 0 0;padding:0;border-top:1px solid ${RULE}}
.ex-finding{display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-bottom:1px solid ${RULE}}
.ex-chip{flex:0 0 auto;width:72px;text-align:center;font-family:${MONO};font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;border-radius:6px;padding:5px 0;margin-top:1px}
.ex-code{margin-top:24px;padding:20px;border-radius:12px;background:#F7F4EE}
.ex-code-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px 12px;margin-bottom:20px}
.ex-stat-num{font-family:${DISPLAY};font-size:34px;font-weight:700;line-height:1;color:${TEXT};font-variant-numeric:tabular-nums}
.ex-stat-label{font-family:${MONO};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};margin-top:8px}
.ex-slider{display:block}
.ex-slider input{width:100%;margin-top:12px;accent-color:${SIGNAL};height:24px}
@media (max-width: 640px){
  .ex-card{padding:20px 18px}
  .ex-flag{position:static;display:inline-block;margin-bottom:14px}
  .ex-top{padding-right:0;gap:16px}
  .ex-ring{width:96px;height:96px}
  .ex-ring svg{width:96px;height:96px}
  .ex-bars{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px}
  .ex-tabs{display:flex}
  .ex-tab{flex:1 1 auto;text-align:center;padding:9px 10px}
  .ex-chip{width:64px}
}
`;
