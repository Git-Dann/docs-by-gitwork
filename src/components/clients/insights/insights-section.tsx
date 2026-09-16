"use client";

/**
 * Insights — the charts and diagrams a Gitwork user authors for a client.
 *
 * One component for both audiences: `mode` decides whether the authoring controls render,
 * and nothing else. The figures themselves are the same code for the team and the client,
 * so the two can never be shown different numbers for the same board (§42.4).
 */

import { useState } from "react";
import { PencilSquareIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import type { WikiInsightBoardRecord } from "@/server/wiki-insights";
import {
  InsightBarChart,
  InsightNodeMap,
  InsightPieChart,
  InsightVennChart,
} from "./insight-charts";
import { BoardEditorModal, type BoardDraft } from "./board-editor-modal";
import {
  useCreateInsightBoard,
  useDeleteInsightBoard,
  useUpdateInsightBoard,
} from "@/hooks/use-wiki";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
const SERIF = "var(--font-display), 'Times New Roman', Georgia, serif";

const KIND_LABEL: Record<WikiInsightBoardRecord["kind"], string> = {
  bar: "Bar chart",
  pie: "Pie chart",
  venn: "Venn diagram",
  node: "Node diagram",
};

function BoardFigure({ board }: { board: WikiInsightBoardRecord }) {
  switch (board.kind) {
    case "bar":
      return <InsightBarChart points={board.points} unit={board.unit} />;
    case "pie":
      return <InsightPieChart points={board.points} unit={board.unit} />;
    case "venn":
      return <InsightVennChart sets={board.sets} items={board.items} />;
    case "node":
      return <InsightNodeMap core={board.core} branches={board.branches} />;
  }
}

/** Roman-numeral-free two-digit index, matching the wiki's other numbered panels. */
const pad = (n: number) => String(n).padStart(2, "0");

export function WikiInsightsSectionView({
  slug,
  boards,
  mode,
}: {
  slug: string;
  boards: WikiInsightBoardRecord[];
  mode: "internal" | "public";
}) {
  const isInternal = mode === "internal";
  const createBoard = useCreateInsightBoard(slug);
  const updateBoard = useUpdateInsightBoard(slug);
  const deleteBoard = useDeleteInsightBoard(slug);
  const [editing, setEditing] = useState<{ board: WikiInsightBoardRecord | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function save(draft: BoardDraft, boardId: string | null) {
    if (boardId) await updateBoard.mutateAsync({ boardId, input: draft });
    else await createBoard.mutateAsync(draft);
  }

  return (
    <div className="space-y-4">
      {isInternal && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-[var(--text-3)]">
            Charts and diagrams for this client. They see exactly what you see here.
          </p>
          <button
            type="button"
            onClick={() => setEditing({ board: null })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] bg-[var(--brand-600)] px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-[var(--brand-700)]"
          >
            <PlusIcon className="h-4 w-4" />
            New board
          </button>
        </div>
      )}

      {boards.length === 0 ? (
        <section className="widget-card">
          <div className="p-8 text-center">
            <p className="text-sm text-[var(--text-4)]">
              {isInternal
                ? "No boards yet. A bar, pie, Venn or node diagram — whatever explains the thing best."
                : "Nothing here yet."}
            </p>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          {boards.map((board, i) => (
            <section key={board.id} className="widget-card">
              <div className="widget-header">
                <span className="widget-header__label" style={{ fontFamily: MONO }}>
                  <span className="widget-header__label--number">{pad(i + 1)}</span>
                  {` // ${board.title.toUpperCase()}`}
                </span>
                <span
                  className="widget-header__status"
                  style={{ fontFamily: MONO }}
                  title={KIND_LABEL[board.kind]}
                >
                  {KIND_LABEL[board.kind]}
                </span>
              </div>
              <div className="p-5">
                <BoardFigure board={board} />
                {board.caption ? (
                  // The caption is the most important field on a hand-authored chart —
                  // a figure with no sentence saying what it shows is a decoration.
                  <p
                    className="mt-4 border-t border-[var(--border-2)] pt-3 text-[14px] leading-6 text-[var(--text-2)]"
                    style={{ fontFamily: SERIF }}
                  >
                    {board.caption}
                  </p>
                ) : null}
                {isInternal && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border-2)] pt-3">
                    <button
                      type="button"
                      onClick={() => setEditing({ board })}
                      className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--border-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                      Edit
                    </button>
                    {/* Two-step: a board is minutes of typing and deleting it cannot be
                        undone, which is the same reason the Requests delete is two-step. */}
                    {confirmDelete === board.id ? (
                      <span className="inline-flex items-center gap-1.5 rounded-[7px] border border-rose-300 bg-rose-50 px-2 py-1.5">
                        <span className="text-[12px] font-medium text-rose-700">
                          Delete this board?
                        </span>
                        <button
                          type="button"
                          disabled={deleteBoard.isPending}
                          onClick={async () => {
                            await deleteBoard.mutateAsync(board.id);
                            setConfirmDelete(null);
                          }}
                          className="rounded-[6px] bg-rose-600 px-2 py-0.5 text-[12px] font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="px-1 text-[12px] text-[var(--text-4)] transition hover:text-[var(--text-1)]"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(board.id)}
                        aria-label={`Delete ${board.title}`}
                        className="inline-flex items-center rounded-[7px] border border-[var(--border-2)] px-2 py-1.5 text-[var(--text-4)] transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {isInternal && editing && (
        <BoardEditorModal
          open
          board={editing.board}
          onClose={() => setEditing(null)}
          onSave={async (draft) => {
            await save(draft, editing.board?.id ?? null);
            setEditing(null);
          }}
          saving={createBoard.isPending || updateBoard.isPending}
        />
      )}
    </div>
  );
}
