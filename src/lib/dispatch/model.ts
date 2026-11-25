/**
 * Which model answers a Dispatch chat (Dan, 25 Nov 2026: as cheap as possible).
 *
 * - "everyday" (Claude Haiku 5.5, $0.10 / $0.50 per million tokens): finding things out, plans,
 *   stand-ups, replies, release notes, subtasks. Most questions.
 * - "deep" (Claude Sonnet 5.5, $2 / $10, about twenty times the price): reading and reasoning
 *   about code, and comparing a design with what was built from pictures, where the stronger
 *   model is worth it.
 *
 * Chosen once, from the chat's first question, and kept for the whole chat: each model's
 * thinking can only be replayed to that model, and its cache is its own, so switching mid-chat
 * would pay for the history again. Pure, so the rule is tested.
 */

export type DispatchTier = "everyday" | "deep";

const DEEP = [
  // Code
  /\b(code|codebase|repo|repository|source|file ?path|function|class|module|refactor|stack trace)\b/i,
  /\b(pull request|PR description|PR #?\d+|commit|commits|diff|branch|merge)\b/i,
  /\bimpact analysis\b/i,
  /\b(setup guide|developer docs?|documentation from)\b/i,
  // Design against build
  /\b(figma|design vs|vs (the )?design|match(es)? the design|mock-?up|wireframe|screenshot|pixel)\b/i,
];

export function chooseDispatchTier(input: { question: string; pictures?: number }): DispatchTier {
  if ((input.pictures ?? 0) > 0) return "deep";
  return DEEP.some((re) => re.test(input.question)) ? "deep" : "everyday";
}
