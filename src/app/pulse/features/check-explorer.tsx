"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SECTION_EXAMPLES, type ExampleStatus } from "@/lib/pulse-examples";

/**
 * The interactive part of /pulse/features: every check, grouped into sections and areas.
 *
 * One control bar (search + a section dropdown) rather than a wall of filter pills, area
 * cards of one fixed size, and an area's checks opened in a side panel (a bottom sheet on a
 * phone) so the grid never reflows when something is opened. The data arrives as props from
 * the server page, so the check registry itself never ships to the browser.
 */

export interface ExplorerArea {
  category: string;
  group: string;
  name: string;
  covers: string;
  labels: string[];
}

export interface ExplorerGroup {
  id: string;
  name: string;
  line: string;
}

const TEXT = "#1A1A1E";
const MUTED = "#6B6B6B";
const RULE = "rgba(12, 12, 24, 0.12)";
const SIGNAL = "#6B52FF";
const DISPLAY = "var(--font-fraunces), 'Fraunces', Georgia, serif";
const MONO = "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace";

/** Every word of the query must appear in the label, in any order. */
export function matchesQuery(label: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const l = label.toLowerCase();
  return words.every((w) => l.includes(w));
}

/**
 * The checks a search shows in one area: those whose own name matches. Only when none do
 * but the area itself is what was searched for ("payments") does the whole area show.
 * Matching the description first listed every Payments check for "stripe".
 */
export function searchArea(area: Pick<ExplorerArea, "name" | "covers" | "labels">, query: string): string[] {
  const hits = area.labels.filter((l) => matchesQuery(l, query));
  if (hits.length > 0) return hits;
  return matchesQuery(`${area.name} ${area.covers}`, query) ? area.labels : [];
}

function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} style={{ background: "rgba(107, 82, 255, 0.14)", color: TEXT, borderRadius: 3, padding: "0 1px" }}>
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

const fmt = (n: number) => n.toLocaleString("en-GB");

/** Results shown per area while searching, before "show all" opens the panel. */
const RESULTS_PER_AREA = 6;

export function CheckExplorer({ groups, areas, total }: { groups: ExplorerGroup[]; areas: ExplorerArea[]; total: number }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("all");
  const [panel, setPanel] = useState<{ category: string; query: string } | null>(null);
  const searching = query.trim().length >= 2;

  const countByGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of areas) m.set(a.group, (m.get(a.group) ?? 0) + a.labels.length);
    return m;
  }, [areas]);

  // A search spans the chosen section (or every section): the dropdown narrows a search
  // rather than being thrown away by it.
  const inScope = useMemo(() => areas.filter((a) => group === "all" || a.group === group), [areas, group]);
  const results = useMemo(
    () => (searching ? inScope.map((a) => ({ area: a, matches: searchArea(a, query) })).filter((r) => r.matches.length > 0) : []),
    [inScope, query, searching],
  );
  const matchCount = results.reduce((n, r) => n + r.matches.length, 0);
  const scopeTotal = group === "all" ? total : countByGroup.get(group) ?? 0;
  const openArea = panel ? areas.find((a) => a.category === panel.category) ?? null : null;

  return (
    <div className="pf-explorer">
      <div className="pf-controls" role="search">
        <label className="pf-search">
          <span className="sr-only">Search the checks</span>
          <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={MUTED} strokeWidth="1.6">
            <circle cx="7" cy="7" r="5" />
            <path d="m11 11 3.5 3.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${fmt(scopeTotal)} checks`}
          />
        </label>
        <label className="pf-select">
          <span className="sr-only">Section</span>
          <select className="app-select-chevron pr-6" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="all">All sections · {fmt(total)}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} · {fmt(countByGroup.get(g.id) ?? 0)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {searching ? (
        <div>
          <p className="pf-meta">
            {fmt(matchCount)} {matchCount === 1 ? "check matches" : "checks match"}
            {group === "all" ? " across every section" : ` in ${groups.find((g) => g.id === group)?.name ?? "this section"}`}
          </p>
          {results.length === 0 ? (
            <p style={{ color: MUTED, fontSize: 15, margin: "8px 0 0" }}>No check mentions that. Try a shorter word.</p>
          ) : (
            <div className="pf-results">
              {results.map(({ area, matches }) => (
                <section key={area.category} className="pf-result">
                  <div className="pf-result-head">
                    <h4>{area.name}</h4>
                    <span className="pf-meta" style={{ margin: 0 }}>{fmt(matches.length)}</span>
                  </div>
                  <ul>
                    {matches.slice(0, RESULTS_PER_AREA).map((l, i) => (
                      <li key={`${l}-${i}`}>
                        <Highlight text={l} query={query} />
                      </li>
                    ))}
                  </ul>
                  {matches.length > RESULTS_PER_AREA && (
                    <button type="button" className="pf-link" onClick={() => setPanel({ category: area.category, query })}>
                      Show all {fmt(matches.length)} →
                    </button>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      ) : (
        groups
          .filter((g) => group === "all" || g.id === group)
          .map((g) => {
            const inGroup = areas.filter((a) => a.group === g.id);
            return (
              <section key={g.id} className="pf-group">
                <div className="pf-group-head">
                  <div>
                    <h3>{g.name}</h3>
                    <p>{g.line}</p>
                  </div>
                  <span className="pf-meta" style={{ margin: 0 }}>
                    {fmt(countByGroup.get(g.id) ?? 0)} checks
                  </span>
                </div>
                {SECTION_EXAMPLES[g.id] && <SectionExample status={SECTION_EXAMPLES[g.id].status} title={SECTION_EXAMPLES[g.id].title} />}
                <div className="pf-grid">
                  {inGroup.map((a) => (
                    <button key={a.category} type="button" className="pf-card" onClick={() => setPanel({ category: a.category, query: "" })} aria-haspopup="dialog">
                      <span className="pf-card-top">
                        <span className="pf-card-name" title={a.name}>{a.name}</span>
                        <span className="pf-card-count">{fmt(a.labels.length)}</span>
                      </span>
                      <span className="pf-card-covers" title={a.covers}>{a.covers}</span>
                      <span className="pf-card-cta">See the checks →</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })
      )}

      {openArea && <AreaPanel area={openArea} initialQuery={panel?.query ?? ""} onClose={() => setPanel(null)} />}

      <style>{STYLES}</style>
    </div>
  );
}

const CHIP: Record<ExampleStatus, { label: string; fg: string; bg: string }> = {
  FAIL: { label: "Fail", fg: "#B42318", bg: "#FDECEA" },
  WARN: { label: "Warning", fg: "#8A5A00", bg: "#FFF4DB" },
  PASS: { label: "Pass", fg: "#1E7A4F", bg: "#E6F5EC" },
};

/** What a finding in this section looks like: one example line, labelled as one. */
function SectionExample({ status, title }: { status: ExampleStatus; title: string }) {
  return (
    <div className="pf-example">
      <span className="pf-example-label">For example</span>
      <span className="pf-example-chip" style={{ color: CHIP[status].fg, background: CHIP[status].bg }}>{CHIP[status].label}</span>
      <span className="pf-example-text">{title}</span>
    </div>
  );
}

/** Every check in one area, in a side panel (bottom sheet on a phone), with its own search. */
function AreaPanel({ area, initialQuery, onClose }: { area: ExplorerArea; initialQuery: string; onClose: () => void }) {
  const [q, setQ] = useState(initialQuery);
  const closeRef = useRef<HTMLButtonElement>(null);
  const shown = q.trim().length >= 2 ? area.labels.filter((l) => matchesQuery(l, q)) : area.labels;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="pf-overlay" onClick={onClose}>
      <div className="pf-panel" role="dialog" aria-modal="true" aria-labelledby="pf-panel-title" onClick={(e) => e.stopPropagation()}>
        <div className="pf-panel-head">
          <div style={{ minWidth: 0 }}>
            <p className="pf-meta" style={{ margin: "0 0 6px" }}>{fmt(area.labels.length)} checks</p>
            <h3 id="pf-panel-title">{area.name}</h3>
            <p className="pf-panel-covers">{area.covers}</p>
          </div>
          <button ref={closeRef} type="button" className="pf-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <label className="pf-search pf-panel-search">
          <span className="sr-only">Search this area</span>
          <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={MUTED} strokeWidth="1.6">
            <circle cx="7" cy="7" r="5" />
            <path d="m11 11 3.5 3.5" strokeLinecap="round" />
          </svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${area.name}`} />
        </label>
        <ul className="pf-panel-list">
          {shown.length === 0 ? (
            <li style={{ color: MUTED }}>Nothing in this area mentions that.</li>
          ) : (
            shown.map((l, i) => (
              <li key={`${l}-${i}`}>
                <span aria-hidden className="pf-dot" />
                <span>{q.trim().length >= 2 ? <Highlight text={l} query={q} /> : l}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

const STYLES = `
.pf-explorer .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.pf-controls{display:flex;align-items:stretch;background:#fff;border:1px solid ${RULE};border-radius:14px;margin-bottom:12px;max-width:760px}
.pf-search{position:relative;display:flex;align-items:center;gap:10px;flex:1;min-width:0;padding:0 16px}
.pf-search input{flex:1;min-width:0;border:0;background:transparent;font-size:16px;padding:14px 0;color:${TEXT};outline:none}
.pf-controls:focus-within{border-color:${TEXT}}
.pf-select{position:relative;display:flex;border-left:1px solid ${RULE};flex:0 0 auto}
.pf-select select{appearance:none;-webkit-appearance:none;border:0;background-color:transparent;background-position:calc(100% - 16px) center;background-size:14px 14px;font-size:15px;font-weight:500;color:${TEXT};padding:14px 42px 14px 16px;cursor:pointer;max-width:280px;text-overflow:ellipsis;font-family:inherit}
.pf-select select:focus-visible{outline:2px solid ${SIGNAL};outline-offset:-2px;border-radius:0 13px 13px 0}
.pf-meta{font-family:${MONO};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED};margin:16px 0 20px}
.pf-group{margin-top:40px}
.pf-group-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px;border-bottom:1px solid ${RULE};padding-bottom:12px;margin-bottom:16px}
.pf-group-head h3{font-family:${DISPLAY};font-size:25px;font-weight:700;letter-spacing:-0.012em;margin:0;color:${TEXT}}
.pf-group-head p{color:${MUTED};font-size:14px;margin:4px 0 0}
.pf-example{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fff;border:1px dashed rgba(12,12,24,0.2);border-radius:12px;padding:10px 14px;margin:0 0 14px}
.pf-example-label{font-family:${MONO};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED}}
.pf-example-chip{font-family:${MONO};font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;border-radius:6px;padding:4px 8px}
.pf-example-text{font-size:14px;color:${TEXT};min-width:0;flex:1 1 240px}
.pf-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.pf-card{all:unset;box-sizing:border-box;display:flex;flex-direction:column;height:168px;background:#fff;border:1px solid ${RULE};border-radius:14px;padding:18px 20px;cursor:pointer;transition:border-color .15s, box-shadow .15s}
.pf-card:hover{border-color:rgba(12,12,24,0.32);box-shadow:0 1px 0 rgba(12,12,24,0.04)}
.pf-card:focus-visible{outline:2px solid ${SIGNAL};outline-offset:2px}
.pf-card-top{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.pf-card-name{font-size:15px;font-weight:600;color:${TEXT};min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pf-card-count{font-family:${DISPLAY};font-size:24px;font-weight:700;color:${TEXT};font-variant-numeric:tabular-nums;flex:0 0 auto}
.pf-card-covers{color:${MUTED};font-size:13px;line-height:1.55;margin-top:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pf-card-cta{margin-top:auto;font-family:${MONO};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${TEXT}}
.pf-card:hover .pf-card-cta{color:${SIGNAL}}
.pf-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.pf-result{background:#fff;border:1px solid ${RULE};border-radius:14px;padding:16px 20px}
.pf-result-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:1px solid ${RULE};padding-bottom:10px;margin-bottom:10px}
.pf-result-head h4{font-size:15px;font-weight:600;margin:0;color:${TEXT}}
.pf-result ul,.pf-panel-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.pf-result li{font-size:13px;line-height:1.45;color:${TEXT}}
.pf-link{all:unset;cursor:pointer;margin-top:12px;font-family:${MONO};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${TEXT}}
.pf-link:hover{color:${SIGNAL}}
.pf-link:focus-visible{outline:2px solid ${SIGNAL};outline-offset:2px}
.pf-overlay{position:fixed;inset:0;z-index:50;background:rgba(12,12,24,0.42);display:flex;justify-content:flex-end}
.pf-panel{background:#F2EDE4;width:min(520px,100%);height:100%;display:flex;flex-direction:column;box-shadow:-12px 0 40px rgba(12,12,24,0.18)}
.pf-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:24px 24px 16px;border-bottom:1px solid ${RULE}}
.pf-panel-head h3{font-family:${DISPLAY};font-size:28px;font-weight:700;letter-spacing:-0.014em;line-height:1.1;margin:0;color:${TEXT}}
.pf-panel-covers{color:${MUTED};font-size:14px;line-height:1.55;margin:8px 0 0}
.pf-close{all:unset;cursor:pointer;flex:0 0 auto;width:36px;height:36px;border-radius:999px;border:1px solid ${RULE};background:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1;color:${TEXT}}
.pf-close:focus-visible{outline:2px solid ${SIGNAL};outline-offset:2px}
.pf-panel-search{margin:16px 24px 8px;background:#fff;border:1px solid ${RULE};border-radius:12px;flex:0 0 auto}
.pf-panel-search:focus-within{border-color:${TEXT}}
.pf-panel-list{overflow-y:auto;padding:8px 24px 32px;flex:1;align-content:start}
.pf-panel-list li{display:flex;gap:10px;font-size:14px;line-height:1.5;color:${TEXT};padding:9px 0;border-bottom:1px solid ${RULE}}
.pf-dot{flex:0 0 auto;width:5px;height:5px;border-radius:999px;background:${SIGNAL};margin-top:9px}
@media (max-width: 900px){.pf-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width: 640px){
  .pf-controls{flex-direction:column;border-radius:14px}
  .pf-select{border-left:0;border-top:1px solid ${RULE}}
  .pf-select select{max-width:none;width:100%}
  .pf-grid,.pf-results{grid-template-columns:minmax(0,1fr)}
  .pf-card{height:140px}
  .pf-overlay{align-items:flex-end}
  .pf-panel{width:100%;height:88vh;border-radius:18px 18px 0 0;box-shadow:0 -12px 40px rgba(12,12,24,0.18)}
  .pf-panel-head{padding:20px 20px 14px}
  .pf-panel-search{margin:14px 20px 6px}
  .pf-panel-list{padding:6px 20px 28px}
}
@media (prefers-reduced-motion: no-preference){.pf-panel{animation:pf-in .18s ease-out}}
@keyframes pf-in{from{transform:translateX(24px)}to{transform:none}}
@media (max-width: 640px) and (prefers-reduced-motion: no-preference){.pf-panel{animation:pf-up .2s ease-out}}
@keyframes pf-up{from{transform:translateY(24px)}to{transform:none}}
`;
