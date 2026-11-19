/**
 * The wiki's top-left logo cell, the same idea as the app's own (app-shell.tsx): the Foundry
 * logo above the sidebar, as wide as the sidebar column, so the divider runs straight down from
 * the header into the sidebar and both read as one frame. Used by the team's wiki and the
 * client's link.
 *
 * ⚠️ The width is the sidebar column's: `px-2` either side of the sidebar's `md:w-[248px]`, plus
 * its 1px `md:border-r` = 265px. Change one, change the other, or the divider breaks at the header.
 */
export function WikiBrandCell({ sidebar = true }: { sidebar?: boolean }) {
  // With no sidebar below (a link shared for one section), there is no column to line up with.
  return (
    <div
      className={
        sidebar
          ? "hidden w-[265px] shrink-0 items-center border-r border-[var(--border-1)] px-5 md:flex"
          : "hidden shrink-0 items-center px-5 md:flex md:px-8"
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/foundry-logo.svg" alt="Foundry" width={245} height={64} className="h-7 w-auto dark:brightness-0 dark:invert" />
    </div>
  );
}
