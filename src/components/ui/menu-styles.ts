/**
 * The house popover: the panel an anchored dropdown draws, and the rows inside it.
 *
 * These strings were written out three times (course-requests, design-system and, with
 * two additions, wiki-workspace). Two were byte-identical, which is how a "shared" look
 * drifts: change one and the others silently disagree. Declared once here so a popover
 * added anywhere starts out matching the ones already shipped.
 *
 * Paired with Headless UI's `anchor` prop — see `menuPanel`'s own note.
 */

/**
 * ⚠️ Use this with `anchor={…}`, which portals the panel to the document body. Inside a
 * dialog or a card the panel would otherwise be clipped: `overflow-y: auto` forces
 * `overflow-x: auto`, so any scrolling ancestor cuts it off on both axes — and that cut
 * reports no page overflow, so nothing catches it.
 */
export const menuPanel =
  "z-50 mt-1.5 rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-white p-1.5 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.18)] focus:outline-none";

/** A row inside `menuPanel`. `data-[focus]` is Headless UI's keyboard-focus state. */
export const menuItem =
  "flex w-full items-center rounded-[6px] px-2.5 py-1.5 text-left text-[13px] text-[var(--text-2)] transition data-[focus]:bg-[var(--surface-1)] hover:bg-[var(--surface-1)]";
