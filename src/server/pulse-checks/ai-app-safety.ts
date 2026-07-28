import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, skip, platformIs } from "./_types";
import { fetchBundleText } from "./vibe-security";

// OWASP-LLM-Top-10-flavoured safety checks for apps that THEMSELVES use an LLM —
// increasingly what "vibe-coded" apps are. Prompt injection is OWASP LLM01 and the
// most-exploited class in production. Heuristic + bundle-observed (AI-free here);
// only runs when the app shows LLM signals, else SKIPPED.

const CATEGORY = CATEGORIES.AI_SAFETY;

const ALL_CHECKS: Array<[string, string]> = [
  ["ai_system_prompt_not_client_exposed", "System prompt not shipped to the client"],
  ["ai_llm_key_not_client_exposed", "LLM API key not in client bundle"],
  ["ai_prompt_injection_guardrail", "Prompt-injection guardrail present"],
  ["ai_output_validation", "LLM output validated before use"],
  ["ai_endpoint_rate_limited", "AI endpoint rate-limiting signals"],
];

// Signals that the app calls an LLM.
const LLM_SIGNAL = /openai|anthropic|claude-|gpt-[0-9]|@ai-sdk|\bai\/react\b|usechat|langchain|llamaindex|\/api\/chat\b|chat\/completions|generativelanguage|mistral|cohere|huggingface/i;

export async function runAiAppSafetyChecks(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  if (platformIs(ctx.platform, "CLI_TOOL", "IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE")) {
    return skip(CATEGORY, ALL_CHECKS, "Not applicable for this platform type.");
  }

  const html = ctx.pageResult.html;
  const htmlLower = ctx.htmlLower;
  if (!LLM_SIGNAL.test(htmlLower)) {
    // Cheap pre-check on HTML; confirm against the bundle before giving up.
    const probe = await fetchBundleText(html, ctx.httpsUrl);
    if (!LLM_SIGNAL.test(probe)) {
      return skip(CATEGORY, ALL_CHECKS, "No LLM/AI usage detected — AI-app safety checks not applicable.");
    }
  }

  const bundle = html + "\n" + (await fetchBundleText(html, ctx.httpsUrl));
  const checks: PulseScanCheckInput[] = [];

  // System prompt shipped to the client → directly injectable / leaks IP. (bundle-observed → HIGH)
  const systemPromptLeak = /["'`]\s*(you are (an?|the)\b|your (role|task|job) is|system:\s|act as an?\b)[^"'`]{40,}/i.test(bundle);
  checks.push({ category: CATEGORY, checkKey: "ai_system_prompt_not_client_exposed", label: "System prompt not shipped to the client", status: systemPromptLeak ? "FAIL" : "PASS",
    detail: systemPromptLeak
      ? "CRITICAL: what looks like a system/instruction prompt is bundled into client-side JS — anyone can read and override it. Move prompt construction server-side."
      : "No system/instruction prompt detected in the client bundle.",
    evidence: systemPromptLeak ? "instruction-prompt pattern in client JS" : undefined });

  // LLM provider secret key in the client bundle. (bundle-observed → HIGH)
  const llmKeyLeak = /sk-ant-[a-zA-Z0-9-]{20,}|sk-[a-zA-Z0-9]{32,}|AIzaSy[a-zA-Z0-9_-]{30,}/.test(bundle);
  checks.push({ category: CATEGORY, checkKey: "ai_llm_key_not_client_exposed", label: "LLM API key not in client bundle", status: llmKeyLeak ? "FAIL" : "PASS",
    detail: llmKeyLeak
      ? "CRITICAL: an LLM provider API key (OpenAI/Anthropic/Gemini) appears in client-side code. Rotate it now and proxy LLM calls through your server."
      : "No LLM provider secret key detected in the client bundle.",
    evidence: llmKeyLeak ? "LLM key pattern in client JS" : undefined });

  // Prompt-injection guardrail signals (heuristic → MEDIUM).
  const hasGuardrail = /llm-?guard|guardrails|rebuff|prompt-?shield|injection|moderation|sanitiz|input.?validation/i.test(bundle);
  checks.push({ category: CATEGORY, checkKey: "ai_prompt_injection_guardrail", label: "Prompt-injection guardrail present", status: hasGuardrail ? "PASS" : "WARN",
    detail: hasGuardrail
      ? "Guardrail/moderation signals detected around LLM usage."
      : "No prompt-injection guardrail detected — user input reaching an LLM should be guarded (moderation, input validation, prompt-shielding). Prompt injection is OWASP LLM01." });

  // Output validation before use (heuristic → MEDIUM).
  const hasOutputValidation = /\.parse\(|zod|schema\.validate|json\.parse\([^)]*\)\s*;?\s*\/\/|structured.?output|tool.?call/i.test(bundle);
  checks.push({ category: CATEGORY, checkKey: "ai_output_validation", label: "LLM output validated before use", status: hasOutputValidation ? "PASS" : "WARN",
    detail: hasOutputValidation
      ? "LLM output validation/parse signals detected."
      : "No LLM output validation detected — model responses should be schema-validated before being rendered or executed (avoids injection via model output)." });

  // Rate-limiting signals on the AI endpoint (heuristic → MEDIUM).
  const hasRateLimit = /rate.?limit|ratelimit|upstash|@vercel\/kv|too many requests|429|throttle/i.test(bundle);
  checks.push({ category: CATEGORY, checkKey: "ai_endpoint_rate_limited", label: "AI endpoint rate-limiting signals", status: hasRateLimit ? "PASS" : "WARN",
    detail: hasRateLimit
      ? "Rate-limiting signals detected."
      : "No rate-limiting detected for the AI endpoint — uncapped LLM calls invite cost-blowout and abuse. Add per-user/IP rate limits on the chat/completions route." });

  return checks;
}
