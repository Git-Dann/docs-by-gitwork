import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What the team calendar asks Google for, and what it is allowed to hide.
 *
 * ── The live report ──────────────────────────────────────────────────────────
 * Dan saw two all-day "Busy" bars on his own row for 24 Sep. His calendar had no
 * such events — because `events.list` with no `eventTypes` filter ALSO returns
 * `birthday` and `workingLocation` events, and Google marks auto-created contact
 * birthdays `visibility: private`. Two duplicated contacts → two anonymous "Busy"
 * blocks, on the viewer's own calendar, for something Google itself flags
 * `transparency: transparent` (i.e. NOT busy).
 *
 * ⚠️ It also took two passes to diagnose, because the first API query used a
 * default event-type filter that excluded the very types causing it. "Not in the
 * response" is not "not on the calendar" — check what the query excluded before
 * concluding anything from an empty result.
 */

const ROOT = join(__dirname, "..", "..", "..");
const src = readFileSync(join(ROOT, "src/server/backstage-gcal.ts"), "utf8");
/** Comments contain the words the rules forbid — assert against code only. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("it asks for meetings, not everything on the calendar", () => {
  it("filters the event types at the API", () => {
    expect(code).toMatch(/eventTypes: \["default", "outOfOffice", "focusTime"\]/);
  });

  it("excludes birthdays and working location", () => {
    // Neither is a meeting. Both are all-day, so they dominate a month grid, and
    // birthdays are private-by-default which turns them into anonymous "Busy" bars.
    const listCall = code.slice(code.indexOf("events.list("), code.indexOf("});", code.indexOf("events.list(")));
    expect(listCall).not.toMatch(/birthday/i);
    expect(listCall).not.toMatch(/workingLocation/i);
  });

  it("keeps out-of-office, which IS availability", () => {
    // "School Run (Dan OOO)" is an OUT_OF_OFFICE event and is exactly the kind of
    // thing a team calendar exists to show.
    expect(code).toMatch(/"outOfOffice"/);
  });
});

describe("privacy masking protects colleagues, not you from yourself", () => {
  it("only masks when the calendar is someone else's", () => {
    expect(code).toMatch(/const isOwnCalendar = m\.user\.id === user\.id;/);
    expect(code).toMatch(/const isPrivate = ev\.visibility === "private" && !isOwnCalendar;/);
  });

  it("still masks a colleague's private title", () => {
    // The guard must narrow the mask, not remove it.
    expect(code).toMatch(/isPrivate \? "Busy"/);
  });

  it("still withholds the join link on a masked event", () => {
    // A masked block must not carry a link that reveals the meeting.
    expect(code).toMatch(/const meetLink = isPrivate\s*\n?\s*\? null/);
  });
});
