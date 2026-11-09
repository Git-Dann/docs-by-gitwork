import { describe, expect, it } from "vitest";
import { describeAiError } from "@/lib/ai-error-words";

describe("describeAiError: a provider error in one plain sentence", () => {
  it("names an out-of-credit account (the real Anthropic message)", () => {
    const raw = '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011Cgi7ffrMN3TNnGBj85a4Z"}';
    expect(describeAiError(raw)).toMatch(/out of credit/);
  });
  it("names a rejected key, a rate limit and an outage", () => {
    expect(describeAiError('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}')).toMatch(/rejected the API key/);
    expect(describeAiError("429 rate_limit_error")).toMatch(/rate limited/);
    expect(describeAiError("529 overloaded_error")).toMatch(/didn't answer/);
  });
  it("never repeats the raw response", () => {
    for (const raw of ['400 {"type":"error","request_id":"req_x"}', "something odd", ""]) {
      const out = describeAiError(raw);
      expect(out).not.toContain("{");
      expect(out).not.toContain("req_");
    }
  });
});
