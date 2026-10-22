// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import {
  HostNotRespondingError, OPEN_FOR_MS, TRIP_AFTER, assertHostResponding, recordTimeout, resetHostBreaker,
} from "../host-breaker";

beforeEach(() => resetHostBreaker());

describe("a host that has stopped answering", () => {
  it("is still asked until it has timed out twice", () => {
    recordTimeout("https://slow.test/robots.txt", 0);
    expect(() => assertHostResponding("https://slow.test/sitemap.xml", 1)).not.toThrow();
    recordTimeout("https://slow.test/sitemap.xml", 2);
    expect(TRIP_AFTER).toBe(2);
    expect(() => assertHostResponding("https://slow.test/security.txt", 3)).toThrow(HostNotRespondingError);
  });

  it("is skipped for every path on that host, and on no other host", () => {
    recordTimeout("https://slow.test/a", 0);
    recordTimeout("https://slow.test/b", 0);
    expect(() => assertHostResponding("https://slow.test/anything", 1)).toThrow();
    expect(() => assertHostResponding("https://fine.test/anything", 1)).not.toThrow();
    // Host names are case-insensitive.
    expect(() => assertHostResponding("https://SLOW.test/x", 1)).toThrow();
  });

  it("is asked again once the window has passed, so a slow moment doesn't stick", () => {
    recordTimeout("https://slow.test/a", 0);
    recordTimeout("https://slow.test/b", 0);
    expect(() => assertHostResponding("https://slow.test/a", OPEN_FOR_MS - 1)).toThrow();
    expect(() => assertHostResponding("https://slow.test/a", OPEN_FOR_MS + 1)).not.toThrow();
  });

  it("ignores a URL it can't parse rather than throwing", () => {
    expect(() => recordTimeout("not a url")).not.toThrow();
    expect(() => assertHostResponding("not a url")).not.toThrow();
  });
});
