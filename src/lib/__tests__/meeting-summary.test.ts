import { describe, expect, it } from "vitest";
import { SUMMARY_RETRY_MAX, summaryFailureReason, summaryRetryDelayMs, summaryRetryDue } from "../meeting-summary";

const now = new Date("2026-11-19T09:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe("why a meeting summary failed", () => {
  it("says the account is out of credit in words, never the provider's raw JSON", () => {
    const raw = '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low"}}';
    const reason = summaryFailureReason("ai_failed", raw);
    expect(reason).toMatch(/out of credit/);
    expect(reason).not.toContain("{");
    expect(reason).not.toContain("invalid_request_error");
  });

  it("names a missing AI key and an unreadable answer differently", () => {
    expect(summaryFailureReason("no_ai_key")).toMatch(/No AI provider is set up/);
    expect(summaryFailureReason("unparsable")).toMatch(/couldn't be read/);
  });
});

describe("when the cron retries a failed summary", () => {
  const base = { status: "ERROR", hasNotes: true, attempts: 0, attemptedAt: null as Date | null, now };

  it("retries failures recorded before attempts were counted straight away", () => {
    expect(summaryRetryDue(base)).toBe(true);
  });

  it("only retries failed summaries that have stored notes", () => {
    expect(summaryRetryDue({ ...base, status: "SUMMARISED" })).toBe(false);
    expect(summaryRetryDue({ ...base, status: "NO_TRANSCRIPT" })).toBe(false);
    expect(summaryRetryDue({ ...base, hasNotes: false })).toBe(false);
  });

  it("backs off 1h, 2h, 4h… and never waits more than a day", () => {
    expect(summaryRetryDelayMs(1)).toBe(3_600_000);
    expect(summaryRetryDelayMs(3)).toBe(4 * 3_600_000);
    expect(summaryRetryDelayMs(20)).toBe(24 * 3_600_000);
    expect(summaryRetryDue({ ...base, attempts: 2, attemptedAt: hoursAgo(1) })).toBe(false);
    expect(summaryRetryDue({ ...base, attempts: 2, attemptedAt: hoursAgo(2) })).toBe(true);
  });

  it("stops after the maximum number of attempts", () => {
    expect(summaryRetryDue({ ...base, attempts: SUMMARY_RETRY_MAX, attemptedAt: hoursAgo(100) })).toBe(false);
    expect(summaryRetryDue({ ...base, attempts: SUMMARY_RETRY_MAX - 1, attemptedAt: hoursAgo(100) })).toBe(true);
  });
});
