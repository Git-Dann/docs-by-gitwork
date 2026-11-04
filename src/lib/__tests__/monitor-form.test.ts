/**
 * The monitor form's rules, shared by the wiki and the Monitors page's Add monitor popup, so
 * both build the same request from the same fields.
 */
import { describe, expect, it } from "vitest";
import { EMPTY_MONITOR_FORM, formToMonitorInput, monitorToForm, type MonitorFormState } from "../monitor-form";

const form = (over: Partial<MonitorFormState>): MonitorFormState => ({ ...EMPTY_MONITOR_FORM, ...over });

function input(f: MonitorFormState) {
  const r = formToMonitorInput(f);
  if (!r.ok) throw new Error(r.error);
  return r.input;
}

describe("formToMonitorInput", () => {
  it("builds an HTTP check with its options", () => {
    expect(
      input(form({ name: " API ", target: " https://api.x.co/health ", expectedStatus: "200", keyword: " ok ", degradedMs: "2000", intervalMinutes: "1" })),
    ).toEqual({
      name: "API",
      type: "HTTP",
      environment: "production",
      target: "https://api.x.co/health",
      graceMinutes: null,
      method: "GET",
      expectedStatus: 200,
      keyword: "ok",
      degradedMs: 2000,
      intervalMinutes: 1,
    });
  });

  it("asks for a name, then an address", () => {
    expect(formToMonitorInput(form({ target: "https://x.co" }))).toEqual({ ok: false, error: "Give the monitor a name." });
    expect(formToMonitorInput(form({ name: "Site" }))).toEqual({ ok: false, error: "Add the address to check." });
    expect(formToMonitorInput(form({ name: "DB", type: "TCP" })).ok).toBe(false);
  });

  it("needs no address for a heartbeat, and only sends what applies to it", () => {
    const hb = input(form({ name: "Nightly job", type: "HEARTBEAT", target: "ignored", graceMinutes: "10", keyword: "x", degradedMs: "500", expectedStatus: "200" }));
    expect(hb).toMatchObject({ type: "HEARTBEAT", target: "", graceMinutes: 10, keyword: null, degradedMs: null, expectedStatus: null, method: "GET" });
  });

  it("drops HTTP-only fields from a TCP check", () => {
    const tcp = input(form({ name: "DB", type: "TCP", target: "db.x.co:5432", method: "POST", keyword: "k", expectedStatus: "200", headersText: "X: 1", body: "b" }));
    expect(tcp).toMatchObject({ method: "GET", keyword: null, expectedStatus: null });
    expect(tcp).not.toHaveProperty("requestHeaders");
    expect(tcp).not.toHaveProperty("requestBody");
  });

  it("keeps saved headers unless replaced or removed", () => {
    expect(input(form({ name: "A", target: "https://x.co" }))).not.toHaveProperty("requestHeaders");
    expect(input(form({ name: "A", target: "https://x.co", headersText: "X-Key: 1" })).requestHeaders).toBe("X-Key: 1");
    expect(input(form({ name: "A", target: "https://x.co", clearHeaders: true })).requestHeaders).toBeNull();
  });

  it("sends a body only for a POST", () => {
    expect(input(form({ name: "A", target: "https://x.co", body: "{}" }))).not.toHaveProperty("requestBody");
    expect(input(form({ name: "A", target: "https://x.co", method: "POST", body: "{}" })).requestBody).toBe("{}");
  });

  it("refuses numbers the server would refuse, with a sentence", () => {
    for (const bad of [
      form({ name: "A", target: "https://x.co", intervalMinutes: "0" }),
      form({ name: "A", target: "https://x.co", intervalMinutes: "2000" }),
      form({ name: "A", target: "https://x.co", intervalMinutes: "five" }),
      form({ name: "A", target: "https://x.co", expectedStatus: "99" }),
      form({ name: "A", target: "https://x.co", degradedMs: "1.5" }),
      form({ name: "A", type: "HEARTBEAT", graceMinutes: "0" }),
    ]) {
      const r = formToMonitorInput(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/must be/);
    }
  });

  it("defaults a blank interval to five minutes", () => {
    expect(input(form({ name: "A", target: "https://x.co", intervalMinutes: "" })).intervalMinutes).toBe(5);
  });
});

describe("monitorToForm", () => {
  it("round-trips a saved monitor without its secrets", () => {
    const f = monitorToForm({
      name: "API", type: "HTTP", environment: "staging", target: "https://x.co", method: "HEAD", expectedStatus: 204, keyword: null,
      degradedMs: null, intervalMinutes: 3, headerNames: ["Authorization"], heartbeat: null,
    });
    expect(f.environment).toBe("staging");
    expect(input(f).environment).toBe("staging");
    expect(f).toMatchObject({ method: "HEAD", expectedStatus: "204", intervalMinutes: "3", savedHeaders: ["Authorization"], headersText: "", body: "" });
    expect(input(f)).not.toHaveProperty("requestHeaders"); // saved headers stay as they are
  });
});

describe("environment", () => {
  it("defaults a new monitor to production, which the client sees", () => {
    expect(input(form({ name: "A", target: "https://x.co" })).environment).toBe("production");
  });

  it("reads an unrecognised stored environment as production in the form", () => {
    const f = monitorToForm({
      name: "API", type: "HTTP", environment: "qa-box", target: "https://x.co", method: "GET", expectedStatus: null,
      keyword: null, degradedMs: null, intervalMinutes: 5, headerNames: [], heartbeat: null,
    });
    expect(f.environment).toBe("production");
  });
});
