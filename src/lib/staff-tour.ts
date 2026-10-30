/**
 * The first-visit tour of Staff for HR (docs/hr-platform.md). Pure, so the rule for when it
 * opens on its own is testable without a browser.
 *
 * "Seen" is remembered per browser. That is deliberate: a tour is a per-viewer convenience,
 * and a person who clears their browser seeing it once more costs nothing.
 */

export const STAFF_TOUR_KEY = "foundry.tour.staff-hr.v1";

/**
 * Opens on its own only for someone with HR access, on the active list, once the team has
 * loaded (the tour points at the cards, so it must have cards to point at), and never twice.
 */
export function shouldAutoOpenStaffTour(input: {
  canManageHr: boolean;
  archived: boolean;
  hasPeople: boolean;
  seen: boolean;
}): boolean {
  return input.canManageHr && !input.archived && input.hasPeople && !input.seen;
}

export function readTourSeen(storage: Pick<Storage, "getItem"> | null | undefined): boolean {
  try {
    // Unreadable storage counts as seen: a tour that reopens on every visit is worse than none.
    return storage ? storage.getItem(STAFF_TOUR_KEY) === "1" : true;
  } catch {
    return true;
  }
}

export function markTourSeen(storage: Pick<Storage, "setItem"> | null | undefined): void {
  try {
    storage?.setItem(STAFF_TOUR_KEY, "1");
  } catch {
    // Private mode or blocked storage: the tour just may show again.
  }
}
