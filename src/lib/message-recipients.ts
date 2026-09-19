/**
 * What the recipient field says once the names are behind a dropdown.
 *
 * The picker collapses a 29-person roster into one control, so this line is the only
 * place the choice is visible — it has to name people, not just count them. A control
 * reading "4 selected" makes you reopen it to find out whether you picked the right
 * four, which is the check you most want to make just before sending to everyone's
 * phone.
 */

/** How many names to print before falling back to "+N". Two fit a 390px field. */
const NAMES_SHOWN = 2;

export function summariseRecipients(pickedNames: string[], totalPeople: number): string {
  const names = pickedNames.filter((n) => n.trim());
  if (names.length === 0) return "Choose people";

  // "Everyone" is worth saying outright: sending to the whole company is the one choice
  // you should never make by accident, so it should never look like an ordinary list.
  // No `totalPeople > 0` guard: an empty selection has already returned above, so the
  // two can only be equal when both are real. (A sabotage adding one changed nothing,
  // which is how the dead branch was found.)
  if (names.length === totalPeople) return `Everyone (${totalPeople})`;

  if (names.length <= NAMES_SHOWN) return names.join(" and ");
  return `${names.slice(0, NAMES_SHOWN).join(", ")} +${names.length - NAMES_SHOWN}`;
}

/** Case- and accent-insensitive contains, for the picker's filter box. */
export function matchesPerson(query: string, name: string, email: string): boolean {
  const norm = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  const q = norm(query);
  if (!q) return true;
  return norm(name).includes(q) || norm(email).includes(q);
}
