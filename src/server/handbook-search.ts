// ── Handbook smart search ────────────────────────────────────────────────────────
// Concept-level search without an embedding model: a hand-tuned concept map expands both the
// article's hidden `keywords` (at seed/author time) and the user's query (at search time), so a
// search for "ship" finds the deploy article, "auth" finds the security baseline, "css" finds the
// design system, and so on. Shared by handbook.ts (query expansion) and handbook-catalog.ts
// (keyword derivation) so the two stay in lockstep. Pure + dependency-free.

/**
 * term → related terms. Matching is done on whole lowercased tokens against the keys, and the
 * expansion is one-directional per entry but we also fold in reverse hits, so relationships read
 * naturally in either direction. Keep entries short and high-signal — this is a relevance nudge,
 * not an ontology.
 */
const CONCEPT_MAP: Record<string, string[]> = {
  // Delivery
  deploy: ["ship", "release", "shipping", "ci", "cd", "pipeline", "rollout", "vps", "docker", "github actions", "rollback"],
  release: ["deploy", "ship", "qa", "staging", "production", "launch"],
  ship: ["deploy", "release", "merge", "production"],
  production: ["prod", "live", "deploy", "release"],
  rollback: ["revert", "roll back", "incident", "deploy"],
  incident: ["outage", "downtime", "broken", "on-call", "postmortem", "rollback", "production"],
  // Git
  git: ["branch", "commit", "rebase", "merge", "pull request", "pr", "squash"],
  commit: ["conventional commits", "message", "git"],
  branch: ["feature branch", "rebase", "merge", "git"],
  rebase: ["sync", "merge", "git", "conflict"],
  pr: ["pull request", "review", "code review", "merge"],
  review: ["code review", "pr", "pull request", "feedback"],
  // Backend
  api: ["route", "endpoint", "rest", "handler", "backend", "server"],
  prisma: ["database", "db", "orm", "schema", "postgres", "migration", "sql"],
  database: ["db", "prisma", "postgres", "sql", "schema", "query"],
  sql: ["query", "postgres", "database", "prisma", "join", "index"],
  schema: ["migration", "prisma", "database", "db push", "column"],
  migration: ["schema", "db push", "prisma", "database"],
  ai: ["llm", "anthropic", "claude", "model", "openai", "gemini", "prompt", "embedding"],
  auth: ["authentication", "authorization", "permission", "login", "session", "gate", "access"],
  permission: ["auth", "role", "access", "gate", "rbac", "super admin"],
  // Frontend
  frontend: ["react", "nextjs", "ui", "component", "client", "tsx"],
  react: ["nextjs", "component", "hook", "jsx", "tsx", "frontend"],
  nextjs: ["next", "react", "app router", "server component", "frontend"],
  css: ["tailwind", "styling", "style", "design system", "responsive", "layout"],
  tailwind: ["css", "styling", "utility", "design system"],
  responsive: ["mobile", "breakpoint", "layout", "css", "viewport"],
  design: ["design system", "ui", "brand", "widget", "tokens", "figma"],
  "design system": ["design", "brand", "tokens", "widget", "ui", "css"],
  // Languages / runtime
  typescript: ["ts", "type", "types", "tsx", "javascript", "language"],
  javascript: ["js", "node", "typescript", "language", "runtime"],
  node: ["nodejs", "runtime", "javascript", "npm", "server"],
  swift: ["ios", "swiftui", "apple", "mobile", "xcode", "app"],
  ios: ["swift", "swiftui", "mobile", "apple", "app"],
  bash: ["shell", "script", "sh", "zsh", "terminal", "cli"],
  shell: ["bash", "script", "terminal", "cli", "sh"],
  // Process / people
  onboarding: ["getting started", "first week", "setup", "new hire", "welcome"],
  standup: ["daily update", "communication", "roll-up", "status"],
  estimate: ["estimation", "scoping", "planning", "sizing"],
  quality: ["definition of done", "testing", "review", "standards"],
  test: ["testing", "tests", "coverage", "tdd", "quality"],
  secret: ["secrets", "credentials", "env", "api key", "token", "encryption", "security"],
  security: ["secure", "auth", "secrets", "vulnerability", "gate", "permission"],
  handover: ["handoff", "delivery", "client", "documentation", "wrap up"],
  client: ["portal", "project", "customer", "account"],
  project: ["client", "portal", "engagement", "build"],
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

// Precompute reverse edges so "ship" → "deploy" works even though the map keys it under "deploy".
const REVERSE: Record<string, Set<string>> = {};
for (const [key, related] of Object.entries(CONCEPT_MAP)) {
  for (const r of related) {
    (REVERSE[r] ??= new Set()).add(key);
  }
}

function relatedTerms(term: string): string[] {
  const out = new Set<string>();
  for (const r of CONCEPT_MAP[term] ?? []) out.add(r);
  for (const r of REVERSE[term] ?? []) out.add(r);
  return [...out];
}

/**
 * Expand a search query into the set of terms to match against (the query's own tokens plus their
 * concept-map relations). Also keeps multi-word map keys that appear as substrings of the query.
 */
export function expandQuery(q: string): string[] {
  const query = q.toLowerCase().trim();
  if (!query) return [];
  const terms = new Set<string>([query]);
  for (const tok of tokenize(query)) {
    terms.add(tok);
    for (const r of relatedTerms(tok)) terms.add(r);
  }
  // Multi-word concept keys (e.g. "design system", "pull request") present in the query.
  for (const key of Object.keys(CONCEPT_MAP)) {
    if (key.includes(" ") && query.includes(key)) {
      terms.add(key);
      for (const r of relatedTerms(key)) terms.add(r);
    }
  }
  return [...terms].filter((t) => t.length > 1);
}

/**
 * Derive hidden search keywords for an article from its title, category and visible tags, enriched
 * via the concept map. Used at seed/save time so every article carries related-term "hidden tags"
 * even when the author didn't write any. Returns a deduped, lowercased list.
 */
export function deriveKeywords(input: {
  title: string;
  category: string;
  tags: string[];
  explicit?: string[];
}): string[] {
  const seed = new Set<string>();
  for (const t of input.explicit ?? []) seed.add(t.toLowerCase());
  for (const t of input.tags) seed.add(t.toLowerCase());
  for (const tok of tokenize(input.category)) seed.add(tok);
  for (const tok of tokenize(input.title)) seed.add(tok);

  const enriched = new Set<string>(seed);
  for (const term of seed) {
    for (const r of relatedTerms(term)) enriched.add(r);
  }
  // Drop noise words that add no search value.
  const STOP = new Set(["the", "and", "for", "our", "how", "you", "your", "with", "get", "when", "what"]);
  return [...enriched].filter((t) => t.length > 1 && !STOP.has(t)).sort();
}
