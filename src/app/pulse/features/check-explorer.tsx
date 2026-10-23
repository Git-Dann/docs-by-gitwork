"use client";

import { useMemo, useState } from "react";

/**
 * The interactive part of /pulse/features: every check, grouped into sections and areas,
 * with a search across all of them and a filter by section. The data arrives as props from
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

const INK = "#0C0C18";
const TEXT = "#1A1A1E";
const MUTED = "#6B6B6B";
const PAPER = "#F2EDE4";
const RULE = "rgba(12, 12, 24, 0.12)";
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
          <mark key={i} style={{ background: "rgba(107, 82, 255, 0.12)", color: TEXT, borderRadius: 3, padding: "0 1px" }}>
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        border: `1px solid ${on ? INK : RULE}`,
        background: on ? INK : "#FFFFFF",
        color: on ? PAPER : TEXT,
        borderRadius: 999,
        padding: "7px 14px",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export function CheckExplorer({ groups, areas, total }: { groups: ExplorerGroup[]; areas: ExplorerArea[]; total: number }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("all");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const searching = query.trim().length >= 2;

  const countByGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of areas) m.set(a.group, (m.get(a.group) ?? 0) + a.labels.length);
    return m;
  }, [areas]);

  // What is on screen: the chosen section, and while searching only the areas (and checks)
  // that match. A search spans every section, so the section filter steps aside.
  const shown = useMemo(() => {
    return areas
      .filter((a) => searching || group === "all" || a.group === group)
      .map((a) => ({
        ...a,
        matches: searching ? searchArea(a, query) : a.labels,
      }))
      .filter((a) => !searching || a.matches.length > 0);
  }, [areas, group, query, searching]);

  const matchCount = shown.reduce((n, a) => n + a.matches.length, 0);

  function toggle(category: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return (
    <div>
      {/* Controls */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 28 }}>
        <label style={{ position: "relative", display: "block", maxWidth: 520 }}>
          <span className="sr-only">Search the checks</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${total.toLocaleString("en-GB")} checks`}
            style={{
              width: "100%",
              border: `1px solid ${RULE}`,
              background: "#FFFFFF",
              borderRadius: 999,
              padding: "12px 18px",
              fontSize: 16,
              color: TEXT,
              outlineColor: INK,
            }}
          />
        </label>
        {searching ? (
          <p style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, margin: 0 }}>
            {matchCount.toLocaleString("en-GB")} {matchCount === 1 ? "check matches" : "checks match"} across every section
          </p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Pill on={group === "all"} onClick={() => setGroup("all")}>
              All · {total.toLocaleString("en-GB")}
            </Pill>
            {groups.map((g) => (
              <Pill key={g.id} on={group === g.id} onClick={() => setGroup(g.id)}>
                {g.name} · {(countByGroup.get(g.id) ?? 0).toLocaleString("en-GB")}
              </Pill>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <p style={{ color: MUTED, fontSize: 15 }}>No check mentions that. Try a shorter word.</p>
      ) : (
        groups
          .filter((g) => shown.some((a) => a.group === g.id))
          .map((g) => {
            const inGroup = shown.filter((a) => a.group === g.id);
            return (
              <section key={g.id} style={{ marginBottom: 40 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "4px 16px", borderBottom: `1px solid ${RULE}`, paddingBottom: 12, marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontFamily: DISPLAY, fontSize: 25, fontWeight: 700, letterSpacing: "-0.012em", margin: 0, color: TEXT }}>{g.name}</h3>
                    <p style={{ color: MUTED, fontSize: 14, margin: "4px 0 0" }}>{g.line}</p>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED }}>
                    {inGroup.reduce((n, a) => n + a.matches.length, 0).toLocaleString("en-GB")} checks
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, alignItems: "start" }}>
                  {inGroup.map((a) => {
                    const expanded = searching || open.has(a.category);
                    const listId = `checks-${a.category.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
                    return (
                      <article key={a.category} style={{ background: "#FFFFFF", border: `1px solid ${RULE}`, borderRadius: 14, padding: "18px 20px" }}>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                          <h4 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: TEXT }}>{a.name}</h4>
                          <span style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, color: TEXT, fontVariantNumeric: "tabular-nums" }}>
                            {a.matches.length.toLocaleString("en-GB")}
                          </span>
                        </div>
                        <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.55, margin: "6px 0 12px" }}>{a.covers}</p>
                        {!searching && (
                          <button
                            type="button"
                            onClick={() => toggle(a.category)}
                            aria-expanded={expanded}
                            aria-controls={listId}
                            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEXT }}
                          >
                            {expanded ? "Hide the checks ↑" : `Show the ${a.labels.length.toLocaleString("en-GB")} checks ↓`}
                          </button>
                        )}
                        {expanded && (
                          <ul
                            id={listId}
                            style={{ listStyle: "none", margin: searching ? 0 : "12px 0 0", padding: "12px 0 0", borderTop: `1px solid ${RULE}`, maxHeight: 300, overflowY: "auto", display: "grid", gap: 7 }}
                          >
                            {a.matches.map((l, i) => (
                              <li key={`${l}-${i}`} style={{ display: "flex", gap: 8, fontSize: 13, lineHeight: 1.45, color: TEXT }}>
                                <span aria-hidden style={{ color: MUTED }}>·</span>
                                <span>{searching ? <Highlight text={l} query={query} /> : l}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })
      )}
    </div>
  );
}
