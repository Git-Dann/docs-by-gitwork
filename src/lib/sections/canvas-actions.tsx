"use client";

/**
 * What a field can ask the CANVAS to do, without knowing which block it lives in.
 *
 * The slash menu needs two things a rich-text field cannot know by itself: which section it is
 * inside, and how to add a block after it. The obvious route — thread a prop down — would mean
 * widening the `Preview` signature of all 38 registry blocks so that two of them can pass it on.
 * A context supplied by the block wrapper is the same shape `format-target.tsx` already uses for
 * the formatting toolbar: the block knows its own identity, the field opts in, nothing in between
 * has to care.
 *
 * Null outside the editor canvas, which is what makes this safe by construction: the public,
 * print and preview renders provide no context, so a field there has no slash menu to open.
 */

import { createContext, useContext, type ReactNode } from "react";

export interface CanvasActions {
  /** Add a block directly after the one this field is inside. */
  insertAfter: () => void;
}

const CanvasActionsContext = createContext<CanvasActions | null>(null);

export function CanvasActionsProvider({
  actions,
  children,
}: {
  actions: CanvasActions;
  children: ReactNode;
}) {
  return <CanvasActionsContext.Provider value={actions}>{children}</CanvasActionsContext.Provider>;
}

/** `null` when this field is not on an editable canvas — the public view, print, the PDF. */
export function useCanvasActions(): CanvasActions | null {
  return useContext(CanvasActionsContext);
}
