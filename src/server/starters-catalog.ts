import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StarterType, StarterContent } from "@/server/starters";

// ── Built-in Starters catalog ───────────────────────────────────────────────────
// The shipped Prompt→Production library. Seeded automatically on boot (see
// seedBuiltInStarters, called from src/server/bootstrap.ts) so the library is populated
// with no manual "load" step. Each entry is keyed by a stable `slug` so renames/copy edits
// upsert in place across deploys. Internal provenance lives in content._buildRef and is
// stripped by serializeStarter before it can reach any UI/API payload — nothing external is
// ever shown; these are presented as our own authored catalog.

export interface BuiltInStarter {
  slug: string;
  name: string;
  summary: string;
  description: string;
  type: StarterType;
  tags: string[];
  content: StarterContent;
}

export const STARTER_BUILT_INS: BuiltInStarter[] = [
  {
    slug: "humanizer",
    name: "Humanizer",
    summary: "Strips AI-writing tells from generated copy so it reads human.",
    description:
      "A writing **skill** that rewrites AI-generated text to remove the tells — significance inflation, em-dash overuse, hedging, filler and chatbot artifacts — across content, language, style and communication patterns. Reach for it whenever a project's marketing copy, docs or emails need to sound like a person wrote them.",
    type: "SKILL",
    tags: ["content", "writing", "marketing-copy"],
    content: {
      whatYouGet: [
        "A drop-in skill that detects and rewrites 30+ AI-writing patterns",
        "Coverage across content, language, style and communication tells",
        "Works on marketing copy, docs, emails and UI microcopy",
      ],
      install: ["Add the skill to the project's skill set", "Invoke it on any draft to humanize the tone"],
      _buildRef: "humanizer",
    },
  },
  {
    slug: "skills-library",
    name: "Skills Library",
    summary: "A curated foundation of reusable skills — the pool we grow Skill starters from.",
    description:
      "A **collection**: a curated foundation of reusable skills spanning document processing, dev tooling, data & analysis, marketing, communication and automation. The pool we draw from (and productise) when adding new Skill starters to the library.",
    type: "COLLECTION",
    tags: ["skills", "directory", "source"],
    content: {
      whatYouGet: [
        "A broad, categorised pool of reusable skills",
        "The source we curate individual Skill starters from",
        "Coverage across docs, code, data, marketing and automation",
      ],
      _buildRef: "awesome-claude-skills",
    },
  },
  {
    slug: "projects-index",
    name: "Projects Index",
    summary: "A map of project blueprints and plugin clusters that structures the library.",
    description:
      "A **collection** that maps project blueprints and plugin clusters by use case. The reference that shapes how the Starters library itself is organised, and a source of plugin building blocks.",
    type: "COLLECTION",
    tags: ["projects", "plugins", "reference"],
    content: {
      whatYouGet: [
        "A categorised index of project blueprints",
        "Plugin clusters grouped by use case",
        "The structural reference behind the Starters library",
      ],
      _buildRef: "Claude-Code-Projects-Index",
    },
  },
  {
    slug: "launch-kit",
    name: "Launch Kit",
    summary: "The flagship Prompt→Production scaffold: rules, commands, hooks, skills, templates.",
    description:
      "The flagship **kit** — the definitive starting point for a new project. Ships battle-tested rules, slash commands, lifecycle hooks, skills and project templates so a codebase has quality gates and structure from day one. The fastest way to take a project from prompt toward production.",
    type: "KIT",
    tags: ["scaffolding", "code-quality", "hooks", "commands"],
    content: {
      whatYouGet: [
        "Battle-tested project rules (security, TypeScript, DB, testing, deploy)",
        "A library of slash commands for common workflows",
        "Lifecycle hooks that enforce quality gates automatically",
        "Context-aware skills for review, debugging and testing",
        "Project scaffolding templates for multiple stacks",
      ],
      install: [
        "Scaffold a new project from the kit",
        "Adopt the rules file and enable the hooks",
        "Wire the commands into the team workflow",
      ],
      techStack: ["Node.js", "Go", "Python", "React", "Vue", "Django"],
      _buildRef: "mastery-project-starter-kit",
    },
  },
  {
    slug: "design-system",
    name: "Design System",
    summary: "Design-system harness: tokens, guidelines and design/audit skills.",
    description:
      "A **kit** that keeps a project's design system in the room on every screen. Binds design tokens and guidelines so components, spacing and branding stay consistent, and ships audit skills for accessibility, mobile, copy, styling, visual and layout — plus a framework handoff for code export.",
    type: "KIT",
    tags: ["design-system", "audit", "ui"],
    content: {
      whatYouGet: [
        "A design-tokens + guidelines binding that persists across sessions",
        "Audit skills: accessibility, mobile, copy, styling, visual, layout",
        "A framework handoff for exporting to code",
      ],
      install: ["Define the design tokens + voice", "Run the audit lanes on each screen", "Hand off to the target framework"],
      _buildRef: "claude-design-premium",
    },
  },
  {
    slug: "sites",
    name: "Sites",
    summary: "Self-hosted visual CMS — a deployable site foundation.",
    description:
      "A **kit** for shipping a site fast: a self-hosted visual CMS where the editor, content engine and publisher live in one server, producing clean semantic HTML. A deployable foundation for content-driven sites.",
    type: "KIT",
    tags: ["website", "cms", "deployable"],
    content: {
      whatYouGet: [
        "A visual canvas editor with responsive breakpoints",
        "Content types, data tables and built-in forms",
        "Clean semantic HTML output — no framework runtime left in pages",
        "One-click deployment",
      ],
      install: ["Deploy the server", "Model the content types", "Build and publish pages from the visual editor"],
      techStack: ["TypeScript", "React", "PostgreSQL"],
      _buildRef: "instatic",
    },
  },
  {
    slug: "web-starter",
    name: "Web Starter",
    summary: "AI-first marketing-site scaffold, ready to brand and ship.",
    description:
      "A **kit** for standing up a marketing site quickly: an AI-first scaffold with centralised identity config, reusable components and a CMS integration, plus a rules file that lets an agent build pages correctly on the first pass. Brand it and ship.",
    type: "KIT",
    tags: ["website", "marketing-site", "astro"],
    content: {
      whatYouGet: [
        "A marketing-site scaffold with centralised identity config",
        "Reusable components and a CSS-variable design system",
        "A headless CMS integration for content",
        "An agent-ready rules file for first-pass page builds",
      ],
      install: ["Fork the scaffold", "Set the identity + deployment config", "Wire the CMS and deploy"],
      techStack: ["Astro", "Sanity", "Cloudflare"],
      _buildRef: "clcreative-AI-first-website-starter",
    },
  },
  {
    slug: "taste",
    name: "Taste",
    summary: "Gives generated frontends real taste — stops the boring, generic slop.",
    description:
      "A **skill** that raises the quality bar on generated UI: it steers layout, type, spacing and colour away from the flat, generic defaults an agent reaches for, toward something that looks considered. Pairs with Design System (structure) and Humanizer (copy) so a project's whole surface reads intentional.",
    type: "SKILL",
    tags: ["design", "frontend", "ui", "taste"],
    content: {
      whatYouGet: [
        "A design-taste skill that lifts generated UI above generic defaults",
        "Better layout, type, spacing and colour decisions out of the box",
        "Complements Design System (structure) and Humanizer (copy)",
      ],
      install: ["Add the skill to the project's skill set", "Invoke it while building or reviewing UI"],
      _buildRef: "taste-skill",
    },
  },
  {
    slug: "planner",
    name: "Planner",
    summary: "Crash-proof, file-based planning for long agentic runs.",
    description:
      "A **skill** for keeping big builds on track: it writes the plan to markdown on disk so it survives context loss and `/clear`, tracks progress against a deterministic completion gate, and lets multiple agents share state. The reliability layer under Prompt→Production itself.",
    type: "SKILL",
    tags: ["planning", "workflow", "agentic"],
    content: {
      whatYouGet: [
        "Persistent, file-based plans that survive context loss",
        "A deterministic completion gate so work isn't left half-done",
        "Shared on-disk state for multi-step / multi-agent runs",
      ],
      install: ["Add the skill", "Let the agent write and follow the plan file across the build"],
      _buildRef: "planning-with-files",
    },
  },
  {
    slug: "flow",
    name: "Flow",
    summary: "Spec-driven delivery workflow: task tracking, worker subagents, cross-model review.",
    description:
      "A **plugin** that turns a brief into a tracked, spec-driven build: it breaks work into tasks, dispatches worker subagents, and runs cross-model reviews before things land. The delivery loop that carries a project from spec to shipped.",
    type: "PLUGIN",
    tags: ["workflow", "spec-driven", "subagents", "review"],
    content: {
      whatYouGet: [
        "Spec-driven task breakdown with zero-dependency tracking",
        "Worker subagents that execute tasks in parallel",
        "Cross-model reviews as a quality gate before merge",
      ],
      install: ["Install the plugin", "Point it at a spec", "Review the tracked tasks as they complete"],
      _buildRef: "flow-next",
    },
  },
  {
    slug: "agents",
    name: "Agents",
    summary: "A pool of role subagents and workflows to grow specialised agents from.",
    description:
      "A **collection** of role-specialised subagents and multi-agent workflows — the pool we draw from (and productise) when a project needs a focused agent rather than a general one. The agents analogue of the Skills Library.",
    type: "COLLECTION",
    tags: ["agents", "subagents", "roles"],
    content: {
      whatYouGet: [
        "A broad pool of role-specialised subagents",
        "Multi-agent workflows and orchestration patterns",
        "The source we curate individual agent starters from",
      ],
      _buildRef: "wshobson/agents",
    },
  },
  {
    slug: "security",
    name: "Security",
    summary: "Security & audit skills mapped to common frameworks — feeds Pulse security checks.",
    description:
      "A **collection** of structured security and audit skills covering threat modelling, hardening, incident response and compliance, mapped to recognised frameworks. Directly complements the security category of a Pulse scan.",
    type: "COLLECTION",
    tags: ["security", "audit", "compliance"],
    content: {
      whatYouGet: [
        "Structured security skills across many domains",
        "Mappings to recognised security & compliance frameworks",
        "A natural companion to Pulse's security checks",
      ],
      _buildRef: "Anthropic-Cybersecurity-Skills (Apache-2.0)",
    },
  },
  {
    slug: "integrations",
    name: "Integrations",
    summary: "Production integrations — Figma, Playwright, Vercel, Supabase, Linear, Sentry, Stripe.",
    description:
      "A **collection** of the production integrations that close the Prompt→Production loop: design (Figma), testing (Playwright), deploy (Vercel), data (Supabase), project tracking (Linear), monitoring (Sentry) and payments (Stripe). The wiring a shipped project actually needs.",
    type: "COLLECTION",
    tags: ["integrations", "mcp", "deployment"],
    content: {
      whatYouGet: [
        "Design → code via Figma",
        "Browser automation + E2E via Playwright",
        "Deploy + logs via Vercel; data via Supabase",
        "Tracking (Linear), monitoring (Sentry) and payments (Stripe)",
      ],
      _buildRef: "official Claude Code marketplace partners (Figma/Playwright/Vercel/Supabase/Linear/Sentry/Stripe)",
    },
  },
  {
    slug: "marketing",
    name: "Marketing",
    summary: "CRO, SEO, copywriting, analytics and growth engineering for client work.",
    description:
      "A **collection** of marketing skills covering the whole growth surface — conversion-rate optimisation, SEO, copywriting, analytics and growth engineering. The toolkit for taking a client's product to market once it's built.",
    type: "COLLECTION",
    tags: ["marketing", "seo", "copywriting", "growth"],
    content: {
      whatYouGet: [
        "Conversion-rate optimisation and landing-page playbooks",
        "SEO and content strategy",
        "Copywriting across ads, email and site",
        "Analytics and growth-engineering methods",
      ],
      _buildRef: "marketingskills",
    },
  },
  {
    slug: "product",
    name: "Product",
    summary: "PM frameworks for turning an idea into a buildable spec.",
    description:
      "A **collection** of product-management skills — discovery, prioritisation, specs and roadmaps — built on battle-tested methods. The front of Prompt→Production: it turns a rough idea into something a team can actually build.",
    type: "COLLECTION",
    tags: ["product", "discovery", "specs"],
    content: {
      whatYouGet: [
        "Discovery and user-research framing",
        "Prioritisation frameworks",
        "Spec / PRD authoring",
        "Roadmap and stakeholder alignment",
      ],
      _buildRef: "Product-Manager-Skills",
    },
  },
  {
    slug: "testing",
    name: "Testing",
    summary: "Model-invoked E2E / browser tests as a quality gate before shipping.",
    description:
      "A **skill** that autonomously writes and runs browser automation to test and validate a build — it drives the browser, exercises the key flows and reports what breaks. A production quality gate, not just unit tests.",
    type: "SKILL",
    tags: ["testing", "qa", "e2e"],
    content: {
      whatYouGet: [
        "Model-invoked browser automation",
        "End-to-end validation of the key user flows",
        "Catches regressions before a deploy goes out",
      ],
      install: ["Add the skill", "Point it at the app and let it exercise the critical flows"],
      _buildRef: "playwright-skill",
    },
  },
  {
    slug: "analytics",
    name: "Analytics",
    summary: "A context layer for querying a client's analytics data accurately.",
    description:
      "A **collection** that gives agents an executable context layer over a client's analytical databases — a semantic layer plus company context and query tooling — so data questions get answered accurately instead of hallucinated.",
    type: "COLLECTION",
    tags: ["data", "analytics", "sql"],
    content: {
      whatYouGet: [
        "An executable context / semantic layer over analytical databases",
        "Accurate natural-language querying with full company context",
        "Data-engineering and BI groundwork",
      ],
      _buildRef: "ktx",
    },
  },
  {
    slug: "devops",
    name: "DevOps",
    summary: "CI/CD, containerisation, deploys and monitoring — the production side.",
    description:
      "A **collection** covering the production side of a build — CI/CD pipelines, containerisation, deploys and rollbacks, and monitoring — so a project ships and stays up. Authored in-house rather than sourced.",
    type: "COLLECTION",
    tags: ["devops", "ci-cd", "infra", "deploy"],
    content: {
      whatYouGet: [
        "CI/CD pipeline patterns",
        "Docker / containerisation",
        "Deploy and rollback playbooks",
        "Monitoring and alerting setup",
      ],
      _buildRef: "gitwork-authored",
    },
  },
  {
    slug: "mobile",
    name: "Mobile",
    summary: "iOS (SwiftUI) and Android (Compose) dev skills — architecture to shipping.",
    description:
      "A **collection** of mobile-development skills across iOS (SwiftUI) and Android (Jetpack Compose / Kotlin Multiplatform) — architecture, networking, data, concurrency, testing, accessibility and performance. Relevant to Foundry's own iOS app and to client mobile work.",
    type: "COLLECTION",
    tags: ["mobile", "ios", "android", "swiftui"],
    content: {
      whatYouGet: [
        "SwiftUI + iOS architecture, networking and concurrency",
        "Jetpack Compose / Kotlin Multiplatform patterns",
        "Mobile testing, accessibility and performance",
      ],
      _buildRef: "ios-agent-skills + compose-skill",
    },
  },
  {
    slug: "ship-it",
    name: "Ship It",
    summary: "Take a Lovable / Bolt / Replit build from prototype to production.",
    description:
      "A **kit** for hardening a vibe-coded app — Lovable, Bolt or Replit — into something you can actually ship. Enables Supabase Row-Level Security on every table, sweeps the bundle for exposed keys, moves authorisation server-side, ejects the code into a real repo with CI, and wires custom domain, SEO, analytics and error monitoring. The missing step between a prototype and production.",
    type: "KIT",
    tags: ["vibe-coding", "lovable", "bolt", "replit", "supabase", "rls", "security", "deploy"],
    content: {
      whatYouGet: [
        "Row-Level Security enablement + owner-scoped policy templates for every Supabase table",
        "Secret sweep — find exposed anon/API keys baked into the client bundle",
        "Server-side authorisation to replace client-only auth checks",
        "Eject to a real repo with CI/CD and a baseline test suite",
        "Custom domain, SEO, analytics and error-monitoring wiring",
      ],
      install: [
        "Point it at the exported Lovable / Bolt / Replit project",
        "Run the hardening audit (RLS, secrets, auth)",
        "Apply the fixes and eject to a production repo",
      ],
      _buildRef: "database-sentinel + supabase-pentest-skills + supashield + vibe-security",
    },
  },
];

// ── Source references ("view & use") ─────────────────────────────────────────────
// Each built-in is built on top of an upstream repo/skill (tracked internally in
// content._buildRef). We surface a public source link so a starter can actually be viewed and
// grabbed. Direct repo URLs for the ones we've pinned; everything else resolves to a GitHub
// repository search seeded with the ref, so the "View & use" link is always valid (never a 404).
// Refs that are our own / multi-source (no single upstream) get no link.

const KNOWN_SOURCE_URLS: Record<string, string> = {
  "wshobson/agents": "https://github.com/wshobson/agents",
  "Anthropic-Cybersecurity-Skills (Apache-2.0)": "https://github.com/anthropics/skills",
};

/** Refs that are authored in-house or span many sources — no single repo to link out to. */
const NO_SOURCE = [/gitwork-authored/i, /marketplace partners/i];

function humanLabelFor(ref: string): string {
  // Strip a trailing "(license)" note and a leading "owner/" for a compact label.
  const noLicense = ref.replace(/\s*\(.*?\)\s*$/, "").trim();
  return noLicense.includes("/") ? noLicense.split("/").pop()! : noLicense;
}

function sourceFor(ref?: string): { sourceLabel?: string; sourceUrl?: string } {
  if (!ref) return {};
  const label = humanLabelFor(ref);
  if (NO_SOURCE.some((re) => re.test(ref))) return { sourceLabel: label };
  const url =
    KNOWN_SOURCE_URLS[ref] ??
    `https://github.com/search?q=${encodeURIComponent(humanLabelFor(ref))}&type=repositories`;
  return { sourceLabel: label, sourceUrl: url };
}

/**
 * Idempotently seed the built-in starters for a workspace. Upserts each by its stable slug
 * (so copy/name edits propagate on deploy and ids stay stable across boots), then removes any
 * stale built-ins no longer in the catalog (e.g. renamed slugs). Safe to run on every boot.
 */
export async function seedBuiltInStarters(workspaceId: string): Promise<number> {
  const slugs = STARTER_BUILT_INS.map((s) => s.slug);
  for (const s of STARTER_BUILT_INS) {
    // Merge in the public source reference derived from the internal _buildRef.
    const content = { ...s.content, ...sourceFor(s.content._buildRef) } as unknown as Prisma.InputJsonValue;
    await prisma.starter.upsert({
      where: { slug: s.slug },
      update: {
        name: s.name,
        summary: s.summary,
        description: s.description,
        type: s.type,
        tags: s.tags,
        content,
        isDefault: true,
        isArchived: false,
      },
      create: {
        workspaceId,
        slug: s.slug,
        name: s.name,
        summary: s.summary,
        description: s.description,
        type: s.type,
        status: "PUBLISHED",
        tags: s.tags,
        content,
        isDefault: true,
      },
    });
  }
  // Drop any previously-seeded built-ins that are no longer in the catalog (e.g. old slugs).
  await prisma.starter.deleteMany({
    where: { workspaceId, isDefault: true, slug: { notIn: slugs } },
  });
  return STARTER_BUILT_INS.length;
}
