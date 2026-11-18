import { describe, expect, it } from "vitest";
import { nowOrNext, startsIn } from "../hq-calendar";

const now = new Date("2026-11-18T10:00:00Z");
const ev = (id: string, start: string, end: string) => ({ id, start, end });

describe("HQ calendar: now / next", () => {
  it("prefers a meeting happening now", () => {
    const r = nowOrNext([ev("a", "2026-11-18T11:00:00Z", "2026-11-18T11:30:00Z"), ev("b", "2026-11-18T09:45:00Z", "2026-11-18T10:15:00Z")], now);
    expect(r).toMatchObject({ event: { id: "b" }, live: true });
  });

  it("otherwise the soonest future meeting, ignoring finished and all-day ones", () => {
    const r = nowOrNext(
      [ev("past", "2026-11-18T08:00:00Z", "2026-11-18T09:00:00Z"), ev("allday", "2026-11-18", "2026-11-19"), ev("late", "2026-11-19T09:00:00Z", "2026-11-19T09:30:00Z"), ev("soon", "2026-11-18T13:00:00Z", "2026-11-18T13:30:00Z")],
      now,
    );
    expect(r).toMatchObject({ event: { id: "soon" }, live: false });
  });

  it("returns null with nothing ahead", () => {
    expect(nowOrNext([ev("past", "2026-11-18T08:00:00Z", "2026-11-18T09:00:00Z")], now)).toBeNull();
  });

  it("says when, in words", () => {
    expect(startsIn("2026-11-18T10:05:00Z", now)).toBe("in 5 min");
    expect(startsIn("2026-11-18T09:00:00Z", now)).toBe("now");
  });
});
