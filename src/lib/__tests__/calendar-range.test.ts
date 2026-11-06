import { describe, expect, it } from "vitest";
import { MAX_RANGE_DAYS, parseCalendarRange, toAppEvent } from "@/lib/calendar-range";

describe("parseCalendarRange", () => {
  it("accepts an ordered range and refuses bad ones", () => {
    expect(parseCalendarRange("2026-11-02T00:00:00Z", "2026-11-09T00:00:00Z")).not.toBeNull();
    expect(parseCalendarRange("2026-11-09T00:00:00Z", "2026-11-02T00:00:00Z")).toBeNull();
    expect(parseCalendarRange("nonsense", null)).toBeNull();
    expect(parseCalendarRange("2026-01-01T00:00:00Z", `2026-0${3}-${10}T00:00:00Z`)).toBeNull();
  });

  it("defaults to a week from today", () => {
    const r = parseCalendarRange(null, null, new Date(2026, 10, 4, 15))!;
    expect(r.to.getTime() - r.from.getTime()).toBe(7 * 24 * 3600e3);
    expect(MAX_RANGE_DAYS).toBe(62);
  });
});

describe("toAppEvent", () => {
  const base = { id: "e1", summary: "Fellas x Gitwork", start: { dateTime: "2026-11-04T14:30:00Z" }, end: { dateTime: "2026-11-04T15:00:00Z" } };

  it("maps a meeting, with its video link and other attendees", () => {
    const e = toAppEvent({ ...base, hangoutLink: "https://meet.google.com/abc", attendees: [{ self: true, responseStatus: "accepted" }, { responseStatus: "accepted" }] });
    expect(e).toMatchObject({ id: "e1", title: "Fellas x Gitwork", allDay: false, meetLink: "https://meet.google.com/abc", attendees: 1 });
  });

  it("keeps solo blocks and all-day events (unlike the Desk list)", () => {
    expect(toAppEvent({ ...base, attendees: [] })).not.toBeNull();
    const allDay = toAppEvent({ id: "d", summary: "Bank holiday", start: { date: "2026-12-25" }, end: { date: "2026-12-26" } });
    expect(allDay).toMatchObject({ allDay: true, start: "2026-12-25", end: "2026-12-26" });
  });

  it("drops declined, cancelled and working-location events", () => {
    expect(toAppEvent({ ...base, attendees: [{ self: true, responseStatus: "declined" }] })).toBeNull();
    expect(toAppEvent({ ...base, status: "cancelled" })).toBeNull();
    expect(toAppEvent({ ...base, eventType: "workingLocation" })).toBeNull();
  });

  it("names an untitled event", () => {
    expect(toAppEvent({ ...base, summary: "  " })?.title).toBe("Busy");
  });
});
