import { describe, expect, it } from "vitest";
import {
  clientLocalHour,
  isWithinClientPushHours,
  standupPushCopy,
  standupReceiptKey,
} from "../client-notifications";
import { asApnsEnvironment } from "../transport";

/**
 * The client standup push has three rules that a reader would not guess from the
 * code, and each one is the difference between a feature people keep and one they
 * switch off in week one.
 */

describe("quiet hours", () => {
  /**
   * ⚠️ THE RULE THIS FEATURE EXISTS AROUND. The developers are in Islamabad
   * (UTC+5) and the clients are in the UK, so a 09:00 standup in Pakistan is a
   * 04:00 or 05:00 push in London. Fanning that straight out wakes people up.
   */
  it("refuses a push at the hour a Pakistani morning standup actually lands in the UK", () => {
    // 09:00 Islamabad on a January day = 04:00 UTC = 04:00 London.
    const pakistaniMorning = new Date("2026-01-14T04:00:00Z");
    expect(clientLocalHour(pakistaniMorning)).toBe(4);
    expect(isWithinClientPushHours(pakistaniMorning)).toBe(false);
  });

  it("allows the hours a client is actually awake, and refuses the ones they are not", () => {
    const at = (hour: number) =>
      isWithinClientPushHours(new Date(`2026-01-14T${String(hour).padStart(2, "0")}:00:00Z`));
    // Boundaries, both inclusive-exclusive as written.
    expect(at(6)).toBe(false);
    expect(at(7)).toBe(true);
    expect(at(20)).toBe(true);
    expect(at(21)).toBe(false);
    expect(at(23)).toBe(false);
    expect(at(0)).toBe(false);
  });

  /**
   * ⚠️ The window is read in the CLIENT's timezone, not the server's. London is
   * UTC+1 in summer, so a 20:30 UTC send is 21:30 locally and must be refused —
   * a check written against UTC would let it through for half the year.
   */
  it("reads the clock in the client's timezone, not UTC", () => {
    const summerEvening = new Date("2026-07-14T20:30:00Z"); // 21:30 in London
    expect(clientLocalHour(summerEvening)).toBe(21);
    expect(isWithinClientPushHours(summerEvening)).toBe(false);

    const winterEvening = new Date("2026-01-14T20:30:00Z"); // 20:30 in London
    expect(clientLocalHour(winterEvening)).toBe(20);
    expect(isWithinClientPushHours(winterEvening)).toBe(true);
  });
});

describe("one push per client per phase per day", () => {
  /**
   * The receipt key IS the dedupe unit — it is written into a unique index, so
   * anything that makes two developers on the same day produce different keys
   * un-does the whole guard and the client gets one alert per developer.
   */
  it("gives every developer on the same client, day and phase the same key", () => {
    const day = new Date("2026-10-21T00:00:00Z");
    expect(standupReceiptKey("AM", day)).toBe("standup:AM:2026-10-21");
    // Two developers pushing at different moments of the same work day.
    expect(standupReceiptKey("AM", new Date("2026-10-21T00:00:00Z"))).toBe(
      standupReceiptKey("AM", day),
    );
  });

  it("separates the phases and the days, so a client still gets both updates", () => {
    const day = new Date("2026-10-21T00:00:00Z");
    expect(standupReceiptKey("PM", day)).not.toBe(standupReceiptKey("AM", day));
    expect(standupReceiptKey("AM", new Date("2026-10-22T00:00:00Z"))).not.toBe(
      standupReceiptKey("AM", day),
    );
  });
});

describe("what the alert says", () => {
  /**
   * ⚠️ No counts. The push fires on the FIRST developer of the phase, so a number
   * taken at that moment ("3 updates") is already wrong by the time the client
   * opens the app — and a figure that contradicts the screen behind it is worse
   * than no figure at all.
   */
  it("never claims a number, because the number is wrong by the time it is read", () => {
    for (const phase of ["AM", "PM"] as const) {
      const { title, body } = standupPushCopy(phase);
      expect(`${title} ${body}`).not.toMatch(/\d/);
    }
  });

  it("tells the morning and the afternoon apart", () => {
    expect(standupPushCopy("AM").title).not.toBe(standupPushCopy("PM").title);
    expect(standupPushCopy("AM").body).toMatch(/working on/i);
    expect(standupPushCopy("PM").body).toMatch(/moved/i);
  });
});

describe("the environment a device reports", () => {
  /**
   * ⚠️ Self-reported by the app and already wrong once in production: a build
   * matched its provisioning profile's `aps-environment` against a string with one
   * tab where real profiles use two, so every build reported "sandbox" and live
   * tokens were soft-deleted as dead. Anything unrecognised must fall somewhere
   * definite, and the dual-gateway retry recovers from a wrong guess.
   */
  it("narrows anything unrecognised rather than passing it through", () => {
    expect(asApnsEnvironment("production")).toBe("production");
    expect(asApnsEnvironment("sandbox")).toBe("sandbox");
    expect(asApnsEnvironment("Production")).toBe("sandbox");
    expect(asApnsEnvironment("")).toBe("sandbox");
    expect(asApnsEnvironment("whatever the app sent")).toBe("sandbox");
  });
});
