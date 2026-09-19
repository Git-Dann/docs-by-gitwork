import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVENT_ROUTING,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  type NotificationEvent,
} from "@/server/notification-events";

// A phone is the most interrupting surface Foundry has, and the notification feed has a
// measured read rate of 0 out of 104 over 30 days for the two people who receive the
// most. Bridging APNs onto the existing `push` channel would therefore have converted
// ~51 unread in-app rows per admin per month into ~51 phone alerts per month — the
// fastest possible way to make the new channel worth muting on day one.
//
// So `mobile` is its own channel, and an event reaches a phone only by being listed
// deliberately. These tests are what keep that true: the routing table is edited often
// and adding `"mobile"` to an event is a one-word change that nothing else would catch.

describe("the mobile channel is opt-in, not inherited", () => {
  it("is a distinct channel from browser push", () => {
    expect(NOTIFICATION_CHANNELS).toContain("mobile");
    expect(NOTIFICATION_CHANNELS).toContain("push");
  });

  // ⚠️ THE LOAD-BEARING TEST. If you are here because this failed, you added `mobile`
  // to an event's default routing — which rings every admin's phone for that event,
  // for everyone, by default. That may well be right, but it is a decision: add the
  // event to ALLOWED_ON_PHONE_BY_DEFAULT below with a reason, rather than deleting
  // this test.
  const ALLOWED_ON_PHONE_BY_DEFAULT: NotificationEvent[] = [];

  it("no event rings a phone by default", () => {
    const ringing = NOTIFICATION_EVENTS.filter(
      (event) =>
        DEFAULT_EVENT_ROUTING[event].includes("mobile") &&
        !ALLOWED_ON_PHONE_BY_DEFAULT.includes(event),
    );
    expect(ringing).toEqual([]);
  });

  // The mirror, and the reason the above is not simply "mobile is unused": the channel
  // has to be routable, or the opt-in it exists to support could not be expressed.
  it("mobile is a legal value in the routing table's type", () => {
    const sample: (typeof NOTIFICATION_CHANNELS)[number][] = ["inApp", "mobile"];
    expect(sample).toContain("mobile");
  });

  it("every event still has explicit routing, so nothing falls back silently", () => {
    for (const event of NOTIFICATION_EVENTS) {
      expect(DEFAULT_EVENT_ROUTING[event], `${event} has no routing`).toBeDefined();
      expect(DEFAULT_EVENT_ROUTING[event].length).toBeGreaterThan(0);
    }
  });

  // `inApp` is the baseline that always works and is the only record a user can go back
  // to. An event delivered ONLY to a phone would vanish the moment the alert is swiped.
  it("no event is phone-only — the feed always keeps a copy", () => {
    const phoneOnly = NOTIFICATION_EVENTS.filter(
      (event) =>
        DEFAULT_EVENT_ROUTING[event].includes("mobile") &&
        !DEFAULT_EVENT_ROUTING[event].includes("inApp"),
    );
    expect(phoneOnly).toEqual([]);
  });
});
