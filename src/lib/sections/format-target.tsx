"use client";

/**
 * The editor's ONE formatting bar needs to know what is focused. This is that registry.
 *
 * Foundry has many independent editable fields on the canvas — every block's title, caption and
 * body, plus the rail's own inputs — and a persistent toolbar has to act on whichever one the
 * cursor is in. So each editable field registers itself while focused, and the bar reads the
 * registration.
 *
 * Two properties this design exists to give:
 *
 *  · **Honest enablement.** A field declares which COMMANDS it supports, so the bar can show a
 *    control active only when it would actually do something. A bar that is always lit but
 *    silently does nothing is worse than no bar — it teaches people that the buttons are broken.
 *    A plain-string field supports Markdown-ish wrapping and bullets; a rich field supports its
 *    own set; a numeric input supports none, so the bar sits inert.
 *
 *  · **Focus survives a click.** Pressing a toolbar button would ordinarily blur the field and
 *    destroy the selection before the command ran. `formatButtonMouseDown` is the one-line guard
 *    every control must use — see its docstring; it is the single most common way a toolbar like
 *    this ships broken.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

/** Everything the bar can offer. A target opts in to the subset it genuinely supports. */
export type FormatCommand = "bold" | "italic" | "link" | "code" | "bullets";

export interface FormatTarget {
  /** Stable id for the focused field, so re-registration of the same field is a no-op. */
  id: string;
  /** Which controls should be live while this field holds focus. */
  commands: ReadonlySet<FormatCommand>;
  run: (command: FormatCommand) => void;
}

interface FormatTargetContextValue {
  target: FormatTarget | null;
  register: (target: FormatTarget) => void;
  /** Clears only if `id` is still the registered target — see `unregister` below. */
  unregister: (id: string) => void;
}

const FormatTargetContext = createContext<FormatTargetContextValue | null>(null);

export function FormatTargetProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<FormatTarget | null>(null);
  const currentId = useRef<string | null>(null);

  const register = useCallback((next: FormatTarget) => {
    currentId.current = next.id;
    setTarget(next);
  }, []);

  /**
   * Guarded by id because focus MOVES between fields: tabbing from A to B fires B's focus before
   * A's blur, so an unconditional clear would wipe the newly-focused field and leave the bar dead
   * exactly when it should be live.
   */
  const unregister = useCallback((id: string) => {
    if (currentId.current !== id) return;
    currentId.current = null;
    setTarget(null);
  }, []);

  const value = useMemo(
    () => ({ target, register, unregister }),
    [target, register, unregister],
  );

  return <FormatTargetContext.Provider value={value}>{children}</FormatTargetContext.Provider>;
}

/**
 * Read the focused field. Returns null outside a provider RATHER THAN THROWING, because the
 * editable field components are also rendered on the public share page and in the PDF route,
 * where there is no toolbar and no provider. Formatting simply isn't offered there.
 */
export function useFormatTarget(): FormatTarget | null {
  return useContext(FormatTargetContext)?.target ?? null;
}

/** For an editable field: register while focused. Safe to call outside a provider. */
export function useFormatTargetRegistration() {
  const context = useContext(FormatTargetContext);
  return {
    register: context?.register ?? noop,
    unregister: context?.unregister ?? noop,
    enabled: Boolean(context),
  };
}

function noop() {}

/**
 * ⚠️ REQUIRED on every toolbar control.
 *
 * A `mousedown` on a button moves focus out of the text field, and the browser discards the
 * selection as it goes — so by the time `click` fires there is nothing to format and the caret
 * has moved. Preventing the default on `mousedown` stops focus leaving at all, which is why the
 * command still has a live selection to act on.
 *
 * This is the single most common way a persistent formatting bar ships subtly broken: it works
 * when you test it with a whole field selected and fails on a mid-sentence selection.
 */
export function formatButtonMouseDown(event: MouseEvent<HTMLElement>) {
  event.preventDefault();
}
