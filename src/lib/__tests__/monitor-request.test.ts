import { describe, expect, it } from "vitest";
import { basicAuthValue, cleanHeaders, combineLocations, headersField, parseHeaderLines } from "../monitor-request";

describe("request headers", () => {
  it("parses one per line and keeps colons in the value", () => {
    const r = parseHeaderLines("Authorization: Bearer a:b:c\n\n  X-Api-Key:  k1  \n");
    expect(r).toEqual({ headers: { Authorization: "Bearer a:b:c", "X-Api-Key": "k1" }, error: null });
  });
  it("refuses headers the HTTP client owns, bad names and bad lines", () => {
    expect(parseHeaderLines("Host: evil.example").error).toMatch(/set by Foundry/);
    expect(parseHeaderLines("content-length: 5").error).toMatch(/set by Foundry/);
    expect(parseHeaderLines("Bad Name: x").error).toMatch(/valid header name/);
    expect(parseHeaderLines("no colon here").error).toMatch(/isn't a header/);
  });
  it("caps the number of headers", () => {
    const many = Array.from({ length: 21 }, (_, i) => `X-H${i}: v`).join("\n");
    expect(parseHeaderLines(many).error).toMatch(/Up to 20/);
  });
  it("re-checks stored headers on read, dropping anything that wouldn't pass now", () => {
    expect(cleanHeaders({ Authorization: "x", Host: "evil", "X-N": 5, "Bad Name": "y" })).toEqual({ Authorization: "x" });
    expect(cleanHeaders("nope")).toEqual({});
  });
  it("builds a Basic value, including non-ASCII passwords", () => {
    expect(basicAuthValue("user", "pass")).toBe("Basic dXNlcjpwYXNz");
    expect(basicAuthValue("a", "pässwörd")).toBe(`Basic ${Buffer.from("a:pässwörd").toString("base64")}`);
  });
  it("keeps, clears or replaces from the form field", () => {
    expect(headersField(undefined)).toEqual({ value: undefined, error: null });
    expect(headersField("  ")).toEqual({ value: null, error: null });
    expect(headersField(null)).toEqual({ value: null, error: null });
    expect(headersField("X-A: 1").value).toEqual({ "X-A": "1" });
    expect(headersField("Host: x")).toMatchObject({ value: undefined, error: expect.any(String) });
  });
});

describe("two locations", () => {
  const down = { status: "DOWN" as const, latencyMs: null, statusCode: null, error: "Timed out after 15s" };
  it("leaves a passing local check alone without asking", () => {
    const up = { status: "UP" as const, latencyMs: 80, statusCode: 200, error: null };
    expect(combineLocations(up, { ...down, location: "x" })).toMatchObject({ status: "UP", note: null });
  });
  it("keeps DOWN when the second location can't be asked", () => {
    expect(combineLocations(down, null)).toMatchObject({ status: "DOWN", note: null });
  });
  it("confirms DOWN when both failed, naming where", () => {
    const r = combineLocations(down, { ...down, location: "Vercel iad1" });
    expect(r.status).toBe("DOWN");
    expect(r.error).toMatch(/also failed from Vercel iad1/);
  });
  it("downgrades to DEGRADED, never UP, when only Foundry's server failed", () => {
    const r = combineLocations(down, { status: "UP", latencyMs: 120, statusCode: 200, error: null, location: "Vercel iad1" });
    expect(r.status).toBe("DEGRADED");
    expect(r.error).toMatch(/not an outage/);
    expect(r.note).toBe("Reached from Vercel iad1");
  });
});
