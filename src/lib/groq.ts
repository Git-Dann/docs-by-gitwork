/**
 * Groq API Client Helper
 * Uses Groq's OpenAI-compatible chat completions API (https://api.groq.com/openai/v1/chat/completions).
 */

export interface GroqChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqCompletionOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  jsonMode?: boolean;
}

export async function callGroqChatCompletion(
  messages: GroqChatMessage[],
  options: GroqCompletionOptions = {}
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured in environment variables.");
  }

  // Model fallback precedence: GROQ_MODEL env var -> options.model -> "openai-oss-120b"
  const model = options.model || process.env.GROQ_MODEL || "openai-oss-120b";

  const payload = {
    model,
    messages,
    temperature: options.temperature ?? 0.1,
    max_tokens: options.max_tokens ?? 1024,
    ...(options.jsonMode ? { response_format: { type: "json_object" } } : {}),
  };

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Groq API Error (${response.status}): ${errText || response.statusText}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response received from Groq API.");
  }

  return content;
}
