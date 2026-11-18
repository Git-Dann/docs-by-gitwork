import { describe, expect, it } from "vitest";
import { historyIconKey } from "@/lib/client-history-icons";

describe("history icons", () => {
  it("names each lifecycle step from the server's label", () => {
    expect(historyIconKey({ id: "lifecycle:client:1", label: "Client record" })).toBe("record");
    expect(historyIconKey({ id: "signoff:p1", label: "Commercial sign-off" })).toBe("signed");
    expect(historyIconKey({ id: "onboarding:o1", label: "Onboarding link open" })).toBe("onboarding");
    expect(historyIconKey({ id: "lifecycle:audit9", label: "Client active" })).toBe("active");
    expect(historyIconKey({ id: "plan-ready:c1", label: "Delivery plan" })).toBe("plan");
  });

  it("tells a developer joining from one leaving", () => {
    expect(historyIconKey({ id: "placement:x:start", label: "Ann joined" })).toBe("joined");
    expect(historyIconKey({ id: "placement:x:end", label: "Ann left" })).toBe("left");
  });

  it("names work and CRM entries by their source", () => {
    expect(historyIconKey({ id: "pulse:s1", label: "Pulse scan" })).toBe("scan");
    expect(historyIconKey({ id: "Design added:d1", label: "Design added" })).toBe("design");
    expect(historyIconKey({ id: "touchpoint:t1", label: "Call with Luke" })).toBe("call");
    expect(historyIconKey({ id: "touchpoint:t2", label: "Email" })).toBe("email");
  });

  it("never guesses: an unknown step or touchpoint falls back to 'other'", () => {
    expect(historyIconKey({ id: "lifecycle:z", label: "Something new" })).toBe("other");
    expect(historyIconKey({ id: "touchpoint:t3", label: "Activity" })).toBe("other");
    // A label that merely mentions a step is not that step.
    expect(historyIconKey({ id: "lifecycle:y", label: "Not the client record" })).toBe("other");
  });
});
