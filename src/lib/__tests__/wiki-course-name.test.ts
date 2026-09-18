/**
 * Only a course the GOLFER named may reach the wiki.
 *
 * Every fixture below is a **verbatim slice of a real Wedge row** — the three fabrications
 * Luke's report surfaced, and the genuine requests that must keep working. Fixtures
 * invented to suit the implementation are what let the original defect through a passing
 * suite (§42.10), so they are copied from production here.
 */
import { describe, expect, it } from "vitest";
import { checkCourseName, distinctiveTokens, golferMessage } from "@/lib/wiki-course-name";

/** The notification wrapper Big Wedge sends, including the `From:`/`Email:` headers. */
function feedback(from: string, email: string, message: string): string {
  return [
    "New Feedback Received",
    "Hello Admin,",
    "A new feedback submission has been received on Big Wedge Golf.",
    `From: ${from}`,
    `Email: ${email}`,
    "Submitted: 2026-06-27 06:14:38",
    "Message:",
    message,
    "This is an automated notification from Big Wedge Golf",
  ].join("\n");
}

describe("names the golfer never wrote", () => {
  it('rejects "home course"', () => {
    const body = feedback(
      "Josh Roberts",
      "josh.roberts306@gmail.com",
      "My home course has very incorrect information, both the distance to where the club is.",
    );
    expect(checkCourseName("home course", body)).toEqual({
      usable: false,
      reason: "placeholder",
    });
  });

  it('rejects a name stitched out of the complaint ("HS2 Renovated Course (Home Course)")', () => {
    const body = feedback(
      "Harry Davenport",
      "harryd2304@gmail.com",
      "My home course was renovated due to hs2 and now your app is out of date for going round my course.",
    );
    // Every word of it IS in the message — which is why the containment check alone
    // cannot catch this one, and the placeholder phrase check must.
    expect(checkCourseName("HS2 Renovated Course (Home Course)", body).usable).toBe(false);
  });

  it("rejects a name taken from the sender's email domain", () => {
    // ⚠️ The killer detail: "ardlodge" IS present in the raw body, in the `Email:`
    // header. Only stripping the wrapper first catches this.
    const body = feedback(
      "Craig Stewart",
      "craig@ardlodge.co.uk",
      "First time using the app and I loved it. Only thing is the gps and scorecard for my home course is incorrect.",
    );
    expect(body).toContain("ardlodge");
    expect(checkCourseName("Ardlodge", body)).toEqual({
      usable: false,
      reason: "not-in-message",
    });
  });

  it("rejects names made only of words every course shares", () => {
    const body = feedback("A", "a@b.com", "please add the golf club near me");
    for (const n of ["Golf Club", "The Course", "golf course", "n/a", "Unknown"]) {
      expect(checkCourseName(n, body).usable, n).toBe(false);
    }
  });

  it("rejects an empty name", () => {
    expect(checkCourseName("   ", feedback("A", "a@b.com", "x"))).toEqual({
      usable: false,
      reason: "empty",
    });
  });
});

describe("genuine requests still get through", () => {
  it("accepts a course the golfer asked for by name", () => {
    const body = feedback(
      "Harry",
      "harrymarshall4444@gmail.com",
      "I have noticed a missing course on the app in my area. The course is wyboston lakes golf and the address is Great N Rd, Wyboston.",
    );
    expect(checkCourseName("Wyboston Lakes Golf", body)).toEqual({ usable: true });
  });

  it("accepts a data complaint that names its course", () => {
    const body = feedback(
      "David Scott",
      "davidmscott14@gmail.com",
      "Member at Brechin Golf Course here. Just to let you know your course map is incorrect.",
    );
    expect(checkCourseName("Brechin Golf Course", body)).toEqual({ usable: true });
  });

  it("accepts a rename where only the new name is given", () => {
    const body = feedback(
      "Jacob Sempert",
      "jsempert30@outlook.com",
      "the TAN TARA Golf course is now Pendleton Creek golf course",
    );
    expect(checkCourseName("Pendleton Creek Golf Course", body)).toEqual({ usable: true });
  });

  it("accepts when the model corrects a typo in the course's own name", () => {
    // ⚠️ This is why ONE distinctive token must match rather than ALL of them, and the
    // fixture has to be able to tell those apart. An earlier version used
    // "Iver Golf Vlub" → "Iver Golf Club", which does NOT: "golf" and "club" are generic,
    // so the name reduces to the single token ["iver"] and `some` === `every`. Swapping
    // the implementation to `every` left all 13 tests green — a fixture that cannot
    // distinguish the bug from the fix is not covering it (§42.10).
    //
    // Two distinctive tokens, one of them misspelled by the golfer, is the real shape:
    // misspelled course names are the norm in this data (§45.3).
    const body = feedback("A", "a@b.com", "please add Wybostn Lakes Golf, its missing");
    expect(distinctiveTokens("Wyboston Lakes Golf")).toEqual(["wyboston", "lakes"]);
    expect(body).not.toContain("Wyboston"); // the golfer typed it wrong
    expect(checkCourseName("Wyboston Lakes Golf", body)).toEqual({ usable: true });
  });

  it('does not treat "home" inside a real name as a placeholder', () => {
    const body = feedback("A", "a@b.com", "Home Farm Golf Club is missing from the app");
    expect(checkCourseName("Home Farm Golf Club", body)).toEqual({ usable: true });
  });
});

describe("helpers", () => {
  it("strips the notification wrapper, headers included", () => {
    const body = feedback("Craig Stewart", "craig@ardlodge.co.uk", "the gps is wrong");
    const msg = golferMessage(body);
    expect(msg).toBe("the gps is wrong");
    expect(msg).not.toContain("ardlodge");
    expect(msg).not.toContain("automated notification");
  });

  it("falls back to the whole body when the wrapper is missing", () => {
    // A format change must cost the check, not the import — the permissive direction.
    expect(golferMessage("please add Foo Golf Club")).toBe("please add Foo Golf Club");
  });

  it("keeps only identifying words", () => {
    expect(distinctiveTokens("Brechin Golf Course")).toEqual(["brechin"]);
    expect(distinctiveTokens("The Golf Club")).toEqual([]);
  });
});
