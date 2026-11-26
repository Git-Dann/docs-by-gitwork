import { describe, expect, it } from "vitest";
import { HELP, runTerminal } from "../terminal";
import { PLANS } from "../gitwork-content";

const ctx = { userName: "you", now: new Date("2026-11-26T10:00:00Z") };

describe("terminal", () => {
  it("lists every documented command, and each one answers", () => {
    for (const [cmd] of HELP) {
      if (cmd === "clear") continue; // handled by the view
      const r = runTerminal(cmd, ctx);
      expect(r.lines.some((l) => l.kind === "err"), cmd).toBe(false);
    }
  });

  it("quotes the real prices", () => {
    const text = runTerminal("services", ctx).lines.map((l) => l.text).join("\n");
    for (const p of PLANS) expect(text).toContain(p.price);
  });

  it("opens apps by name and refuses unknown ones", () => {
    expect(runTerminal("open work", ctx).effect).toEqual({ type: "open", app: "finder" });
    expect(runTerminal("foundry", ctx).effect).toEqual({ type: "open", app: "foundry" });
    const bad = runTerminal("open nonsense", ctx);
    expect(bad.effect).toBeUndefined();
    expect(bad.lines[0].kind).toBe("err");
  });

  it("ships with confetti, and refuses to delete things", () => {
    expect(runTerminal("ship", ctx).effect).toEqual({ type: "egg", name: "confetti" });
    const rm = runTerminal("sudo rm -rf /", ctx);
    expect(rm.effect).toBeUndefined();
    expect(rm.lines[0].text).toMatch(/finish them/);
  });

  it("is case-insensitive and ignores surrounding space", () => {
    expect(runTerminal("  HELP  ", ctx).lines.length).toBe(HELP.length);
    expect(runTerminal("", ctx).lines).toEqual([]);
  });

  it("says so when a command doesn't exist", () => {
    expect(runTerminal("rm", ctx).lines[0]).toMatchObject({ kind: "err" });
  });
});
