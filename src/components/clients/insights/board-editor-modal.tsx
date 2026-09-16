"use client";

/**
 * The board editor — one modal for all four types.
 *
 * ## Why the node editor is a FLAT list
 *
 * A node board is a two-level tree, and the obvious editor for a tree is a nested one with
 * nested drag-and-drop. That is a lot of machinery for a shape this simple, and it is
 * awkward on a phone. Instead every row carries a Branch/Leaf toggle and **a leaf attaches
 * to the nearest branch above it** — so a two-level tree is edited as one flat, reorderable
 * list, which is also literally how the brief described it ("add data points… as easy as
 * possible"). A leaf dragged above the first branch is promoted to a branch on save, so
 * there is no state the list can be in that the tree cannot express.
 */

import { useEffect, useMemo, useState } from "react";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
import { INSIGHT_COLOR_KEYS, INSIGHT_MARK_COLOR } from "@/lib/insights/palette";
import { MAX_BRANCHES_RADIAL } from "@/lib/insights/radial-layout";
import type { WikiInsightBoardRecord } from "@/server/wiki-insights";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

type BoardType = "BAR" | "PIE" | "VENN" | "NODE";

export interface BoardDraft {
  type: BoardType;
  title: string;
  caption: string | null;
  valueUnit: string | null;
  setALabel: string | null;
  setBLabel: string | null;
  setCLabel: string | null;
  coreLabel: string | null;
  points?: { label: string; value: number; color: string | null; note: string | null }[];
  items?: { label: string; region: string; note: string | null }[];
  branches?: {
    label: string;
    color: string | null;
    note: string | null;
    link: string | null;
    leaves: { label: string; note: string | null; link: string | null }[];
  }[];
}

interface SeriesRow { key: string; label: string; value: string; color: string }
interface VennRow { key: string; label: string; region: string }
interface NodeRow { key: string; kind: "branch" | "leaf"; label: string; color: string; link: string }

let seq = 0;
const newKey = () => `r${++seq}`;

const TYPES: { value: BoardType; label: string; blurb: string }[] = [
  { value: "BAR", label: "Bar", blurb: "Compare a few labelled figures." },
  { value: "PIE", label: "Pie", blurb: "Show the parts of one whole." },
  { value: "VENN", label: "Venn", blurb: "What overlaps between two or three groups." },
  { value: "NODE", label: "Node map", blurb: "One thing at the centre, everything connected to it." },
];

function fromBoard(board: WikiInsightBoardRecord | null) {
  if (!board) {
    return {
      type: "BAR" as BoardType,
      title: "",
      caption: "",
      unit: "",
      sets: ["", "", ""],
      core: "",
      series: [
        { key: newKey(), label: "", value: "", color: "" },
        { key: newKey(), label: "", value: "", color: "" },
      ] as SeriesRow[],
      venn: [{ key: newKey(), label: "", region: "A" }] as VennRow[],
      nodes: [{ key: newKey(), kind: "branch" as const, label: "", color: "", link: "" }] as NodeRow[],
    };
  }
  const base = {
    title: board.title,
    caption: board.caption ?? "",
    unit: "unit" in board ? (board.unit ?? "") : "",
    sets: board.kind === "venn" ? ["A", "B", "C"].map((k) => board.sets.find((s) => s.key === k)?.label ?? "") : ["", "", ""],
    core: board.kind === "node" ? board.core : "",
    series:
      board.kind === "bar" || board.kind === "pie"
        ? board.points.map((p) => ({ key: newKey(), label: p.label, value: String(p.value), color: p.color }))
        : [{ key: newKey(), label: "", value: "", color: "" }],
    venn:
      board.kind === "venn"
        ? board.items.map((i) => ({ key: newKey(), label: i.label, region: i.region as string }))
        : [{ key: newKey(), label: "", region: "A" }],
    nodes:
      board.kind === "node"
        ? board.branches.flatMap((b) => [
            { key: newKey(), kind: "branch" as const, label: b.label, color: b.color, link: b.link ?? "" },
            ...b.leaves.map((l) => ({ key: newKey(), kind: "leaf" as const, label: l.label, color: "", link: l.link ?? "" })),
          ])
        : [{ key: newKey(), kind: "branch" as const, label: "", color: "", link: "" }],
  };
  const type: BoardType =
    board.kind === "bar" ? "BAR" : board.kind === "pie" ? "PIE" : board.kind === "venn" ? "VENN" : "NODE";
  return { type, ...base };
}

export function BoardEditorModal({
  open,
  board,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  board: WikiInsightBoardRecord | null;
  onClose: () => void;
  onSave: (draft: BoardDraft) => Promise<void>;
  saving: boolean;
}) {
  const initial = useMemo(() => fromBoard(board), [board]);
  const [type, setType] = useState<BoardType>(initial.type);
  const [title, setTitle] = useState(initial.title);
  const [caption, setCaption] = useState(initial.caption);
  const [unit, setUnit] = useState(initial.unit);
  const [sets, setSets] = useState<string[]>(initial.sets);
  const [core, setCore] = useState(initial.core);
  const [series, setSeries] = useState<SeriesRow[]>(initial.series);
  const [venn, setVenn] = useState<VennRow[]>(initial.venn);
  const [nodes, setNodes] = useState<NodeRow[]>(initial.nodes);
  const [error, setError] = useState<string | null>(null);

  // Re-seed when a DIFFERENT board is opened. Without the guard, editing a field would be
  // overwritten on the next render by the board prop it was derived from.
  useEffect(() => {
    const next = fromBoard(board);
    setType(next.type);
    setTitle(next.title);
    setCaption(next.caption);
    setUnit(next.unit);
    setSets(next.sets);
    setCore(next.core);
    setSeries(next.series);
    setVenn(next.venn);
    setNodes(next.nodes);
    setError(null);
  }, [board]);

  const threeSets = sets[2].trim() !== "";
  const regions = threeSets ? ["A", "B", "C", "AB", "AC", "BC", "ABC"] : ["A", "B", "AB"];
  const branchCount = nodes.filter((n) => n.kind === "branch").length;

  function build(): BoardDraft | string {
    if (!title.trim()) return "Give the board a title.";
    const common = {
      type,
      title: title.trim(),
      caption: caption.trim() || null,
      valueUnit: null,
      setALabel: null,
      setBLabel: null,
      setCLabel: null,
      coreLabel: null,
    } satisfies BoardDraft;

    if (type === "BAR" || type === "PIE") {
      const points = series
        .filter((r) => r.label.trim() !== "" || r.value.trim() !== "")
        .map((r) => ({
          label: r.label.trim(),
          value: Number(r.value),
          color: r.color || null,
          note: null,
        }));
      if (points.length === 0) return "Add at least one data point.";
      const bad = points.find((p) => !p.label || !Number.isFinite(p.value));
      if (bad) return "Every point needs a label and a number.";
      if (type === "PIE" && points.some((p) => p.value < 0)) {
        return "A pie slice cannot be negative — use a bar chart for figures that go below zero.";
      }
      return { ...common, valueUnit: unit.trim() || null, points };
    }

    if (type === "VENN") {
      if (!sets[0].trim() || !sets[1].trim()) return "Name at least two groups.";
      const items = venn
        .filter((r) => r.label.trim() !== "")
        .map((r) => ({ label: r.label.trim(), region: r.region, note: null }));
      const stray = items.find((i) => !regions.includes(i.region));
      if (stray) {
        return `"${stray.label}" sits in a region that needs a third group — name one, or move it.`;
      }
      return {
        ...common,
        setALabel: sets[0].trim(),
        setBLabel: sets[1].trim(),
        setCLabel: sets[2].trim() || null,
        items,
      };
    }

    if (!core.trim()) return "Name the thing at the centre.";
    // A leaf attaches to the nearest branch ABOVE it; a leaf before any branch becomes a
    // branch, so there is no list order the tree cannot express.
    const branches: NonNullable<BoardDraft["branches"]> = [];
    for (const row of nodes) {
      if (!row.label.trim()) continue;
      if (row.kind === "branch" || branches.length === 0) {
        branches.push({
          label: row.label.trim(),
          color: row.color || null,
          note: null,
          link: row.link.trim() || null,
          leaves: [],
        });
      } else {
        branches[branches.length - 1].leaves.push({
          label: row.label.trim(),
          note: null,
          link: row.link.trim() || null,
        });
      }
    }
    if (branches.length === 0) return "Add at least one connected entity.";
    if (branches.length > MAX_BRANCHES_RADIAL) {
      return `A node map reads clearly up to ${MAX_BRANCHES_RADIAL} direct connections — group some as leaves instead.`;
    }
    return { ...common, coreLabel: core.trim(), branches };
  }

  async function submit() {
    const built = build();
    if (typeof built === "string") {
      setError(built);
      return;
    }
    setError(null);
    await onSave(built);
  }

  const rowBtn =
    "rounded-[6px] border border-[var(--border-2)] p-1.5 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-rose-600";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={board ? "Edit board" : "New board"}
      // ⚠️ Height bound to the VIEWPORT, never to the content. A `max-h-[Nvh]` on the
      // scroll region alone is NOT a fixed height — it caps the tall case while letting a
      // short one collapse the box, so a two-point board and a forty-point board opened at
      // wildly different sizes. DESIGN.md § Grid & Container; same geometry as
      // daily-rollup.tsx and project-update-composer.tsx.
      panelClassName="flex h-[80vh] max-h-[680px] min-h-[min(460px,80vh)] w-full max-w-3xl flex-col"
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        {/* Left: what the board IS. */}
        <div className="min-h-0 space-y-3 overflow-y-auto border-b border-[var(--border-2)] p-5 md:border-b-0 md:border-r">
          <div>
            <label className="app-field-label" htmlFor="board-type">Type</label>
            <select
              id="board-type"
              value={type}
              onChange={(e) => setType(e.target.value as BoardType)}
              className="app-select-compact mt-1"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[12px] text-[var(--text-4)]">
              {TYPES.find((t) => t.value === type)?.blurb}
            </p>
          </div>
          <div>
            <label className="app-field-label" htmlFor="board-title">Title</label>
            <input
              id="board-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What is this showing?"
              className="app-input mt-1"
            />
          </div>
          <div>
            <label className="app-field-label" htmlFor="board-caption">Caption</label>
            <textarea
              id="board-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              placeholder="A sentence in plain English saying what the reader is looking at."
              className="app-input mt-1 resize-y py-2.5 leading-relaxed"
            />
            <p className="mt-1 text-[12px] text-[var(--text-4)]">
              The most useful field here — a figure with no sentence beside it is decoration.
            </p>
          </div>
          {(type === "BAR" || type === "PIE") && (
            <div>
              <label className="app-field-label" htmlFor="board-unit">Unit (optional)</label>
              <input
                id="board-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="£  ·  %  ·  users"
                className="app-input-compact mt-1"
              />
            </div>
          )}
          {type === "VENN" && (
            <div className="space-y-2">
              <p className="app-field-label">Groups</p>
              {[0, 1, 2].map((i) => (
                <input
                  key={i}
                  value={sets[i]}
                  onChange={(e) => setSets((s) => s.map((v, j) => (j === i ? e.target.value : v)))}
                  placeholder={i === 2 ? "Third group (optional)" : `Group ${i + 1}`}
                  aria-label={`Group ${i + 1}`}
                  className="app-input-compact"
                />
              ))}
            </div>
          )}
          {type === "NODE" && (
            <div>
              <label className="app-field-label" htmlFor="board-core">At the centre</label>
              <input
                id="board-core"
                value={core}
                onChange={(e) => setCore(e.target.value)}
                placeholder="e.g. Coachman caravan"
                className="app-input mt-1"
              />
            </div>
          )}
        </div>

        {/* Right: the data. Scrolls; the modal itself does not grow. */}
        <div className="min-h-0 space-y-2 overflow-y-auto p-5">
          {(type === "BAR" || type === "PIE") && (
            <>
              {series.map((row, i) => (
                <div key={row.key} className="flex items-center gap-2">
                  <input
                    value={row.label}
                    onChange={(e) => setSeries((s) => s.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
                    placeholder="Label"
                    aria-label={`Point ${i + 1} label`}
                    className="app-input-compact min-w-0 flex-1"
                  />
                  <input
                    value={row.value}
                    onChange={(e) => setSeries((s) => s.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
                    placeholder="0"
                    inputMode="decimal"
                    aria-label={`Point ${i + 1} value`}
                    className="app-input-compact w-[92px] shrink-0"
                    style={{ fontFamily: MONO }}
                  />
                  <ColorPicker
                    value={row.color}
                    index={i}
                    onChange={(c) => setSeries((s) => s.map((r, j) => (j === i ? { ...r, color: c } : r)))}
                  />
                  <button type="button" aria-label={`Remove point ${i + 1}`} className={rowBtn}
                    onClick={() => setSeries((s) => s.filter((_, j) => j !== i))}>
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <AddRow onClick={() => setSeries((s) => [...s, { key: newKey(), label: "", value: "", color: "" }])} />
            </>
          )}

          {type === "VENN" && (
            <>
              {venn.map((row, i) => (
                <div key={row.key} className="flex items-center gap-2">
                  <input
                    value={row.label}
                    onChange={(e) => setVenn((s) => s.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
                    placeholder="What sits here"
                    aria-label={`Item ${i + 1}`}
                    className="app-input-compact min-w-0 flex-1"
                  />
                  <select
                    value={row.region}
                    onChange={(e) => setVenn((s) => s.map((r, j) => (j === i ? { ...r, region: e.target.value } : r)))}
                    aria-label={`Item ${i + 1} group`}
                    className="app-select-compact w-[168px] shrink-0"
                  >
                    {regions.map((r) => (
                      <option key={r} value={r}>
                        {r.length === 1
                          ? `Only ${sets[["A", "B", "C"].indexOf(r)] || r}`
                          : r.length === 3
                            ? "All three"
                            : `Both ${r.split("").map((k) => sets[["A", "B", "C"].indexOf(k)] || k).join(" + ")}`}
                      </option>
                    ))}
                  </select>
                  <button type="button" aria-label={`Remove item ${i + 1}`} className={rowBtn}
                    onClick={() => setVenn((s) => s.filter((_, j) => j !== i))}>
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <AddRow onClick={() => setVenn((s) => [...s, { key: newKey(), label: "", region: "A" }])} />
            </>
          )}

          {type === "NODE" && (
            <>
              <p className="text-[12px] text-[var(--text-4)]">
                A <strong>leaf</strong> attaches to the nearest connection above it.
                {branchCount > 0 ? ` ${branchCount} direct connection${branchCount === 1 ? "" : "s"}.` : ""}
              </p>
              {nodes.map((row, i) => (
                <div key={row.key} className={`flex items-center gap-2 ${row.kind === "leaf" ? "pl-6" : ""}`}>
                  <select
                    value={row.kind}
                    onChange={(e) => setNodes((s) => s.map((r, j) => (j === i ? { ...r, kind: e.target.value as "branch" | "leaf" } : r)))}
                    aria-label={`Row ${i + 1} level`}
                    className="app-select-compact w-[104px] shrink-0"
                  >
                    <option value="branch">Connection</option>
                    <option value="leaf">Leaf</option>
                  </select>
                  <input
                    value={row.label}
                    onChange={(e) => setNodes((s) => s.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
                    placeholder={row.kind === "branch" ? "Connected entity" : "Detail"}
                    aria-label={`Row ${i + 1} label`}
                    className="app-input-compact min-w-0 flex-1"
                  />
                  {row.kind === "branch" && (
                    <ColorPicker
                      value={row.color}
                      index={i}
                      onChange={(c) => setNodes((s) => s.map((r, j) => (j === i ? { ...r, color: c } : r)))}
                    />
                  )}
                  <button type="button" aria-label={`Remove row ${i + 1}`} className={rowBtn}
                    onClick={() => setNodes((s) => s.filter((_, j) => j !== i))}>
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <AddRow onClick={() => setNodes((s) => [...s, { key: newKey(), kind: "leaf", label: "", color: "", link: "" }])} />
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border-2)] p-4">
        {error && <p className="mr-auto text-[13px] text-rose-600">{error}</p>}
        <button type="button" onClick={onClose}
          className="rounded-[8px] border border-[var(--border-2)] px-3 py-2 text-sm font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-1)]">
          Cancel
        </button>
        <button type="button" disabled={saving} onClick={() => void submit()}
          className="rounded-[8px] bg-[var(--brand-600)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-60">
          {saving ? "Saving…" : board ? "Save board" : "Create board"}
        </button>
      </div>
    </Modal>
  );
}

function AddRow({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-full items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-[var(--border-2)] px-3 py-2 text-[12px] font-medium text-[var(--text-3)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
    >
      <PlusIcon className="h-3.5 w-3.5" />
      Add another
    </button>
  );
}

/** Swatches, not a colour input — a board may only use the sanctioned palette, and a
 *  free colour picker is how a client's chart ends up in a hue nothing else on the page
 *  uses and dark mode has never seen. */
function ColorPicker({
  value,
  index,
  onChange,
}: {
  value: string;
  index: number;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="Colour">
      {INSIGHT_COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(value === key ? "" : key)}
          aria-label={key}
          aria-pressed={value === key}
          title={value === key ? `${key} (click to use the default)` : key}
          className={`h-4 w-4 rounded-[3px] transition ${
            value === key ? "ring-2 ring-[var(--text-1)] ring-offset-1" : "opacity-60 hover:opacity-100"
          }`}
          style={{ background: INSIGHT_MARK_COLOR[key] }}
        />
      ))}
      {!value && (
        <span className="ml-1 text-[10px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
          auto {index + 1}
        </span>
      )}
    </div>
  );
}
