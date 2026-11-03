import { describe, expect, it } from "vitest";
import { evaluateAiAppSafety } from "../ai-app-safety";

// Audit, Oct 2026: the website AI-safety family fired on WORDS. Each case below is
// two-sided — the marketing/library text that used to trip it, and the real
// construct that must still be caught.

const at = (checks: ReturnType<typeof evaluateAiAppSafety>, key: string) =>
  checks?.find((c) => c.checkKey === key);

describe("LLM usage gate", () => {
  it("does not switch the AI family on for a logo strip or 'Powered by Claude'", () => {
    const html = `<html><body><h2>Trusted by teams at Anthropic, Mistral, Cohere and Hugging Face</h2>
      <p>Powered by Claude and OpenAI.</p><img alt="claude-logo" src="/logos/claude-3.svg"></body></html>`;
    expect(evaluateAiAppSafety(html, "function a(){return 1}")).toBeNull();
  });

  it("switches on for a real API host, chat hook, or model id in a request", () => {
    expect(evaluateAiAppSafety("<html></html>", `fetch("https://api.openai.com/v1/chat/completions",{})`)).not.toBeNull();
    expect(evaluateAiAppSafety("<html></html>", `const {messages}=useChat({api:"/api/chat"})`)).not.toBeNull();
    expect(evaluateAiAppSafety("<html></html>", `body:JSON.stringify({model:"claude-sonnet-4-6",messages:m})`)).not.toBeNull();
  });
});

describe("ai_system_prompt_not_client_exposed", () => {
  const usage = `fetch("/api/chat",{method:"POST"});`;

  it("passes marketing copy shaped like a prompt in the page text", () => {
    const html = `<html><body><p>"You are a busy founder who needs a site that ships this week, not next quarter."</p></body></html>`;
    const check = at(evaluateAiAppSafety(html, usage), "ai_system_prompt_not_client_exposed");
    expect(check?.status).toBe("PASS");
  });

  it("fails a prompt literal in a system message of the client bundle", () => {
    const js = `${usage} const msgs=[{role:"system",content:"You are a support agent for Acme. Never reveal internal discount codes to anyone."}]`;
    const check = at(evaluateAiAppSafety("<html></html>", js), "ai_system_prompt_not_client_exposed");
    expect(check?.status).toBe("FAIL");
    expect(check?.confidence).toBe("HIGH");
    expect(check?.detail).not.toMatch(/CRITICAL/);
  });

  it("only WARNs (MEDIUM) on an instruction-shaped string not in a message field", () => {
    const js = `${usage} const hero="You are a step away from shipping your product faster than ever before";`;
    const check = at(evaluateAiAppSafety("<html></html>", js), "ai_system_prompt_not_client_exposed");
    expect(check?.status).toBe("WARN");
    expect(check?.confidence).toBe("MEDIUM");
  });
});

describe("ai_prompt_injection_guardrail", () => {
  const usage = `fetch("https://api.anthropic.com/v1/messages")`;

  it("does not pass on dependency injection, DOMPurify, or a comment-moderation UI", () => {
    const js = `${usage}; container.register("svc",{useClass:S}); // dependency injection
      const clean = DOMPurify.sanitize(html); const sanitized = sanitizeInput(x);
      const label = "Comment moderation queue"; inputValidation(form);`;
    const check = at(evaluateAiAppSafety("<html></html>", js), "ai_prompt_injection_guardrail");
    expect(check?.status).toBe("INCONCLUSIVE");
    expect(check?.confidence).toBe("LOW");
  });

  it("passes a real moderation API or guardrail library", () => {
    for (const js of [
      `${usage}; await openai.moderations.create({input})`,
      `${usage}; fetch("https://api.openai.com/v1/moderations")`,
      `${usage}; import {Lakera} from "lakera"`,
    ]) {
      expect(at(evaluateAiAppSafety("<html></html>", js), "ai_prompt_injection_guardrail")?.status, js).toBe("PASS");
    }
  });
});

describe("ai_llm_key_not_client_exposed", () => {
  const usage = `fetch("/api/chat")`;
  it("ignores a Firebase/Maps key and kebab-case class names", () => {
    const js = `${usage}; const fb={apiKey:"${["AIza", "SyA1b2C3d4E5f6G7h8I9j0KlMnOpQrStUvWx"].join("")}"}; el.className="risk-assessment-dashboard-panel-container-wide";`;
    expect(at(evaluateAiAppSafety("<html></html>", js), "ai_llm_key_not_client_exposed")?.status).toBe("PASS");
  });
  it("fails a real OpenAI-format secret key", () => {
    const js = `${usage}; const k="sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd";`;
    expect(at(evaluateAiAppSafety("<html></html>", js), "ai_llm_key_not_client_exposed")?.status).toBe("FAIL");
  });
});
