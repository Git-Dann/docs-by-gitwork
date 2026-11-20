"use client";

/**
 * The Board, loading its cards on its own: the wiki (team's and client's) carries only a summary
 * now, because the cards were a quarter of a megabyte on every wiki page (CLAUDE.md §140).
 */
import type { ComponentProps } from "react";
import { LoadingState } from "@/components/ui/motion/loading-state";
import { useBoardCards } from "@/hooks/use-wiki-board";
import { WikiBoardSectionView } from "./wiki-board-section";

export function BoardCards(props: Omit<ComponentProps<typeof WikiBoardSectionView>, "section">) {
  const board = useBoardCards(props.target);
  if (board.isPending) return <LoadingState label="Loading the board" />;
  if (board.isError) {
    return (
      <p role="alert" className="text-[13px] text-[var(--danger-500)]">
        {board.error instanceof Error ? board.error.message : "Couldn't load the board"}
      </p>
    );
  }
  return <WikiBoardSectionView section={board.data} {...props} />;
}
