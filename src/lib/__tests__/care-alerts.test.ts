import { describe, expect, it } from "vitest";
import { connectorAlertWords, isLongWait, LONG_WAIT_HOURS, waitAlert, waitAlertWords } from "@/lib/care-alerts";

const NOW = new Date("2026-11-20T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

describe("a desk goes into alarm once, and comes out once", () => {
  it("fires when the oldest wait passes the threshold", () => {
    const alert = waitAlert({ oldestAwaitingAt: hoursAgo(26), alertedAt: null, now: NOW });
    expect(alert).toMatchObject({ kind: "waiting_too_long", hours: 26 });
  });

  it("says nothing while the wait is still inside the threshold", () => {
    expect(waitAlert({ oldestAwaitingAt: hoursAgo(23), alertedAt: null, now: NOW })).toBeNull();
  });

  it("does not fire again while it is still in alarm", () => {
    /*
     * The whole point of the latch. Without it the every-minute worker pages someone every
     * minute the desk is behind, which trains people to mute it — and a muted alert is worse
     * than no alert, because it looks like cover.
     */
    expect(waitAlert({ oldestAwaitingAt: hoursAgo(99), alertedAt: hoursAgo(10), now: NOW })).toBeNull();
  });

  it("clears when the desk catches up", () => {
    expect(waitAlert({ oldestAwaitingAt: null, alertedAt: hoursAgo(5), now: NOW })).toEqual({ kind: "caught_up" });
  });

  it("clears when the oldest wait drops back under the threshold", () => {
    expect(waitAlert({ oldestAwaitingAt: hoursAgo(2), alertedAt: hoursAgo(5), now: NOW })).toEqual({ kind: "caught_up" });
  });

  it("does NOT clear while someone is still over the threshold", () => {
    // Answering one thread while an older one is still waiting is not catching up. The alert is
    // about the oldest wait, which is the figure a person would act on.
    expect(waitAlert({ oldestAwaitingAt: hoursAgo(40), alertedAt: hoursAgo(5), now: NOW })).toBeNull();
  });

  it("says nothing about an empty desk that was never in alarm", () => {
    expect(waitAlert({ oldestAwaitingAt: null, alertedAt: null, now: NOW })).toBeNull();
  });

  it("an unparseable latch is treated as not in alarm, so the alert can still fire", () => {
    // "We cannot tell whether we told anyone" must not mean "assume we did" — that would lose
    // the alert entirely, which is the failure that matters (§35).
    expect(waitAlert({ oldestAwaitingAt: hoursAgo(30), alertedAt: "not a date", now: NOW })).toMatchObject({
      kind: "waiting_too_long",
    });
  });

  it("fires exactly at the threshold, not an hour after it", () => {
    expect(waitAlert({ oldestAwaitingAt: hoursAgo(LONG_WAIT_HOURS), alertedAt: null, now: NOW })).not.toBeNull();
    expect(waitAlert({ oldestAwaitingAt: hoursAgo(LONG_WAIT_HOURS - 0.5), alertedAt: null, now: NOW })).toBeNull();
  });
});

describe("the threshold is the one the screen uses", () => {
  it("isLongWait and waitAlert agree, on every side of the line", () => {
    /*
     * They must: the chip on Care home and the alert in someone's pocket are the same claim. Two
     * thresholds is how a screen and an alert come to disagree about what "too long" means.
     */
    for (const h of [0, 1, 23, 23.9, 24, 24.1, 48, 500]) {
      const iso = hoursAgo(h);
      const chip = isLongWait(iso, NOW.getTime());
      const alert = waitAlert({ oldestAwaitingAt: iso, alertedAt: null, now: NOW }) !== null;
      expect(alert, `${h}h: chip=${chip} alert=${alert}`).toBe(chip);
    }
  });
});

describe("what it says", () => {
  it("names the client and how long, in days once it is days", () => {
    const words = waitAlertWords({ kind: "waiting_too_long", waitingSince: hoursAgo(50), hours: 50 }, "Fellas Loaded");
    expect(words.title).toBe("Fellas Loaded: a customer has waited 2 days");
    expect(words.body).toContain("Care has not replied");
  });

  it("uses hours while it is still hours", () => {
    const words = waitAlertWords({ kind: "waiting_too_long", waitingSince: hoursAgo(26), hours: 26 }, "Acme");
    expect(words.title).toBe("Acme: a customer has waited 1 day");
  });

  it("a connector alert leads with the provider's own reason", () => {
    const words = connectorAlertWords({
      clientName: "Fellas Loaded",
      label: "support@fellasloaded.com",
      recovered: false,
      reason: "The mailbox rejected the password.",
    });
    expect(words.title).toContain("has stopped delivering");
    expect(words.body.startsWith("The mailbox rejected the password.")).toBe(true);
    // The consequence, which is the part a reader needs: an empty queue is not reassurance.
    expect(words.body).toContain("look quiet whether or not it is");
  });

  it("a connector alert with no reason still says what it means", () => {
    const words = connectorAlertWords({ clientName: "Acme", label: "Email", recovered: false, reason: null });
    expect(words.body).not.toContain("null");
    expect(words.body).toContain("No mail is arriving");
  });

  it("recovery says the gap was filled, because that is the question it raises", () => {
    const words = connectorAlertWords({ clientName: "Acme", label: "Email", recovered: true });
    expect(words.title).toContain("delivering again");
    expect(words.body).toContain("while it was down");
  });
});
