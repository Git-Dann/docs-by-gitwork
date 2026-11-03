import { CATEGORIES } from "./categories";
import { type ExtendedCheckContext, type PulseScanCheckInput, skip, platformIs } from "./_types";
import { fetchBundleText } from "./vibe-security";

// OWASP-LLM-Top-10-flavoured safety checks for apps that THEMSELVES use an LLM —
// increasingly what "vibe-coded" apps are. Prompt injection is OWASP LLM01 and the
// most-exploited class in production. Heuristic + bundle-observed (AI-free here);
// only runs when the app shows LLM usage, else SKIPPED.
//
// Audit, Oct 2026. Three of these fired on words rather than on code:
//   • the family switched on for any page saying "anthropic", "claude-", "mistral",
//     "cohere" or "huggingface" — a logo strip or "Powered by Claude" was enough;
//   • any quoted 40-character sentence starting "you are a" anywhere in the page or
//     bundle was a HIGH, "CRITICAL" leaked system prompt — marketing copy included;
//   • "injection" (dependency injection), "sanitiz" (DOMPurify) and "moderation"
//     (any comment-moderation UI) counted as a prompt-injection guardrail.
// Each now needs the thing itself: an API host, an SDK, a model id in a request,
// a prompt literal in a message field, a real guardrail library or API.

const CATEGORY = CATEGORIES.AI_SAFETY;

const ALL_CHECKS: Array<[string, string]> = [
  ["ai_system_prompt_not_client_exposed", "System prompt not shipped to the client"],
  ["ai_llm_key_not_client_exposed", "LLM API key not in client bundle"],
  ["ai_prompt_injection_guardrail", "Prompt-injection guardrail present"],
  ["ai_output_validation", "LLM output validated before use"],
];

/**
 * Evidence that the app CALLS an LLM — an API host, an AI SDK module, a chat hook,
 * a completions path, or a model id written as a request field. A provider's name
 * in page text is marketing, not usage.
 */
export const LLM_USAGE =
  /\bapi\.openai\.com\b|\bapi\.anthropic\.com\b|\bgenerativelanguage\.googleapis\.com\b|\bapi\.mistral\.ai\b|\bapi\.cohere\.(?:ai|com)\b|\bapi-inference\.huggingface\.co\b|\brouter\.huggingface\.co\b|\bapi\.groq\.com\b|\bopenrouter\.ai\/api\b|\/v1\/chat\/completions\b|["'`]\/api\/(?:chat|completions?|generate|ai)["'`?\/]|@ai-sdk\/[a-z-]+|\b(?:useChat|useCompletion|useAssistant)\s*\(|["']?model["']?\s*:\s*["'`](?:gpt-[0-9]|gpt-4o|o[134](?:-mini)?["'`-]|claude-[0-9a-z]|gemini-[0-9]|mistral-|mixtral-|command-r|llama-?[0-9])/i;

/** Inline <script> bodies (no src) — client JS that never shows up as a bundle file. */
function inlineScripts(html: string): string {
  return Array.from(html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)).map((m) => m[1]).join("\n");
}

/** An instruction prompt written into a message/system field of a request. */
const PROMPT_IN_MESSAGE =
  /(?:role\s*:\s*["'`](?:system|developer)["'`]\s*,\s*content\s*:|\b(?:system|systemPrompt|system_prompt|systemMessage|instructions)\s*:)\s*["'`]\s*(?:you are (?:an?|the)\b|your (?:role|task|job) is|act as an?\b)[^"'`]{40,}/i;
/** The same sentence shape anywhere else in JS — could be a prompt, could be copy. */
const PROMPT_SHAPED_STRING = /["'`]\s*(?:you are (?:an?|the)\b|your (?:role|task|job) is|act as an?\b)[^"'`]{40,}/i;

/** Named guardrail libraries and moderation APIs. Never a bare word. */
const GUARDRAIL =
  /\bllm[-_]guard\b|\bguardrails[-_]ai\b|@guardrails-ai\/|\bnemoguardrails\b|\bnemo[-_]guardrails\b|\brebuff\b|\bprompt[-_]?shields?\b|\blakera\b|\bllama[-_]?guard\b|\bprompt[-_]?guard\b|\/v1\/moderations\b|\bmoderations\.create\s*\(|\b(?:omni|text)-moderation-(?:latest|stable|\d)|\bcontentsafety\b|\bcontent[-_]safety\.cognitiveservices\b|\bprotectai\b/i;

/**
 * A structured-output request with a schema: the Vercel AI SDK's object APIs, OpenAI's
 * json_schema response format or its zod helper, Gemini's responseSchema. Never a bare
 * `.parse(` or the word "zod".
 */
const STRUCTURED_OUTPUT =
  /\b(?:generateObject|streamObject|useObject|experimental_useObject)\s*\(|\bresponse_format\s*:\s*\{\s*type\s*:\s*["']json_schema["']|\bzodResponseFormat\s*\(|\bresponseSchema\s*:|\bjson_schema\s*:\s*\{\s*(?:name|schema|strict)\s*:/;

/**
 * Pure verdicts over what the scan fetched. `html` is the page; `bundleJs` is the
 * same-origin JS bundles. Returns null when there is no LLM usage to judge.
 */
export function evaluateAiAppSafety(html: string, bundleJs: string): PulseScanCheckInput[] | null {
  const clientJs = `${inlineScripts(html)}\n${bundleJs}`;
  if (!LLM_USAGE.test(clientJs) && !LLM_USAGE.test(html)) return null;

  const checks: PulseScanCheckInput[] = [];

  // System prompt shipped to the client. A prompt literal in a request's
  // system/message field is observed (FAIL, HIGH). A prompt-shaped sentence
  // elsewhere in the JS might be UI copy, so it is a MEDIUM WARN to confirm.
  // Page text never counts: a heading saying "You are a…" is not a prompt.
  const inMessage = PROMPT_IN_MESSAGE.test(clientJs);
  const shaped = !inMessage && PROMPT_SHAPED_STRING.test(clientJs);
  checks.push({
    category: CATEGORY,
    checkKey: "ai_system_prompt_not_client_exposed",
    label: "System prompt not shipped to the client",
    status: inMessage ? "FAIL" : shaped ? "WARN" : "PASS",
    confidence: inMessage ? "HIGH" : "MEDIUM",
    detail: inMessage
      ? "A system/instruction prompt is written into a request in the JavaScript this site sends to the browser, so anyone can read it and send their own instead. Build the prompt on the server and send only the user's message from the client."
      : shaped
        ? "The JavaScript this site sends to the browser contains an instruction-shaped sentence (\"You are a…\"). It may be interface copy; if it is a prompt, move prompt construction to the server."
        : "No system/instruction prompt was found in the JavaScript sent to the browser.",
    evidence: inMessage ? "prompt literal in a system/message field of client JS" : shaped ? "instruction-shaped string in client JS" : undefined,
  });

  // LLM provider secret key in the client bundle. Leading boundary so kebab-case
  // class names are not keys; AIzaSy is NOT here — that is every Firebase web
  // config and Maps key, public by design.
  const llmKeyLeak = /(?<![A-Za-z0-9_-])sk-(?:proj-|ant-(?:api\d+-)?)?[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])/.test(clientJs);
  checks.push({
    category: CATEGORY,
    checkKey: "ai_llm_key_not_client_exposed",
    label: "LLM API key not in client bundle",
    status: llmKeyLeak ? "FAIL" : "PASS",
    confidence: "HIGH",
    detail: llmKeyLeak
      ? "An OpenAI/Anthropic-format secret key appears in client-side code. Rotate it now and proxy LLM calls through your server."
      : "No LLM provider secret key detected in the client bundle.",
    evidence: llmKeyLeak ? "LLM key pattern in client JS" : undefined,
  });

  // Guardrails run on the server, which a website scan cannot see. A named
  // guardrail library or moderation API in the client JS is a positive signal;
  // its absence there establishes nothing.
  const hasGuardrail = GUARDRAIL.test(clientJs);
  checks.push({
    category: CATEGORY,
    checkKey: "ai_prompt_injection_guardrail",
    label: "Prompt-injection guardrail present",
    status: hasGuardrail ? "PASS" : "INCONCLUSIVE",
    confidence: hasGuardrail ? "MEDIUM" : "LOW",
    detail: hasGuardrail
      ? "A named guardrail library or moderation API is referenced by the site's client code."
      : "Not established from outside: prompt-injection guardrails and moderation normally run on the server, which a website scan cannot see. Confirm user input reaching the model is screened (a moderation API or a guardrail library). Prompt injection is OWASP LLM01.",
  });

  // Output validation usually happens on the server, which a website scan cannot see,
  // so its absence from the client JS establishes nothing. Only a schema-bound
  // structured-output API in the client code is evidence. The withheld version passed on
  // any `.parse(`, which is JSON.parse and URL.parse in every bundle.
  const hasOutputValidation = STRUCTURED_OUTPUT.test(clientJs);
  checks.push({
    category: CATEGORY,
    checkKey: "ai_output_validation",
    label: "LLM output validated before use",
    status: hasOutputValidation ? "PASS" : "INCONCLUSIVE",
    confidence: hasOutputValidation ? "MEDIUM" : "LOW",
    detail: hasOutputValidation
      ? "The site's client code asks the model for schema-bound output (a structured-output API with a schema), so responses are checked against that schema before use."
      : "Not established from outside: model output is normally validated on the server, which a website scan cannot see. Confirm responses are checked against a schema before they are rendered or acted on.",
  });

  // AI endpoint rate limiting is enforced on the server, so it is read from the
  // repository (repo-operations.ts), never guessed from the client bundle.

  return checks;
}

export async function runAiAppSafetyChecks(ctx: ExtendedCheckContext): Promise<PulseScanCheckInput[]> {
  if (platformIs(ctx.platform, "CLI_TOOL", "IOS_APP", "ANDROID_APP", "CROSS_PLATFORM_MOBILE")) {
    return skip(CATEGORY, ALL_CHECKS, "Not applicable for this platform type.");
  }
  const html = ctx.pageResult.html;
  const bundleJs = await fetchBundleText(html, ctx.httpsUrl);
  return evaluateAiAppSafety(html, bundleJs)
    ?? skip(CATEGORY, ALL_CHECKS, "No LLM/AI usage detected — AI-app safety checks not applicable.");
}
