/**
 * Static registry of all AI agents in Foundry.
 * Each entry declares the agent's identity, product, and default system prompt.
 * Per-workspace overrides are stored in AgentConfig and merged at runtime.
 */

export interface AgentDefinition {
  key: string;          // e.g. "pulse:synthesis"
  product: "pulse" | "study";
  name: string;
  description: string;
  hasPrompt: boolean;   // true = system prompt is customisable
  defaultSystemPrompt?: string;
}

export const AGENTS_REGISTRY: AgentDefinition[] = [
  // ── Pulse ────────────────────────────────────────────────────────────────
  {
    key: "pulse:synthesis",
    product: "pulse",
    name: "Synthesis Agent",
    description: "Analyses all automated check results and generates the executive summary, critical gaps, build opportunities, production blockers, scaling roadmap, and tech stack assessment.",
    hasPrompt: true,
    // Default prompt is SYSTEM_PROMPT in pulse-ai.ts — overriding here replaces it at runtime
  },
  {
    key: "pulse:discovery",
    product: "pulse",
    name: "Discovery Agent",
    description: "Researches a project URL and generates a structured discovery briefing for the sales and consulting team — competitor landscape, business context, tech signals.",
    hasPrompt: true,
  },
  {
    key: "pulse:fix",
    product: "pulse",
    name: "Fix Agent",
    description: "Reviews failed checks, generates targeted code fixes, and opens pull requests on the project's GitHub repository. Operates on a per-check basis.",
    hasPrompt: true,
  },
  {
    key: "pulse:orchestrator",
    product: "pulse",
    name: "Orchestrator",
    description: "Coordinates the overall scan pipeline — decides which sub-agents to invoke, sequences phases, and assembles the final result. No AI prompt; pure logic.",
    hasPrompt: false,
  },
  {
    key: "pulse:browser",
    product: "pulse",
    name: "Browser Agent",
    description: "Fetches and analyses the rendered HTML of the target URL, running UI/UX, accessibility, and content checks against the live page.",
    hasPrompt: false,
  },
  {
    key: "pulse:code",
    product: "pulse",
    name: "Code Agent",
    description: "Clones or analyses the linked GitHub repository — checking code quality, test coverage, CI/CD config, dependency health, and repo hygiene.",
    hasPrompt: false,
  },
  {
    key: "pulse:deploy",
    product: "pulse",
    name: "Deploy Agent",
    description: "Inspects deployment and infrastructure signals — CDN presence, HTTPS config, response times, and hosting provider detection.",
    hasPrompt: false,
  },
  {
    key: "pulse:monitor",
    product: "pulse",
    name: "Monitor Agent",
    description: "Responds to GitHub webhook events and triggers re-scans when monitored repositories receive new commits or pull requests.",
    hasPrompt: false,
  },

  // ── Study ────────────────────────────────────────────────────────────────
  {
    key: "study:researcher",
    product: "study",
    name: "Researcher",
    description: "Generates the research plan from the study brief — creates structured questions and decides whether to probe follow-ups during the interview.",
    hasPrompt: true,
  },
  {
    key: "study:persona",
    product: "study",
    name: "Persona Agent",
    description: "Conducts AI-powered interviews in the voice of a specific research persona. Takes the persona definition and research questions and simulates a realistic participant response.",
    hasPrompt: true,
  },
  {
    key: "study:synthesizer",
    product: "study",
    name: "Synthesizer",
    description: "Summarises individual interview turns, writes session summaries per participant, and produces the final cross-persona research report.",
    hasPrompt: true,
  },
];

export function getAgentDefinition(key: string): AgentDefinition | undefined {
  return AGENTS_REGISTRY.find((a) => a.key === key);
}

export function getAgentsByProduct(product: "pulse" | "study"): AgentDefinition[] {
  return AGENTS_REGISTRY.filter((a) => a.product === product);
}
